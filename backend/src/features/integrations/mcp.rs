//! Native MCP JSON-RPC transport: stdio and Streamable HTTP, lazy bounded pools.
use crate::{
    crypto::{decrypt, encrypt, load_or_create_key, new_id},
    errors::{bad_request, AppError, AppResult},
    store::Store,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::Path,
    process::Stdio,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout},
    sync::Mutex,
};

/// Screenshots and a11y snapshots are large JSON payloads; 1 MiB rejected
/// valid Chrome DevTools responses.
const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub transport: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub command: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub token: String,
    /// Browser automations and cold `npx` starts regularly exceed the old 45s
    /// ceiling, so each server carries its own budget.
    #[serde(default = "default_timeout")]
    pub timeout_seconds: u64,
    /// Skip the per-call permission prompt. Intended for high-frequency,
    /// inspect-only servers such as Chrome DevTools.
    #[serde(default)]
    pub auto_approve: bool,
}

fn default_timeout() -> u64 {
    120
}
#[derive(Clone)]
pub struct Service {
    store: Store,
    key: Arc<Vec<u8>>,
    client: reqwest::Client,
    pool: Arc<Mutex<HashMap<String, Cached>>>,
}
struct Cached {
    touched: Instant,
    link: Arc<Mutex<Link>>,
}
struct Link {
    server: Server,
    client: reqwest::Client,
    session: Option<String>,
    version: String,
    id: u64,
    process: Option<(Child, ChildStdin, BufReader<ChildStdout>)>,
}
impl Drop for Link {
    fn drop(&mut self) {
        #[cfg(unix)]
        if let Some((child, _, _)) = &self.process {
            if let Some(id) = child.id() {
                unsafe {
                    libc::kill(-(id as i32), libc::SIGKILL);
                }
            }
        }
    }
}

impl Service {
    pub fn new(store: Store, key_file: &Path) -> AppResult<Self> {
        Ok(Self {
            store,
            key: Arc::new(load_or_create_key(key_file)?),
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(45))
                .build()
                .map_err(|e| AppError::Internal(e.into()))?,
            pool: Arc::new(Mutex::new(HashMap::new())),
        })
    }
    async fn servers(&self) -> AppResult<Vec<Server>> {
        let raw = match self.store.setting("native_mcp_servers").await {
            Ok(v) => v,
            Err(AppError::NotFound) => return Ok(vec![]),
            Err(e) => return Err(e),
        };
        Ok(serde_json::from_str(&decrypt(&self.key, &raw)?)?)
    }
    pub async fn list(&self) -> AppResult<Value> {
        Ok(json!(self.servers().await?.iter().map(|s|json!({"id":s.id,"name":s.name,"transport":s.transport,"url":s.url,"command":s.command,"hasToken":!s.token.is_empty(),"envKeys":s.env.keys().collect::<Vec<_>>(),"timeoutSeconds":s.timeout_seconds,"autoApprove":s.auto_approve})).collect::<Vec<_>>()))
    }
    pub async fn save(&self, mut server: Server) -> AppResult<Server> {
        if server.name.trim().is_empty() {
            return Err(bad_request("MCP name is required"));
        }
        match server.transport.as_str() {
            "stdio" if !server.command.is_empty() && !server.command[0].is_empty() => {}
            "http" => {
                let u = reqwest::Url::parse(&server.url).map_err(|e| bad_request(e.to_string()))?;
                if !matches!(u.scheme(), "http" | "https") {
                    return Err(bad_request("HTTP(S) MCP URL required"));
                }
            }
            _ => return Err(bad_request("MCP transport must be stdio or http")),
        }
        let mut all = self.servers().await?;
        if server.id.is_empty() {
            if all.len() >= 16 {
                return Err(bad_request("Maximum 16 MCP servers"));
            }
            server.id = new_id();
        } else if let Some(old) = all.iter().find(|s| s.id == server.id) {
            if server.token.is_empty() {
                server.token = old.token.clone();
            }
            if server.env.is_empty() {
                server.env = old.env.clone();
            } else {
                let mut merged = old.env.clone();
                merged.extend(server.env);
                server.env = merged;
            }
        } else {
            return Err(AppError::NotFound);
        }
        all.retain(|s| s.id != server.id);
        let saved = server.clone();
        all.push(server);
        self.store
            .set_setting(
                "native_mcp_servers",
                &encrypt(&self.key, &serde_json::to_string(&all)?)?,
            )
            .await?;
        self.pool.lock().await.clear();
        Ok(saved)
    }
    pub async fn delete(&self, id: &str) -> AppResult<()> {
        let mut all = self.servers().await?;
        all.retain(|s| s.id != id);
        self.store
            .set_setting(
                "native_mcp_servers",
                &encrypt(&self.key, &serde_json::to_string(&all)?)?,
            )
            .await?;
        self.pool.lock().await.clear();
        Ok(())
    }
    pub async fn maintain(&self) {
        self.pool.lock().await.retain(|_, c| {
            c.touched.elapsed() < Duration::from_secs(60) || Arc::strong_count(&c.link) > 1
        });
    }
    pub async fn stop(&self) {
        self.pool.lock().await.clear();
    }
    pub fn stop_now(&self) {
        if let Ok(mut pool) = self.pool.try_lock() {
            pool.clear();
        }
    }
    /// Ids among `ids` that are configured to skip per-call approval.
    pub async fn auto_approved(&self, ids: &[String]) -> AppResult<Vec<String>> {
        Ok(self
            .servers()
            .await?
            .into_iter()
            .filter(|s| s.auto_approve && ids.iter().any(|id| *id == s.id))
            .map(|s| s.id)
            .collect())
    }
    pub async fn test(&self, id: &str) -> AppResult<Value> {
        let result = self
            .call(&std::env::temp_dir(), id, "tools/list", json!({}))
            .await?;
        let tools = result["tools"].as_array().map(Vec::len).unwrap_or(0);
        Ok(json!({"ok": true, "tools": tools}))
    }
    pub async fn call(
        &self,
        root: &Path,
        id: &str,
        method: &str,
        params: Value,
    ) -> AppResult<Value> {
        let key = format!("{}:{id}", root.display());
        let mut pool = self.pool.lock().await;
        let link = if let Some(c) = pool.get_mut(&key) {
            c.touched = Instant::now();
            c.link.clone()
        } else {
            if pool.len() >= 8 {
                return Err(bad_request(
                    "MCP connection limit reached; idle connections expire after 60 seconds",
                ));
            }
            let server = self
                .servers()
                .await?
                .into_iter()
                .find(|s| s.id == id)
                .ok_or(AppError::NotFound)?;
            let mut link = Link {
                server,
                client: self.client.clone(),
                session: None,
                version: "2025-03-26".into(),
                id: 0,
                process: None,
            };
            if link.server.transport == "stdio" {
                let mut cmd = tokio::process::Command::new(&link.server.command[0]);
                cmd.args(&link.server.command[1..])
                    .current_dir(root)
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::null())
                    .kill_on_drop(true);
                cmd.envs(&link.server.env);
                #[cfg(unix)]
                cmd.process_group(0);
                let mut child = cmd.spawn()?;
                let input = child
                    .stdin
                    .take()
                    .ok_or_else(|| bad_request("MCP stdin unavailable"))?;
                let output = child
                    .stdout
                    .take()
                    .ok_or_else(|| bad_request("MCP stdout unavailable"))?;
                link.process = Some((child, input, BufReader::new(output)));
            }
            let budget = Duration::from_secs(link.server.timeout_seconds.clamp(5, 600));
            let initialized=tokio::time::timeout(budget,link.rpc("initialize",json!({"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"Toph","version":crate::VERSION}}),false)).await.map_err(|_|bad_request("MCP initialize timed out"))??;
            link.version = initialized["protocolVersion"]
                .as_str()
                .unwrap_or("2025-03-26")
                .into();
            link.rpc("notifications/initialized", json!({}), true)
                .await?;
            let link = Arc::new(Mutex::new(link));
            pool.insert(
                key.clone(),
                Cached {
                    touched: Instant::now(),
                    link: link.clone(),
                },
            );
            link
        };
        drop(pool);
        let budget = Duration::from_secs(link.lock().await.server.timeout_seconds.clamp(5, 600));
        let result = match tokio::time::timeout(budget, async {
            link.lock().await.rpc(method, params, false).await
        })
        .await
        {
            Ok(result) => result,
            Err(_) => Err(bad_request(
                "MCP tool timed out; inspect effects before retrying",
            )),
        };
        if result.is_err() {
            self.pool.lock().await.remove(&key);
        }
        result
    }
}

impl Link {
    async fn rpc(&mut self, method: &str, params: Value, notification: bool) -> AppResult<Value> {
        self.id += 1;
        let id = self.id;
        let mut body = json!({"jsonrpc":"2.0","method":method,"params":params});
        if !notification {
            body["id"] = json!(id);
        }
        let value = if let Some((_, input, output)) = &mut self.process {
            input.write_all(format!("{body}\n").as_bytes()).await?;
            input.flush().await?;
            if notification {
                return Ok(Value::Null);
            }
            loop {
                let mut bytes = Vec::new();
                loop {
                    let buf = output.fill_buf().await?;
                    if buf.is_empty() {
                        return Err(bad_request("MCP process closed stdout"));
                    }
                    let end = buf.iter().position(|b| *b == b'\n');
                    let n = end.map(|n| n + 1).unwrap_or(buf.len());
                    bytes.extend_from_slice(&buf[..n]);
                    output.consume(n);
                    if bytes.len() > MAX_RESPONSE_BYTES {
                        return Err(AppError::TooLarge);
                    }
                    if end.is_some() {
                        break;
                    }
                }
                let value: Value = serde_json::from_slice(&bytes)?;
                if value["id"] == id && value.get("method").is_none() {
                    break value;
                }
                if value.get("id").is_some() && value.get("method").is_some() {
                    input.write_all(format!("{}\n",json!({"jsonrpc":"2.0","id":value["id"],"error":{"code":-32601,"message":"Client method not supported"}})).as_bytes()).await?;
                }
            }
        } else {
            let mut request = self
                .client
                .post(&self.server.url)
                .header("Accept", "application/json, text/event-stream")
                .header("MCP-Protocol-Version", &self.version)
                .json(&body);
            if !self.server.token.is_empty() {
                request = request.bearer_auth(&self.server.token);
            }
            if let Some(session) = &self.session {
                request = request.header("Mcp-Session-Id", session);
            }
            let mut response = request
                .send()
                .await
                .map_err(|e| AppError::Upstream(e.to_string()))?;
            if !response.status().is_success() {
                return Err(AppError::Upstream(format!(
                    "MCP returned {}",
                    response.status()
                )));
            }
            if let Some(session) = response
                .headers()
                .get("Mcp-Session-Id")
                .and_then(|s| s.to_str().ok())
            {
                self.session = Some(session.into());
            }
            if notification {
                return Ok(Value::Null);
            }
            let sse = response
                .headers()
                .get("Content-Type")
                .and_then(|s| s.to_str().ok())
                .is_some_and(|s| s.starts_with("text/event-stream"));
            let mut bytes = Vec::new();
            let mut found = None;
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|e| AppError::Upstream(e.to_string()))?
            {
                bytes.extend_from_slice(&chunk);
                if bytes.len() > MAX_RESPONSE_BYTES {
                    return Err(AppError::TooLarge);
                }
                if sse {
                    while let Some(i) = bytes.iter().position(|b| *b == b'\n') {
                        let line = bytes.drain(..=i).collect::<Vec<_>>();
                        let line = String::from_utf8_lossy(&line);
                        if let Some(data) = line.trim().strip_prefix("data:") {
                            let v: Value = serde_json::from_str(data.trim())?;
                            if v["id"] == id {
                                found = Some(v);
                                break;
                            }
                        }
                    }
                    if found.is_some() {
                        break;
                    }
                }
            }
            if sse {
                found.ok_or_else(|| bad_request("MCP stream ended without a response"))?
            } else {
                serde_json::from_slice(&bytes)?
            }
        };
        if let Some(error) = value.get("error") {
            return Err(AppError::Upstream(format!("MCP: {error}")));
        }
        value
            .get("result")
            .cloned()
            .ok_or_else(|| bad_request("MCP response has no result"))
    }
}
