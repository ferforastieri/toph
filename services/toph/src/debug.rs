use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::broadcast;
use tokio_tungstenite::tungstenite::Message as WsMessage;

use crate::crypto::new_id;
use crate::errors::{AppError, AppResult};

const OUTPUT_LIMIT: usize = 256 * 1024;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugStartInput {
    pub language: String,
    pub mode: String,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub address: String,
    #[serde(default)]
    pub cwd: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugSessionInfo {
    pub id: String,
    pub project_id: String,
    pub language: String,
    pub mode: String,
    pub status: String,
    pub ws_url: String,
    pub address: String,
}

pub struct DebugManager {
    sessions: Mutex<HashMap<String, Arc<DebugSession>>>,
}

pub struct DebugSession {
    pub id: String,
    pub project_id: String,
    pub language: String,
    pub mode: String,
    pub inspector_url: Mutex<Option<String>>,
    pub address: String,
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    output: Mutex<Vec<u8>>,
    output_tx: broadcast::Sender<Vec<u8>>,
    pub paused: AtomicBool,
    pub clients: AtomicUsize,
    last_disconnect: Mutex<Instant>,
    closed: AtomicBool,
}

impl DebugManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn get(&self, project_id: &str) -> Option<Arc<DebugSession>> {
        self.sessions.lock().ok()?.get(project_id).cloned()
    }

    pub async fn start(
        &self,
        project_id: &str,
        root: &Path,
        input: DebugStartInput,
    ) -> AppResult<Arc<DebugSession>> {
        self.stop(project_id).await;
        let language = match input.language.as_str() {
            "node" | "python" => input.language.clone(),
            _ => return Err(AppError::BadRequest("debug language must be node or python".into())),
        };
        let mode = match input.mode.as_str() {
            "launch" | "attach" => input.mode.clone(),
            _ => return Err(AppError::BadRequest("debug mode must be launch or attach".into())),
        };
        let cwd = if input.cwd.trim().is_empty() {
            root.to_path_buf()
        } else {
            let raw = PathBuf::from(input.cwd.trim());
            let candidate = if raw.is_absolute() { raw } else { root.join(raw) };
            candidate
                .canonicalize()
                .map_err(|_| AppError::BadRequest("debug cwd does not exist".into()))?
        };
        if !cwd.starts_with(root) {
            return Err(AppError::Forbidden);
        }

        let session = if language == "node" {
            start_node(project_id, &cwd, &mode, &input).await?
        } else {
            start_python(project_id, &cwd, &mode, &input)?
        };
        self.sessions
            .lock()
            .map_err(|_| crate::errors::internal("debug lock"))?
            .insert(project_id.to_string(), session.clone());
        Ok(session)
    }

    pub async fn stop(&self, project_id: &str) {
        let session = self
            .sessions
            .lock()
            .ok()
            .and_then(|mut sessions| sessions.remove(project_id));
        if let Some(session) = session {
            session.resume().await;
            session.close();
        }
    }

    pub async fn close_project(&self, project_id: &str) {
        self.stop(project_id).await;
    }

    pub fn close_all_now(&self) {
        let sessions: Vec<Arc<DebugSession>> = self
            .sessions
            .lock()
            .ok()
            .map(|sessions| sessions.values().cloned().collect())
            .unwrap_or_default();
        for session in &sessions {
            session.close();
        }
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.clear();
        }
    }

    pub async fn close_all(&self) {
        let sessions: Vec<Arc<DebugSession>> = self
            .sessions
            .lock()
            .ok()
            .map(|sessions| sessions.values().cloned().collect())
            .unwrap_or_default();
        for session in &sessions {
            session.resume().await;
            session.close();
        }
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.clear();
        }
    }

    /// Continue sessions that were left paused after the last browser went away.
    /// This covers the mobile app being killed without a clean pagehide event.
    pub async fn maintain(&self) {
        let sessions: Vec<Arc<DebugSession>> = self
            .sessions
            .lock()
            .ok()
            .map(|sessions| sessions.values().cloned().collect())
            .unwrap_or_default();
        for session in sessions {
            if session.closed.load(Ordering::SeqCst) {
                continue;
            }
            if session.paused.load(Ordering::SeqCst)
                && session.clients.load(Ordering::SeqCst) == 0
            {
                let idle = session
                    .last_disconnect
                    .lock()
                    .map(|value| value.elapsed())
                    .unwrap_or_default();
                if idle > Duration::from_secs(5) {
                    session.resume().await;
                }
            }
        }
    }
}

impl DebugSession {
    pub fn info(&self) -> DebugSessionInfo {
        DebugSessionInfo {
            id: self.id.clone(),
            project_id: self.project_id.clone(),
            language: self.language.clone(),
            mode: self.mode.clone(),
            status: if self.closed.load(Ordering::SeqCst) {
                "stopped".into()
            } else if self.paused.load(Ordering::SeqCst) {
                "paused".into()
            } else {
                "running".into()
            },
            ws_url: format!("/api/projects/{}/debug/ws", self.project_id),
            address: self.address.clone(),
        }
    }

    pub async fn resume(&self) {
        if self.language == "node" {
            let url = self.inspector_url.lock().ok().and_then(|value| value.clone());
            if let Some(url) = url {
                let _ = resume_node(&url).await;
            }
        } else if let Some(stdin) = self.stdin.lock().ok().and_then(|mut stdin| stdin.take()) {
            let mut stdin = stdin;
            let _ = stdin.write_all(b"continue\n");
            let _ = stdin.flush();
            if let Ok(mut slot) = self.stdin.lock() {
                *slot = Some(stdin);
            }
        }
        self.paused.store(false, Ordering::SeqCst);
    }

    pub fn close(&self) {
        if self.closed.swap(true, Ordering::SeqCst) {
            return;
        }
        if let Ok(mut stdin) = self.stdin.lock() {
            let _ = stdin.take();
        }
        if let Ok(mut child) = self.child.lock() {
            if let Some(child) = child.as_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }

    pub fn subscribe(&self) -> AppResult<(Vec<u8>, broadcast::Receiver<Vec<u8>>)> {
        let initial = self
            .output
            .lock()
            .map_err(|_| crate::errors::internal("debug output"))?
            .clone();
        Ok((initial, self.output_tx.subscribe()))
    }

    pub fn client_disconnected(&self) {
        if let Ok(mut last) = self.last_disconnect.lock() {
            *last = Instant::now();
        }
    }

    pub fn write_command(&self, command: &str) -> AppResult<()> {
        let mut guard = self
            .stdin
            .lock()
            .map_err(|_| crate::errors::internal("debug stdin"))?;
        let Some(stdin) = guard.as_mut() else {
            return Err(AppError::BadRequest("debug process has no stdin".into()));
        };
        stdin.write_all(command.as_bytes())?;
        stdin.write_all(b"\n")?;
        stdin.flush()?;
        Ok(())
    }
}

fn port() -> AppResult<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| AppError::Internal(error.into()))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| AppError::Internal(error.into()))
}

async fn inspector_ws(address: &str) -> AppResult<String> {
    let base = if address.starts_with("http://") || address.starts_with("https://") {
        address.trim_end_matches('/').to_string()
    } else {
        format!("http://{}", address.trim_end_matches('/'))
    };
    let url = if base.ends_with("/json/list") {
        base
    } else {
        format!("{base}/json/list")
    };
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|error| AppError::Internal(error.into()))?;
    let value: Value = client
        .get(url)
        .send()
        .await
        .map_err(|error| AppError::BadRequest(format!("debug inspector unavailable: {error}")))?
        .json()
        .await
        .map_err(|error| AppError::BadRequest(format!("invalid debug inspector response: {error}")))?;
    value
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .find_map(|item| item.get("webSocketDebuggerUrl")?.as_str().map(str::to_string))
        })
        .ok_or_else(|| AppError::BadRequest("debug inspector has no websocket endpoint".into()))
}

async fn wait_inspector(address: &str) -> AppResult<String> {
    for _ in 0..100 {
        if let Ok(url) = inspector_ws(address).await {
            return Ok(url);
        }
        tokio::time::sleep(Duration::from_millis(120)).await;
    }
    Err(AppError::BadRequest(
        "Node inspector did not start. Use a Node command such as `node src/index.js` or `npm run dev`.".into(),
    ))
}

async fn start_node(
    project_id: &str,
    cwd: &Path,
    mode: &str,
    input: &DebugStartInput,
) -> AppResult<Arc<DebugSession>> {
    if mode == "attach" {
        let address = input.address.trim();
        if address.is_empty() {
            return Err(AppError::BadRequest("attach requires an inspector address".into()));
        }
        let ws = inspector_ws(address).await?;
        return Ok(new_session(
            project_id,
            "node",
            mode,
            address,
            Some(ws),
            None,
            None,
            None,
        ));
    }

    if input.command.trim().is_empty() {
        return Err(AppError::BadRequest("launch requires a command".into()));
    }
    let debug_port = port()?;
    let address = format!("127.0.0.1:{debug_port}");
    let mut command = Command::new("sh");
    command
        .arg("-lc")
        .arg(&input.command)
        .current_dir(cwd)
        .env("NODE_OPTIONS", node_options(debug_port))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| AppError::BadRequest(format!("could not launch Node: {error}")))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let session = new_session(
        project_id,
        "node",
        mode,
        &address,
        None,
        Some(child),
        None,
        None,
    );
    if let Some(stdout) = stdout {
        spawn_reader(session.clone(), stdout);
    }
    if let Some(stderr) = stderr {
        spawn_reader(session.clone(), stderr);
    }
    let ws = wait_inspector(&address).await.inspect_err(|_| session.close())?;
    if let Ok(mut slot) = session.inspector_url.lock() {
        *slot = Some(ws);
    }
    Ok(session)
}

fn start_python(
    project_id: &str,
    cwd: &Path,
    mode: &str,
    input: &DebugStartInput,
) -> AppResult<Arc<DebugSession>> {
    if mode == "attach" {
        return Err(AppError::BadRequest(
            "Python attach still requires a DAP adapter. Use launch with Python.".into(),
        ));
    }
    let script = python_script(&input.command);
    if script.is_empty() {
        return Err(AppError::BadRequest("launch requires a Python script".into()));
    }
    let python = which_python();
    let mut command = Command::new(&python);
    command
        .args(["-u", "-m", "pdb"])
        .arg(&script)
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| AppError::BadRequest(format!("could not launch Python: {error}")))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdin = child.stdin.take();
    let session = new_session(
        project_id,
        "python",
        mode,
        &format!("{} {}", python, script),
        None,
        Some(child),
        stdin,
        None,
    );
    if let Some(stdout) = stdout {
        spawn_reader(session.clone(), stdout);
    }
    if let Some(stderr) = stderr {
        spawn_reader(session.clone(), stderr);
    }
    Ok(session)
}

fn python_script(command: &str) -> String {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let mut parts = trimmed.split_whitespace();
    let first = parts.next().unwrap_or_default();
    if first == "python" || first == "python3" {
        parts.collect::<Vec<_>>().join(" ")
    } else {
        trimmed.to_string()
    }
}

fn which_python() -> String {
    for candidate in ["python3", "python"] {
        if Command::new(candidate)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok()
        {
            return candidate.to_string();
        }
    }
    "python3".into()
}

fn node_options(debug_port: u16) -> String {
    let existing = std::env::var("NODE_OPTIONS").unwrap_or_default();
    format!("{existing} --inspect-brk=127.0.0.1:{debug_port}")
        .trim()
        .to_string()
}

fn new_session(
    project_id: &str,
    language: &str,
    mode: &str,
    address: &str,
    inspector_url: Option<String>,
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    _unused: Option<()>,
) -> Arc<DebugSession> {
    let (output_tx, _) = broadcast::channel(256);
    Arc::new(DebugSession {
        id: new_id(),
        project_id: project_id.to_string(),
        language: language.to_string(),
        mode: mode.to_string(),
        inspector_url: Mutex::new(inspector_url),
        address: address.to_string(),
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        output: Mutex::new(Vec::new()),
        output_tx,
        paused: AtomicBool::new(language == "python"),
        clients: AtomicUsize::new(0),
        last_disconnect: Mutex::new(Instant::now()),
        closed: AtomicBool::new(false),
    })
}

fn spawn_reader<R: Read + Send + 'static>(session: Arc<DebugSession>, mut reader: R) {
    thread::spawn(move || {
        let mut buffer = [0u8; 16 * 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let chunk = buffer[..count].to_vec();
                    if let Ok(mut stored) = session.output.lock() {
                        stored.extend_from_slice(&chunk);
                        if stored.len() > OUTPUT_LIMIT {
                            let excess = stored.len() - OUTPUT_LIMIT;
                            stored.drain(..excess);
                        }
                    }
                    let _ = session.output_tx.send(chunk);
                }
                Err(_) => break,
            }
        }
    });
}

async fn resume_node(inspector_url: &str) -> AppResult<()> {
    let (mut socket, _) = tokio_tungstenite::connect_async(inspector_url)
        .await
        .map_err(|error| AppError::Internal(error.into()))?;
    let _ = socket
        .send(WsMessage::Text(
            json!({ "id": 1, "method": "Runtime.runIfWaitingForDebugger" }).to_string().into(),
        ))
        .await;
    let _ = socket
        .send(WsMessage::Text(
            json!({ "id": 2, "method": "Debugger.resume" }).to_string().into(),
        ))
        .await;
    let _ = socket.close(None).await;
    Ok(())
}

pub async fn proxy_node(session: Arc<DebugSession>, socket: axum::extract::ws::WebSocket) {
    let Some(url) = session.inspector_url.lock().ok().and_then(|value| value.clone()) else {
        return;
    };
    let Ok((upstream, _)) = tokio_tungstenite::connect_async(&url).await else {
        return;
    };
    let (mut client_tx, mut client_rx) = socket.split();
    let (mut upstream_tx, mut upstream_rx) = upstream.split();
    let session_for_events = session.clone();
    let upstream_to_client = async {
        while let Some(message) = upstream_rx.next().await {
            let Ok(message) = message else { break };
            if let WsMessage::Text(text) = &message {
                if let Ok(value) = serde_json::from_str::<Value>(text) {
                    match value.get("method").and_then(Value::as_str) {
                        Some("Debugger.paused") => {
                            session_for_events.paused.store(true, Ordering::SeqCst);
                        }
                        Some("Debugger.resumed") => {
                            session_for_events.paused.store(false, Ordering::SeqCst);
                        }
                        _ => {}
                    }
                }
            }
            let outgoing = match message {
                WsMessage::Text(text) => axum::extract::ws::Message::Text(text.to_string().into()),
                WsMessage::Binary(data) => axum::extract::ws::Message::Binary(data),
                WsMessage::Ping(data) => axum::extract::ws::Message::Ping(data),
                WsMessage::Pong(data) => axum::extract::ws::Message::Pong(data),
                WsMessage::Close(frame) => axum::extract::ws::Message::Close(frame.map(|frame| {
                    axum::extract::ws::CloseFrame {
                        code: frame.code.into(),
                        reason: frame.reason.to_string().into(),
                    }
                })),
                WsMessage::Frame(_) => continue,
            };
            if client_tx.send(outgoing).await.is_err() {
                break;
            }
        }
    };
    let client_to_upstream = async {
        while let Some(message) = client_rx.next().await {
            let Ok(message) = message else { break };
            let outgoing = match message {
                axum::extract::ws::Message::Text(text) => {
                    if let Ok(value) = serde_json::from_str::<Value>(&text) {
                        if value.get("method").and_then(Value::as_str) == Some("Debugger.resume") {
                            session.paused.store(false, Ordering::SeqCst);
                        }
                    }
                    WsMessage::Text(text.to_string().into())
                }
                axum::extract::ws::Message::Binary(data) => WsMessage::Binary(data),
                axum::extract::ws::Message::Ping(data) => WsMessage::Ping(data),
                axum::extract::ws::Message::Pong(data) => WsMessage::Pong(data),
                axum::extract::ws::Message::Close(frame) => WsMessage::Close(frame.map(|frame| {
                    tokio_tungstenite::tungstenite::protocol::CloseFrame {
                        code: frame.code.into(),
                        reason: frame.reason.to_string().into(),
                    }
                })),
            };
            if upstream_tx.send(outgoing).await.is_err() {
                break;
            }
        }
    };
    tokio::select! {
        _ = upstream_to_client => {}
        _ = client_to_upstream => {}
    }
}

pub async fn proxy_python(session: Arc<DebugSession>, mut socket: axum::extract::ws::WebSocket) {
    let Ok((initial, mut output)) = session.subscribe() else {
        return;
    };
    if !initial.is_empty()
        && socket
            .send(axum::extract::ws::Message::Text(
                String::from_utf8_lossy(&initial).to_string().into(),
            ))
            .await
            .is_err()
    {
        return;
    }
    let mut heartbeat = tokio::time::interval(Duration::from_secs(2));
    loop {
        tokio::select! {
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(axum::extract::ws::Message::Text(text))) => {
                        if let Ok(value) = serde_json::from_str::<Value>(&text) {
                            if let Some(command) = value.get("command").and_then(Value::as_str) {
                                let _ = session.write_command(command);
                                if matches!(command, "continue" | "c" | "next" | "n" | "step" | "s" | "return" | "r") {
                                    session.paused.store(false, Ordering::SeqCst);
                                }
                            }
                        }
                    }
                    Some(Ok(axum::extract::ws::Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
            data = output.recv() => {
                match data {
                    Ok(data) => {
                        let text = String::from_utf8_lossy(&data).to_string();
                        if socket.send(axum::extract::ws::Message::Text(text.into())).await.is_err() { break; }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            _ = heartbeat.tick() => {
                if session.closed.load(Ordering::SeqCst) { break; }
            }
        }
    }
}
