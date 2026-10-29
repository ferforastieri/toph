use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use portable_pty::{CommandBuilder, MasterPty, PtySize};
use tokio::sync::broadcast;

use crate::crypto::new_id;
use crate::errors::{AppError, AppResult};

const RING_SIZE: usize = 128 * 1024;

pub struct TerminalManager {
    sessions: Mutex<HashMap<String, Arc<TerminalSession>>>,
    shell: String,
}

pub struct TerminalSession {
    pub id: String,
    pub project_id: String,
    pub shell: String,
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    child: Mutex<Box<dyn portable_pty::Child + Send + Sync>>,
    buffer: Mutex<Vec<u8>>,
    output: broadcast::Sender<Vec<u8>>,
    closed: Arc<AtomicBool>,
}

impl TerminalManager {
    pub fn new(shell: Option<String>) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            shell: shell.unwrap_or_else(default_shell),
        }
    }

    pub fn create(
        &self,
        project_id: &str,
        cwd: &Path,
        shell: Option<&str>,
    ) -> AppResult<Arc<TerminalSession>> {
        let shell = shell
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| self.shell.clone());
        if shell.contains('/') && !Path::new(&shell).exists() {
            return Err(crate::errors::bad_request("shell not found"));
        }
        let pty_system = portable_pty::native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| AppError::Internal(error.into()))?;
        let mut command = CommandBuilder::new(&shell);
        #[cfg(unix)]
        command.arg("-l");
        if let Some(parent) = cwd.parent() {
            let _ = parent;
        }
        command.cwd(cwd);
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|error| AppError::Internal(error.into()))?;
        drop(pair.slave);
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| AppError::Internal(error.into()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|error| AppError::Internal(error.into()))?;
        let (output, _) = broadcast::channel(256);
        let session = Arc::new(TerminalSession {
            id: new_id(),
            project_id: project_id.to_string(),
            shell: shell.clone(),
            writer: Mutex::new(writer),
            master: Mutex::new(pair.master),
            child: Mutex::new(child),
            buffer: Mutex::new(Vec::new()),
            output,
            closed: Arc::new(AtomicBool::new(false)),
        });
        spawn_reader(session.clone(), reader);
        self.sessions
            .lock()
            .map_err(|_| crate::errors::internal("terminal lock"))?
            .insert(session.id.clone(), session.clone());
        Ok(session)
    }

    pub fn get(&self, id: &str) -> Option<Arc<TerminalSession>> {
        self.sessions.lock().ok()?.get(id).cloned()
    }

    pub fn close_session(&self, id: &str) -> bool {
        let session = self
            .sessions
            .lock()
            .ok()
            .and_then(|mut sessions| sessions.remove(id));
        if let Some(session) = session {
            session.close();
            true
        } else {
            false
        }
    }

    pub fn close_project(&self, project_id: &str) -> usize {
        let sessions: Vec<Arc<TerminalSession>> = self
            .sessions
            .lock()
            .map(|sessions| {
                sessions
                    .values()
                    .filter(|session| session.project_id == project_id)
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();
        for session in &sessions {
            session.close();
        }
        if let Ok(mut map) = self.sessions.lock() {
            map.retain(|_, session| session.project_id != project_id);
        }
        sessions.len()
    }

    pub fn close_all(&self) {
        let sessions: Vec<Arc<TerminalSession>> = self
            .sessions
            .lock()
            .map(|sessions| sessions.values().cloned().collect())
            .unwrap_or_default();
        for session in sessions {
            session.close();
        }
        if let Ok(mut map) = self.sessions.lock() {
            map.clear();
        }
    }
}

impl TerminalSession {
    pub fn write(&self, data: &[u8]) -> AppResult<()> {
        if data.is_empty() {
            return Ok(());
        }
        self.writer
            .lock()
            .map_err(|_| crate::errors::internal("terminal writer"))?
            .write_all(data)?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> AppResult<()> {
        if cols == 0 || rows == 0 {
            return Ok(());
        }
        self.master
            .lock()
            .map_err(|_| crate::errors::internal("terminal master"))?
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| AppError::Internal(error.into()))?;
        Ok(())
    }

    pub fn subscribe(&self) -> AppResult<(Vec<u8>, broadcast::Receiver<Vec<u8>>, Arc<AtomicBool>)> {
        let initial = self
            .buffer
            .lock()
            .map_err(|_| crate::errors::internal("terminal buffer"))?
            .clone();
        Ok((initial, self.output.subscribe(), self.closed.clone()))
    }

    pub fn close(&self) {
        if self.closed.swap(true, Ordering::SeqCst) {
            return;
        }
        if let Ok(mut child) = self.child.lock() {
            if let Some(pid) = child.process_id() {
                #[cfg(unix)]
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGKILL);
                }
                #[cfg(windows)]
                {
                    let _ = std::process::Command::new("taskkill")
                        .args(["/T", "/F", "/PID", &pid.to_string()])
                        .stdout(std::process::Stdio::null())
                        .stderr(std::process::Stdio::null())
                        .status();
                }
            }
            let _ = child.kill();
        }
        let _ = self.writer.lock().map(|_| ());
    }
}

fn spawn_reader(session: Arc<TerminalSession>, mut reader: Box<dyn Read + Send>) {
    thread::spawn(move || {
        let mut buffer = [0u8; 32 * 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let chunk = buffer[..count].to_vec();
                    if let Ok(mut stored) = session.buffer.lock() {
                        stored.extend_from_slice(&chunk);
                        if stored.len() > RING_SIZE {
                            let excess = stored.len() - RING_SIZE;
                            stored.drain(..excess);
                        }
                    }
                    let _ = session.output.send(chunk);
                }
                Err(_) => break,
            }
        }
        session.closed.store(true, Ordering::SeqCst);
    });
}

fn default_shell() -> String {
    #[cfg(windows)]
    {
        let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        return format!(r"{root}\System32\cmd.exe");
    }
    #[cfg(not(windows))]
    {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into());
        if Path::new(&shell).exists() {
            shell
        } else {
            "/bin/sh".into()
        }
    }
}

pub fn available_shells() -> Vec<String> {
    let mut shells = Vec::new();
    for shell in [
        "/bin/bash",
        "/bin/sh",
        "/bin/zsh",
        "/usr/bin/fish",
        "/bin/fish",
    ] {
        if Path::new(shell).exists() {
            let name = Path::new(shell)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or(shell)
                .to_string();
            if !shells.contains(&name) {
                shells.push(name);
            }
        }
    }
    if shells.is_empty() {
        shells.push("sh".to_string());
    }
    shells
}
