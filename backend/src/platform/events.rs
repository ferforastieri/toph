use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use tokio::sync::broadcast;
use walkdir::WalkDir;

use crate::errors::{AppError, AppResult};

const MAX_WATCHED_DIRECTORIES: usize = 4096;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub project_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub at: i64,
}

#[derive(Clone)]
pub struct EventHub {
    sender: broadcast::Sender<ProjectEvent>,
}

impl EventHub {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(256);
        Self { sender }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ProjectEvent> {
        self.sender.subscribe()
    }

    pub fn publish(&self, project_id: &str, event_type: &str, path: Option<String>) {
        if project_id.is_empty() {
            return;
        }
        let _ = self.sender.send(ProjectEvent {
            event_type: event_type.to_string(),
            project_id: project_id.to_string(),
            path,
            at: chrono::Utc::now().timestamp_millis(),
        });
    }
}

pub struct ProjectWatcher {
    hub: EventHub,
    watchers: Mutex<HashMap<String, Arc<Mutex<notify::RecommendedWatcher>>>>,
}

impl ProjectWatcher {
    pub fn new(hub: EventHub) -> Self {
        Self {
            hub,
            watchers: Mutex::new(HashMap::new()),
        }
    }

    pub fn watch(&self, project_id: &str, root: &Path, recursive: bool) -> AppResult<()> {
        let mut watchers = self
            .watchers
            .lock()
            .map_err(|_| crate::errors::internal("watcher lock"))?;
        if watchers.contains_key(project_id) {
            return Ok(());
        }
        // Bound bursts from builds/checkouts without blocking the OS watcher.
        // Every queued event invalidates the project view, so dropping excess
        // paths still results in a refresh of the current filesystem state.
        let (sender, receiver) = std::sync::mpsc::sync_channel(256);
        let overflow = Arc::new(AtomicBool::new(false));
        let overflow_callback = overflow.clone();
        let watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
            if matches!(&event, Ok(event) if matches!(event.kind, EventKind::Access(_))) {
                return;
            }
            if matches!(
                sender.try_send(event),
                Err(std::sync::mpsc::TrySendError::Full(_))
            ) {
                overflow_callback.store(true, Ordering::Relaxed);
            }
        })
        .map_err(|error| AppError::Internal(error.into()))?;
        let watcher = Arc::new(Mutex::new(watcher));
        // Watching the root itself is cheap. Loading the full tree can be slow
        // for very large workspaces, so the recursive walk stays off the
        // startup path in the watcher thread.
        if let Ok(mut guard) = watcher.lock() {
            let _ = guard.watch(root, RecursiveMode::NonRecursive);
        }
        let root = root.to_path_buf();
        let hub = self.hub.clone();
        let project_id = project_id.to_string();
        // The registry owns the watcher. A worker must not keep the sender
        // alive after unwatch/stop_all, otherwise its receiver never closes.
        let watcher_for_thread = Arc::downgrade(&watcher);
        let root_for_thread = root.clone();
        let project_id_for_thread = project_id.clone();
        std::thread::spawn(move || {
            if let Some(watcher) = watcher_for_thread.upgrade() {
                if let Ok(mut guard) = watcher.lock() {
                    if recursive {
                        let _ = watch_tree(&mut guard, &root_for_thread, &root_for_thread);
                    }
                    let git_dir = root_for_thread.join(".git");
                    let _ = guard.watch(&git_dir, RecursiveMode::NonRecursive);
                    let _ = watch_tree(&mut guard, &git_dir.join("refs"), &root_for_thread);
                }
            }
            struct PendingWatch {
                deadline: Instant,
                path: PathBuf,
            }
            // Files and git metadata are tracked separately: `git status`
            // touches `.git/index` while a file event is pending, and a single
            // shared slot used to replace the file event with the git one.
            let mut pending_files: Option<PendingWatch> = None;
            let mut pending_git: Option<PendingWatch> = None;
            let flush = |slot: &mut Option<PendingWatch>| {
                let Some(pending) = slot.take() else {
                    return;
                };
                let relative = pending
                    .path
                    .strip_prefix(&root_for_thread)
                    .unwrap_or(&pending.path)
                    .to_string_lossy()
                    .replace('\\', "/");
                // Refreshing the index is part of reading git; publishing it
                // would make `git status` trigger another `git status`.
                if relative == ".git/index" || relative == ".git/index.lock" {
                    return;
                }
                let kind = if relative == ".git" || relative.starts_with(".git/") {
                    "git"
                } else {
                    "files"
                };
                tracing::debug!(project = %project_id_for_thread, kind, path = %relative, "project watch event");
                hub.publish(&project_id_for_thread, kind, Some(relative));
            };
            loop {
                if overflow.swap(false, Ordering::Relaxed) {
                    // A directory creation may have been coalesced away.
                    // Reconcile watch registrations and invalidate both views.
                    if recursive {
                        if let Some(watcher) = watcher_for_thread.upgrade() {
                            if let Ok(mut watcher) = watcher.lock() {
                                let _ =
                                    watch_tree(&mut watcher, &root_for_thread, &root_for_thread);
                            }
                        }
                    }
                    hub.publish(&project_id_for_thread, "sync", None);
                }
                let now = Instant::now();
                if pending_files
                    .as_ref()
                    .is_some_and(|pending| now >= pending.deadline)
                {
                    flush(&mut pending_files);
                }
                if pending_git
                    .as_ref()
                    .is_some_and(|pending| now >= pending.deadline)
                {
                    flush(&mut pending_git);
                }
                let timeout = [pending_files.as_ref(), pending_git.as_ref()]
                    .into_iter()
                    .flatten()
                    .map(|pending| pending.deadline)
                    .min()
                    .map(|deadline| deadline.saturating_duration_since(Instant::now()))
                    .unwrap_or(Duration::from_secs(10));
                match receiver.recv_timeout(timeout) {
                    Ok(Ok(event)) => {
                        if recursive {
                            if let EventKind::Create(_) = event.kind {
                                for path in &event.paths {
                                    if path.is_dir()
                                        && !ignored_dir(
                                            path.file_name()
                                                .and_then(|value| value.to_str())
                                                .unwrap_or(""),
                                        )
                                    {
                                        if let Some(watcher) = watcher_for_thread.upgrade() {
                                            if let Ok(mut watcher) = watcher.lock() {
                                                let _ = watch_tree(
                                                    &mut watcher,
                                                    path,
                                                    &root_for_thread,
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if let Some(path) = event.paths.last() {
                            let relative = path
                                .strip_prefix(&root_for_thread)
                                .unwrap_or(path)
                                .to_string_lossy()
                                .replace('\\', "/");
                            if relative != ".git/index" && relative != ".git/index.lock" {
                                let is_git = relative == ".git" || relative.starts_with(".git/");
                                let slot = if is_git {
                                    &mut pending_git
                                } else {
                                    &mut pending_files
                                };
                                match slot {
                                    Some(pending) => pending.path = path.clone(),
                                    None => {
                                        *slot = Some(PendingWatch {
                                            deadline: Instant::now() + Duration::from_millis(250),
                                            path: path.clone(),
                                        })
                                    }
                                }
                            }
                        }
                    }
                    Ok(Err(_)) => {}
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }
        });
        watchers.insert(project_id, watcher);
        Ok(())
    }

    pub fn unwatch(&self, project_id: &str) {
        if let Ok(mut watchers) = self.watchers.lock() {
            watchers.remove(project_id);
        }
    }

    pub fn stop_all(&self) {
        if let Ok(mut watchers) = self.watchers.lock() {
            watchers.clear();
        }
    }

    pub fn watch_existing(&self, projects: &[crate::model::Project], workspace_roots: &[PathBuf]) {
        for project in projects {
            let root = Path::new(&project.root);
            let nested = projects.iter().any(|other| {
                other.id != project.id
                    && Path::new(&other.root) != root
                    && Path::new(&other.root).starts_with(root)
            });
            let at_workspace_root = workspace_roots.iter().any(|workspace| workspace == root);
            let recursive = !(at_workspace_root && nested);
            if let Err(error) = self.watch(&project.id, root, recursive) {
                tracing::warn!(%error, project = %project.id, "could not watch project");
            }
        }
    }
}

fn watch_tree(
    watcher: &mut notify::RecommendedWatcher,
    path: &Path,
    root: &Path,
) -> std::io::Result<()> {
    let mut watched = 0;
    for entry in WalkDir::new(path)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            entry.depth() == 0
                || !entry.file_type().is_dir()
                || !ignored_dir(&entry.file_name().to_string_lossy())
        })
        .filter_map(Result::ok)
    {
        if entry.path() == root.join(".git") || entry.path().starts_with(root.join(".git")) {
            continue;
        }
        if entry.file_type().is_dir() {
            if watched >= MAX_WATCHED_DIRECTORIES {
                break;
            }
            if watcher
                .watch(entry.path(), RecursiveMode::NonRecursive)
                .is_ok()
            {
                watched += 1;
            }
        }
    }
    Ok(())
}

fn ignored_dir(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "dist" | "build" | "target" | ".cache" | ".next" | "coverage"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn watcher_publishes_file_events() {
        let dir = tempfile::tempdir().unwrap();
        let hub = EventHub::new();
        let mut receiver = hub.subscribe();
        let registry = ProjectWatcher::new(hub);
        registry.watch("project", dir.path(), true).unwrap();
        tokio::time::sleep(Duration::from_millis(150)).await;
        std::fs::write(dir.path().join("agent.txt"), "x").unwrap();
        let event = tokio::time::timeout(Duration::from_secs(3), receiver.recv())
            .await
            .expect("no filesystem event")
            .expect("event hub closed");
        assert_eq!(event.event_type, "files");
        assert_eq!(event.project_id, "project");
    }

    #[tokio::test]
    async fn unwatch_releases_os_watcher_and_worker_sender() {
        let dir = tempfile::tempdir().unwrap();
        let registry = ProjectWatcher::new(EventHub::new());
        registry.watch("project", dir.path(), false).unwrap();
        let weak = Arc::downgrade(registry.watchers.lock().unwrap().get("project").unwrap());
        registry.unwatch("project");
        tokio::time::timeout(Duration::from_secs(2), async {
            while weak.upgrade().is_some() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("worker retained the watcher after unwatch");
    }
}
