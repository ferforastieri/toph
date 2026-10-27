use std::collections::HashMap;
use std::path::{Path, PathBuf};
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
        if self
            .watchers
            .lock()
            .map_err(|_| crate::errors::internal("watcher lock"))?
            .contains_key(project_id)
        {
            return Ok(());
        }
        let (sender, receiver) = std::sync::mpsc::channel();
        let watcher = notify::recommended_watcher(move |event| {
            let _ = sender.send(event);
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
        let watcher_for_thread = watcher.clone();
        let root_for_thread = root.clone();
        let project_id_for_thread = project_id.clone();
        std::thread::spawn(move || {
            if let Ok(mut guard) = watcher_for_thread.lock() {
                if recursive {
                    let _ = watch_tree(&mut guard, &root_for_thread, &root_for_thread);
                }
                let git_dir = root_for_thread.join(".git");
                let _ = guard.watch(&git_dir, RecursiveMode::NonRecursive);
                let _ = watch_tree(&mut guard, &git_dir.join("refs"), &root_for_thread);
            }
            let mut pending: Option<(Instant, PathBuf)> = None;
            loop {
                let timeout = pending
                    .as_ref()
                    .map(|(deadline, _)| deadline.saturating_duration_since(Instant::now()))
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
                                        if let Ok(mut watcher) = watcher_for_thread.lock() {
                                            let _ =
                                                watch_tree(&mut watcher, path, &root_for_thread);
                                        }
                                    }
                                }
                            }
                        }
                        if let Some(path) = event.paths.last() {
                            let deadline = Instant::now() + Duration::from_millis(250);
                            pending = Some((deadline, path.clone()));
                        }
                    }
                    Ok(Err(_)) => {}
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        if let Some((deadline, path)) = pending.take() {
                            if Instant::now() >= deadline {
                                let relative = path
                                    .strip_prefix(&root_for_thread)
                                    .unwrap_or(&path)
                                    .to_string_lossy()
                                    .replace('\\', "/");
                                let kind = if relative == ".git" || relative.starts_with(".git/") {
                                    "git"
                                } else {
                                    "files"
                                };
                                hub.publish(&project_id_for_thread, kind, Some(relative));
                            } else {
                                pending = Some((deadline, path));
                            }
                        }
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }
        });
        self.watchers
            .lock()
            .map_err(|_| crate::errors::internal("watcher map"))?
            .insert(project_id, watcher);
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
