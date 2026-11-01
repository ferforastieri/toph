use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub command: String,
    pub cwd: String,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessCloseResult {
    pub terminated: Vec<ProcessInfo>,
    pub failed: Vec<ProcessInfo>,
}

#[derive(Debug, Clone)]
struct ProcEntry {
    pid: u32,
    ppid: u32,
    pgrp: u32,
    uid: u32,
    name: String,
    command: String,
    cwd: Option<PathBuf>,
}

/// Terminates processes owned by the Toph user whose working directory is
/// inside the project. This complements the tracked terminal/debug sessions:
/// a dev server opened manually from a shell is still inside the project.
pub fn terminate_project_processes(root: &Path) -> ProcessCloseResult {
    let Ok(root) = fs::canonicalize(root) else {
        return ProcessCloseResult::default();
    };
    let Ok(entries) = fs::read_dir("/proc") else {
        return ProcessCloseResult::default();
    };
    let own_pid = std::process::id();
    let own_uid = unsafe { libc::geteuid() };
    let own_pgrp = unsafe { libc::getpgrp() } as u32;
    let protected = protected_pids(own_pid);

    let mut processes = HashMap::new();
    for entry in entries.flatten() {
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|value| value.parse::<u32>().ok())
        else {
            continue;
        };
        if pid <= 1 || protected.contains(&pid) {
            continue;
        }
        let Some(process) = read_process(pid) else {
            continue;
        };
        if process.uid != own_uid {
            continue;
        }
        processes.insert(pid, process);
    }

    let mut targets: HashSet<u32> = processes
        .values()
        .filter(|process| {
            process
                .cwd
                .as_deref()
                .is_some_and(|cwd| cwd.starts_with(&root))
        })
        .map(|process| process.pid)
        .collect();

    // Include descendants of a target even when they changed cwd after being
    // spawned by a project process.
    loop {
        let children: Vec<u32> = processes
            .values()
            .filter(|process| targets.contains(&process.ppid) && !targets.contains(&process.pid))
            .map(|process| process.pid)
            .collect();
        if children.is_empty() {
            break;
        }
        targets.extend(children);
    }
    targets.retain(|pid| *pid != own_pid && !protected.contains(pid));

    if targets.is_empty() {
        return ProcessCloseResult::default();
    }

    let mut groups = HashSet::new();
    for pid in &targets {
        let Some(process) = processes.get(pid) else {
            continue;
        };
        if process.pgrp > 1 && process.pgrp != own_pgrp && process.pgrp != own_pid {
            groups.insert(process.pgrp);
        }
    }

    for group in &groups {
        unsafe {
            libc::kill(-(*group as i32), libc::SIGTERM);
        }
    }
    for pid in &targets {
        let covered_by_group = processes
            .get(pid)
            .is_some_and(|process| groups.contains(&process.pgrp));
        if !covered_by_group {
            unsafe {
                libc::kill(*pid as i32, libc::SIGTERM);
            }
        }
    }

    thread::sleep(Duration::from_millis(450));

    for pid in &targets {
        if !Path::new(&format!("/proc/{pid}")).exists() {
            continue;
        }
        let covered_by_group = processes
            .get(pid)
            .is_some_and(|process| groups.contains(&process.pgrp));
        if !covered_by_group {
            unsafe {
                libc::kill(*pid as i32, libc::SIGKILL);
            }
        }
    }
    for group in &groups {
        unsafe {
            libc::kill(-(*group as i32), libc::SIGKILL);
        }
    }

    thread::sleep(Duration::from_millis(150));

    let mut terminated = Vec::new();
    let mut failed = Vec::new();
    for pid in targets {
        let Some(process) = processes.get(&pid) else {
            continue;
        };
        let info = ProcessInfo {
            pid,
            name: process.name.clone(),
            command: process.command.clone(),
            cwd: process
                .cwd
                .as_deref()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_default(),
        };
        if Path::new(&format!("/proc/{pid}")).exists() {
            failed.push(info);
        } else {
            terminated.push(info);
        }
    }
    terminated.sort_by_key(|process| process.pid);
    failed.sort_by_key(|process| process.pid);
    ProcessCloseResult { terminated, failed }
}

fn protected_pids(own_pid: u32) -> HashSet<u32> {
    let mut protected = HashSet::new();
    let mut current = own_pid;
    while current > 1 && protected.insert(current) {
        let Some(process) = read_process(current) else {
            break;
        };
        current = process.ppid;
    }
    protected.insert(1);
    protected
}

fn read_process(pid: u32) -> Option<ProcEntry> {
    let base = format!("/proc/{pid}");
    let status = fs::read_to_string(format!("{base}/status")).ok()?;
    let mut ppid = 0;
    let mut uid = 0;
    let mut name = String::new();
    for line in status.lines() {
        if let Some(value) = line.strip_prefix("PPid:") {
            ppid = value.trim().parse().ok()?;
        } else if let Some(value) = line.strip_prefix("Uid:") {
            uid = value.split_whitespace().next()?.parse().ok()?;
        } else if let Some(value) = line.strip_prefix("Name:") {
            name = value.trim().to_string();
        }
    }
    if uid == 0 || ppid == 0 {
        return None;
    }
    let stat = fs::read_to_string(format!("{base}/stat")).ok()?;
    let after_name = stat.rsplit_once(')')?.1.trim();
    let fields: Vec<&str> = after_name.split_whitespace().collect();
    let pgrp = fields.get(2)?.parse().ok()?;
    let command = fs::read(format!("{base}/cmdline"))
        .ok()
        .map(|bytes| {
            bytes
                .split(|byte| *byte == 0)
                .filter(|part| !part.is_empty())
                .map(|part| String::from_utf8_lossy(part).to_string())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default();
    let cwd = fs::read_link(format!("{base}/cwd"))
        .ok()
        .and_then(|path| fs::canonicalize(path).ok());
    Some(ProcEntry {
        pid,
        ppid,
        pgrp,
        uid,
        name,
        command: command.chars().take(500).collect(),
        cwd,
    })
}
