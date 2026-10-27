use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, RwLock};

use chrono::{DateTime, Utc};
use tokio::process::Command;
use walkdir::WalkDir;

use crate::errors::{AppError, AppResult};
use crate::model::{
    FileContent, FileEntry, GitBlameLine, GitBranches, GitHistoryEntry, Repository, SearchMatch,
};

const MAX_READ_SIZE: u64 = 5 * 1024 * 1024;

fn ignored_dir(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "node_modules"
            | ".next"
            | "dist"
            | "build"
            | ".cache"
            | "vendor"
            | ".gradle"
            | ".idea"
            | ".vscode"
            | "target"
            | "bin"
    )
}

#[derive(Clone)]
pub struct WorkspaceService {
    roots: Arc<RwLock<Vec<PathBuf>>>,
}

impl WorkspaceService {
    pub fn new(roots: Vec<PathBuf>) -> AppResult<Self> {
        let resolved = resolve_roots(&roots)?;
        Ok(Self {
            roots: Arc::new(RwLock::new(resolved)),
        })
    }

    pub fn roots(&self) -> Vec<PathBuf> {
        self.roots
            .read()
            .map(|roots| roots.clone())
            .unwrap_or_default()
    }

    pub fn set_roots(&self, roots: Vec<PathBuf>) -> AppResult<()> {
        let resolved = resolve_roots(&roots)?;
        if let Ok(mut current) = self.roots.write() {
            *current = resolved;
        }
        Ok(())
    }

    pub fn add_root(&self, root: &Path) -> AppResult<PathBuf> {
        let resolved = resolve_root(root)?;
        let mut roots = self
            .roots
            .write()
            .map_err(|_| crate::errors::internal("root lock"))?;
        if !roots.iter().any(|existing| existing == &resolved) {
            roots.push(resolved.clone());
        }
        Ok(resolved)
    }

    pub fn remove_root(&self, root: &Path) -> AppResult<()> {
        let resolved = resolve_root(root)?;
        let mut roots = self
            .roots
            .write()
            .map_err(|_| crate::errors::internal("root lock"))?;
        if let Some(index) = roots.iter().position(|existing| existing == &resolved) {
            roots.remove(index);
            return Ok(());
        }
        Err(AppError::Forbidden)
    }

    pub fn validate_root(&self, root: &Path) -> AppResult<PathBuf> {
        let resolved = resolve_root(root)?;
        let allowed = self.roots();
        if allowed
            .iter()
            .any(|allowed| resolved == *allowed || resolved.starts_with(allowed))
        {
            return Ok(resolved);
        }
        Err(AppError::Forbidden)
    }

    pub fn list(&self, root: &Path, relative: &str) -> AppResult<Vec<FileEntry>> {
        let dir = resolve_existing(root, relative)?;
        if !dir.is_dir() {
            return Err(crate::errors::bad_request(format!(
                "{relative:?} is not a directory"
            )));
        }
        let mut entries = Vec::new();
        for item in fs::read_dir(&dir)? {
            let Ok(item) = item else { continue };
            let name = item.file_name().to_string_lossy().to_string();
            if ignored_dir(&name) {
                continue;
            }
            let Ok(metadata) = item.metadata() else {
                continue;
            };
            let path = dir.join(&name);
            let Ok(relative_path) = path.strip_prefix(root) else {
                continue;
            };
            entries.push(FileEntry {
                name,
                path: relative_path.to_string_lossy().replace('\\', "/"),
                dir: metadata.is_dir(),
                size: metadata.len() as i64,
                mod_time: modified(&metadata),
            });
        }
        entries.sort_by(|a, b| {
            b.dir
                .cmp(&a.dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(entries)
    }

    pub fn read(&self, root: &Path, relative: &str) -> AppResult<FileContent> {
        let path = resolve_existing(root, relative)?;
        let metadata = fs::metadata(&path)?;
        if metadata.is_dir() {
            return Err(crate::errors::bad_request(format!(
                "{relative:?} is a directory"
            )));
        }
        if metadata.len() > MAX_READ_SIZE {
            return Err(AppError::TooLarge);
        }
        let data = fs::read(&path)?;
        if data.iter().take(8192).any(|byte| *byte == 0) {
            return Err(AppError::Binary);
        }
        let relative_path = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        Ok(FileContent {
            path: relative_path,
            content: String::from_utf8_lossy(&data).to_string(),
            hash: crate::crypto::sha256_hex(&data),
            mod_time: modified(&metadata),
            size: metadata.len() as i64,
        })
    }

    pub fn write(
        &self,
        root: &Path,
        relative: &str,
        content: &str,
        base_hash: &str,
    ) -> AppResult<FileContent> {
        let path = resolve_for_write(root, relative)?;
        if let Ok(metadata) = fs::metadata(&path) {
            if metadata.is_dir() {
                return Err(crate::errors::bad_request(format!(
                    "{relative:?} is a directory"
                )));
            }
            if !base_hash.is_empty() {
                let current = fs::read(&path)?;
                if crate::crypto::sha256_hex(&current) != base_hash {
                    return Err(AppError::FileConflict);
                }
            }
        }
        let parent = path.parent().ok_or(AppError::Forbidden)?;
        let permissions = fs::metadata(&path)
            .map(|metadata| metadata.permissions())
            .or_else(|_| {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    Ok::<std::fs::Permissions, std::io::Error>(std::fs::Permissions::from_mode(
                        0o644,
                    ))
                }
                #[cfg(not(unix))]
                {
                    fs::metadata(parent).map(|metadata| metadata.permissions())
                }
            })?;
        let mut temporary = tempfile::Builder::new()
            .prefix(".toph-")
            .tempfile_in(parent)?;
        temporary.as_file().set_permissions(permissions)?;
        temporary.write_all(content.as_bytes())?;
        temporary.as_file().sync_all()?;
        temporary
            .persist(&path)
            .map_err(|error| AppError::Io(error.error))?;
        self.read(root, relative)
    }

    pub fn create_dir(&self, root: &Path, relative: &str) -> AppResult<()> {
        let path = resolve_for_write(root, relative)?;
        fs::create_dir_all(path)?;
        Ok(())
    }

    pub fn write_bytes(&self, root: &Path, relative: &str, content: &[u8]) -> AppResult<i64> {
        let path = resolve_for_write(root, relative)?;
        let parent = path.parent().ok_or(AppError::Forbidden)?;
        let mut temporary = tempfile::Builder::new()
            .prefix(".toph-")
            .tempfile_in(parent)?;
        temporary.write_all(content)?;
        temporary.as_file().sync_all()?;
        temporary
            .persist(&path)
            .map_err(|error| AppError::Io(error.error))?;
        Ok(content.len() as i64)
    }

    pub fn read_bytes(&self, root: &Path, relative: &str) -> AppResult<Vec<u8>> {
        let path = resolve_existing(root, relative)?;
        let metadata = fs::metadata(&path)?;
        if metadata.is_dir() {
            return Err(AppError::BadRequest("path is a directory".into()));
        }
        if metadata.len() > MAX_READ_SIZE * 4 {
            return Err(AppError::TooLarge);
        }
        Ok(fs::read(path)?)
    }

    pub async fn git_history(&self, root: &Path, path: &str) -> AppResult<Vec<GitHistoryEntry>> {
        let path = validate_git_path(path)?;
        let is_directory = root.join(&path).is_dir();
        let mut args = vec!["log"];
        if !is_directory {
            args.push("--follow");
        }
        args.extend([
            "-n",
            "80",
            "--format=%H%x1f%an%x1f%aI%x1f%s",
            "--",
            path.as_str(),
        ]);
        let output = git_output(root, &args).await?;
        Ok(output
            .lines()
            .filter_map(|line| {
                let mut fields = line.splitn(4, '\u{1f}');
                Some(GitHistoryEntry {
                    hash: fields.next()?.to_string(),
                    author: fields.next()?.to_string(),
                    date: fields.next()?.to_string(),
                    subject: fields.next()?.to_string(),
                })
            })
            .collect())
    }

    pub async fn search(
        &self,
        root: &Path,
        query: &str,
        max_results: usize,
    ) -> AppResult<Vec<SearchMatch>> {
        if query.trim().is_empty() {
            return Ok(Vec::new());
        }
        let max_results = if max_results == 0 || max_results > 500 {
            100
        } else {
            max_results
        };
        let root = root.to_path_buf();
        let query = query.to_string();
        tokio::task::spawn_blocking(move || search_blocking(&root, &query, max_results))
            .await
            .map_err(|error| crate::errors::internal(error.to_string()))?
    }

    pub fn files(&self, root: &Path, query: &str, limit: usize) -> AppResult<Vec<String>> {
        let limit = if limit == 0 || limit > 200 { 80 } else { limit };
        let needle = query.trim().to_lowercase();
        let mut files = Vec::new();
        for entry in WalkDir::new(root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|entry| {
                entry.depth() == 0
                    || !entry.file_type().is_dir()
                    || !ignored_dir(&entry.file_name().to_string_lossy())
            })
            .filter_map(Result::ok)
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let relative = entry
                .path()
                .strip_prefix(root)
                .unwrap_or(entry.path())
                .to_string_lossy()
                .replace('\\', "/");
            if !needle.is_empty() && !relative.to_lowercase().contains(&needle) {
                continue;
            }
            files.push(relative);
            if files.len() >= limit {
                break;
            }
        }
        files.sort();
        Ok(files)
    }

    pub fn find_repos(&self, query: &str, limit: usize) -> Vec<Repository> {
        let limit = if limit == 0 || limit > 200 { 50 } else { limit };
        let needle = query.trim().to_lowercase();
        let mut seen = std::collections::HashSet::new();
        let mut repos = Vec::new();
        for root in self.roots() {
            for entry in WalkDir::new(&root)
                .follow_links(false)
                .max_depth(7)
                .into_iter()
                .filter_entry(|entry| {
                    entry.depth() == 0
                        || !entry.file_type().is_dir()
                        || !ignored_dir(&entry.file_name().to_string_lossy())
                })
                .filter_map(Result::ok)
            {
                if !entry.file_type().is_dir() || entry.path() == root {
                    continue;
                }
                if !entry.path().join(".git").exists() {
                    continue;
                }
                let path = entry.path().to_path_buf();
                if !seen.insert(path.clone()) {
                    continue;
                }
                let relative = path
                    .strip_prefix(&root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");
                let name = path
                    .file_name()
                    .map(|value| value.to_string_lossy().to_string())
                    .unwrap_or_else(|| relative.clone());
                let haystack = format!("{} {} {}", name, relative, path.display()).to_lowercase();
                if needle.is_empty() || haystack.contains(&needle) {
                    repos.push(Repository {
                        name,
                        path: path.to_string_lossy().to_string(),
                        root: root.to_string_lossy().to_string(),
                        relative,
                    });
                    if repos.len() >= limit {
                        break;
                    }
                }
            }
        }
        repos.sort_by(|a, b| a.relative.cmp(&b.relative));
        repos
    }

    pub async fn git_status(&self, root: &Path) -> String {
        git_output(root, &["status", "--porcelain=v1", "-b"])
            .await
            .unwrap_or_default()
    }

    pub async fn git_branches(&self, root: &Path) -> AppResult<GitBranches> {
        let current = git_output(root, &["rev-parse", "--abbrev-ref", "HEAD"])
            .await
            .unwrap_or_default()
            .trim()
            .to_string();
        let output = git_output(root, &["branch", "--format=%(refname:short)"]).await?;
        let branches = output
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(ToOwned::to_owned)
            .collect();
        Ok(GitBranches { current, branches })
    }

    pub async fn git_stage(&self, root: &Path, paths: &[String]) -> AppResult<()> {
        let paths = validate_git_paths(paths)?;
        let mut args = vec!["add", "--"];
        args.extend(paths.iter().map(String::as_str));
        git_checked(root, &args).await
    }

    pub async fn git_unstage(&self, root: &Path, paths: &[String]) -> AppResult<()> {
        let paths = validate_git_paths(paths)?;
        let mut args = vec!["reset", "HEAD", "--"];
        args.extend(paths.iter().map(String::as_str));
        git_checked(root, &args).await
    }

    pub async fn git_commit(&self, root: &Path, message: &str) -> AppResult<String> {
        if message.trim().is_empty() {
            return Err(crate::errors::bad_request("commit message is required"));
        }
        git_output(root, &["commit", "-m", message.trim()]).await
    }

    pub async fn git_diff(&self, root: &Path, path: &str, staged: bool) -> AppResult<String> {
        let path = validate_git_path(path)?;
        let mut args = vec!["diff", "--no-color"];
        if staged {
            args.push("--cached");
        }
        args.extend(["--", path.as_str()]);
        match git_output(root, &args).await {
            Ok(output) => Ok(output),
            Err(_) if !staged => {
                let full = root.join(&path);
                match fs::read_to_string(full) {
                    Ok(content) => Ok(format!("--- /dev/null\n+++ b/{path}\n{content}")),
                    Err(_) => Ok(String::new()),
                }
            }
            Err(error) => Err(error),
        }
    }

    pub async fn git_file_versions(
        &self,
        root: &Path,
        path: &str,
        staged: bool,
    ) -> AppResult<(String, String)> {
        let path = validate_git_path(path)?;
        let original = if staged {
            git_show(root, &format!("HEAD:{path}")).await
        } else {
            git_show(root, &format!(":{path}")).await
        };
        let modified = if staged {
            git_show(root, &format!(":{path}")).await
        } else {
            fs::read_to_string(root.join(&path)).unwrap_or_default()
        };
        Ok((original, modified))
    }

    pub async fn git_blame(&self, root: &Path, path: &str) -> AppResult<Vec<GitBlameLine>> {
        let path = validate_git_path(path)?;
        let output = git_output(root, &["blame", "--line-porcelain", "--", &path]).await?;
        let mut lines = Vec::new();
        let mut current = GitBlameLine {
            line: 0,
            commit: String::new(),
            author: String::new(),
            author_time: String::new(),
            summary: String::new(),
        };
        let mut line_no = 0usize;
        for line in output.lines() {
            if let Some(content) = line.strip_prefix('\t') {
                let _ = content;
                current.line = line_no;
                if current.author.is_empty() {
                    current.author = "Unknown".into();
                }
                lines.push(current.clone());
                continue;
            }
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() >= 3
                && fields[0].len() >= 7
                && fields[0].chars().all(|c| c.is_ascii_hexdigit())
            {
                current = GitBlameLine {
                    line: 0,
                    commit: fields[0].to_string(),
                    author: String::new(),
                    author_time: String::new(),
                    summary: String::new(),
                };
                line_no = fields[2].parse().unwrap_or(0);
            } else if let Some(author) = line.strip_prefix("author ") {
                current.author = author.into();
            } else if let Some(seconds) = line.strip_prefix("author-time ") {
                if let Ok(seconds) = seconds.parse::<i64>() {
                    current.author_time = DateTime::<Utc>::from_timestamp(seconds, 0)
                        .map(|time| time.to_rfc3339())
                        .unwrap_or_default();
                }
            } else if let Some(summary) = line.strip_prefix("summary ") {
                current.summary = summary.into();
            }
        }
        Ok(lines)
    }

    pub async fn git_checkout(&self, root: &Path, name: &str) -> AppResult<()> {
        validate_branch_name(name)?;
        git_checked(root, &["switch", name]).await
    }

    pub async fn git_create_branch(&self, root: &Path, name: &str) -> AppResult<String> {
        validate_branch_name(name)?;
        git_checked(root, &["check-ref-format", "--branch", name]).await?;
        git_checked(root, &["switch", "-c", name]).await?;
        Ok(name.into())
    }

    pub async fn git_discard(&self, root: &Path, paths: &[String], staged: bool) -> AppResult<()> {
        let paths = validate_git_paths(paths)?;
        for path in paths {
            let tracked = Command::new("git")
                .args([
                    "-C",
                    &root.to_string_lossy(),
                    "ls-files",
                    "--error-unmatch",
                    "--",
                    &path,
                ])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .await
                .map(|status| status.success())
                .unwrap_or(false);
            if !tracked {
                let _ = fs::remove_file(root.join(&path));
                continue;
            }
            let mut args = vec!["restore"];
            if staged {
                args.extend(["--staged", "--worktree"]);
            } else {
                args.push("--worktree");
            }
            args.extend(["--", path.as_str()]);
            git_checked(root, &args).await?;
        }
        Ok(())
    }
}

fn resolve_roots(roots: &[PathBuf]) -> AppResult<Vec<PathBuf>> {
    roots.iter().map(|root| resolve_root(root)).collect()
}

fn resolve_root(root: &Path) -> AppResult<PathBuf> {
    let absolute = if root.is_absolute() {
        root.to_path_buf()
    } else {
        std::env::current_dir()?.join(root)
    };
    let real = absolute.canonicalize()?;
    if !real.is_dir() {
        return Err(crate::errors::bad_request(format!(
            "workspace root {} is not a directory",
            root.display()
        )));
    }
    Ok(real)
}

fn safe_relative(relative: &str) -> AppResult<PathBuf> {
    let path = Path::new(relative);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
    {
        return Err(AppError::Forbidden);
    }
    let mut clean = PathBuf::new();
    for component in path.components() {
        if let Component::Normal(value) = component {
            clean.push(value);
        }
    }
    Ok(clean)
}

fn resolve_existing(root: &Path, relative: &str) -> AppResult<PathBuf> {
    let root = root.canonicalize()?;
    let relative = safe_relative(relative)?;
    let path = root.join(relative);
    let real = path.canonicalize()?;
    if real != root && !real.starts_with(&root) {
        return Err(AppError::Forbidden);
    }
    Ok(real)
}

fn resolve_for_write(root: &Path, relative: &str) -> AppResult<PathBuf> {
    let root = root.canonicalize()?;
    let relative = safe_relative(relative)?;
    if relative.as_os_str().is_empty() {
        return Err(AppError::Forbidden);
    }
    let path = root.join(relative);
    let parent = path.parent().ok_or(AppError::Forbidden)?;
    let real_parent = parent.canonicalize()?;
    if real_parent != root && !real_parent.starts_with(&root) {
        return Err(AppError::Forbidden);
    }
    Ok(path)
}

fn modified(metadata: &fs::Metadata) -> String {
    metadata
        .modified()
        .ok()
        .map(DateTime::<Utc>::from)
        .map(|time| time.to_rfc3339())
        .unwrap_or_default()
}

fn search_blocking(root: &Path, query: &str, max_results: usize) -> AppResult<Vec<SearchMatch>> {
    if let Ok(output) = std::process::Command::new("rg")
        .args([
            "-n",
            "--no-heading",
            "--color",
            "never",
            "--hidden",
            "--glob",
            "!.git/**",
            "--glob",
            "!**/.git/**",
            "--glob",
            "!node_modules/**",
            "--glob",
            "!**/node_modules/**",
            "--glob",
            "!dist/**",
            "--glob",
            "!**/dist/**",
            "--glob",
            "!build/**",
            "--glob",
            "!**/build/**",
            "--glob",
            "!target/**",
            "--glob",
            "!**/target/**",
            "--max-count",
            "20",
            "--",
            query,
        ])
        .current_dir(root)
        .output()
    {
        if output.status.success() {
            let mut matches = Vec::new();
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                if matches.len() >= max_results {
                    break;
                }
                let mut parts = line.splitn(3, ':');
                let Some(path) = parts.next() else { continue };
                let Some(line_no) = parts.next() else {
                    continue;
                };
                let Some(preview) = parts.next() else {
                    continue;
                };
                matches.push(SearchMatch {
                    path: path.replace('\\', "/"),
                    line: line_no.parse().unwrap_or(0),
                    column: 0,
                    preview: preview.trim().to_string(),
                });
            }
            return Ok(matches);
        }
    }
    let needle = query.to_lowercase();
    let mut matches = Vec::new();
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            entry.depth() == 0
                || !entry.file_type().is_dir()
                || !ignored_dir(&entry.file_name().to_string_lossy())
        })
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.len() > 1024 * 1024 {
            continue;
        }
        let Ok(content) = fs::read_to_string(entry.path()) else {
            continue;
        };
        for (index, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(&needle) {
                let relative = entry
                    .path()
                    .strip_prefix(root)
                    .unwrap_or(entry.path())
                    .to_string_lossy()
                    .replace('\\', "/");
                matches.push(SearchMatch {
                    path: relative,
                    line: index + 1,
                    column: 0,
                    preview: line.trim().to_string(),
                });
                if matches.len() >= max_results {
                    return Ok(matches);
                }
            }
        }
    }
    Ok(matches)
}

fn validate_git_path(path: &str) -> AppResult<String> {
    let clean = safe_relative(path)?;
    if clean.as_os_str().is_empty() {
        return Err(AppError::Forbidden);
    }
    Ok(clean.to_string_lossy().replace('\\', "/"))
}

fn validate_git_paths(paths: &[String]) -> AppResult<Vec<String>> {
    if paths.is_empty() {
        return Err(crate::errors::bad_request("no paths provided"));
    }
    paths.iter().map(|path| validate_git_path(path)).collect()
}

fn validate_branch_name(name: &str) -> AppResult<()> {
    let name = name.trim();
    if name.is_empty() || name.starts_with('-') || name.chars().any(|c| c.is_whitespace()) {
        return Err(crate::errors::bad_request("invalid branch name"));
    }
    Ok(())
}

async fn git_output(root: &Path, args: &[&str]) -> AppResult<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .await?;
    if !output.status.success() {
        return Err(crate::errors::bad_request(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

async fn git_checked(root: &Path, args: &[&str]) -> AppResult<()> {
    git_output(root, args).await.map(|_| ())
}

async fn git_show(root: &Path, spec: &str) -> String {
    git_output(root, &["show", spec]).await.unwrap_or_default()
}
