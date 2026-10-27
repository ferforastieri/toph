use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::http::{HeaderMap, Method, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use futures_util::StreamExt;
use reqwest::{Client, Url};
use serde_json::Value;

use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct OpenCodeProxy {
    inner: Arc<ProxyInner>,
}

struct ProxyInner {
    base: RwLock<Option<Url>>,
    auth: RwLock<String>,
    generation: AtomicU64,
    stopped: AtomicBool,
    on_idle: RwLock<Option<Arc<dyn Fn() + Send + Sync>>>,
    client: Client,
}

impl OpenCodeProxy {
    pub fn new(raw_url: &str, auth: &str) -> AppResult<Self> {
        let proxy = Self {
            inner: Arc::new(ProxyInner {
                base: RwLock::new(None),
                auth: RwLock::new(auth.to_string()),
                generation: AtomicU64::new(0),
                stopped: AtomicBool::new(false),
                on_idle: RwLock::new(None),
                client: Client::builder()
                    .connect_timeout(Duration::from_secs(10))
                    .build()
                    .map_err(|error| AppError::Internal(error.into()))?,
            }),
        };
        proxy.set_config(raw_url, auth)?;
        Ok(proxy)
    }

    pub fn set_config(&self, raw_url: &str, auth: &str) -> AppResult<()> {
        let parsed = Url::parse(raw_url.trim_end_matches('/'))
            .map_err(|error| crate::errors::bad_request(error.to_string()))?;
        if !matches!(parsed.scheme(), "http" | "https") {
            return Err(crate::errors::bad_request("scheme must be http or https"));
        }
        self.inner.stopped.store(false, Ordering::SeqCst);
        if let Ok(mut base) = self.inner.base.write() {
            *base = Some(parsed);
        }
        if let Ok(mut current) = self.inner.auth.write() {
            *current = auth.to_string();
        }
        self.inner.generation.fetch_add(1, Ordering::SeqCst);
        self.start_monitor();
        Ok(())
    }

    pub fn stop(&self) {
        self.inner.stopped.store(true, Ordering::SeqCst);
        self.inner.generation.fetch_add(1, Ordering::SeqCst);
    }

    pub fn set_idle_handler<F>(&self, handler: F)
    where
        F: Fn() + Send + Sync + 'static,
    {
        if let Ok(mut callback) = self.inner.on_idle.write() {
            *callback = Some(Arc::new(handler));
        }
        self.inner.generation.fetch_add(1, Ordering::SeqCst);
        self.start_monitor();
    }

    fn config(&self) -> Option<(Url, String)> {
        let base = self.inner.base.read().ok()?.clone()?;
        let auth = self.inner.auth.read().ok()?.clone();
        Some((base, auth))
    }

    pub async fn proxy(
        &self,
        rest: String,
        method: Method,
        uri: Uri,
        headers: HeaderMap,
        body: Body,
    ) -> Response {
        let Some((base, auth)) = self.config() else {
            return (
                StatusCode::BAD_GATEWAY,
                axum::Json(serde_json::json!({ "error": "opencode is not configured" })),
            )
                .into_response();
        };
        let mut target = base.clone();
        target.set_path(&format!("/{}", rest.trim_start_matches('/')));
        target.set_query(uri.query());
        let body_bytes = match axum::body::to_bytes(body, 32 * 1024 * 1024).await {
            Ok(bytes) => bytes,
            Err(error) => {
                return AppError::BadRequest(format!("invalid request body: {error}"))
                    .into_response()
            }
        };
        let mut request = self
            .inner
            .client
            .request(method.clone(), target.clone())
            .body(body_bytes);
        for (name, value) in headers.iter() {
            let name_text = name.as_str();
            if matches!(
                name_text,
                "host"
                    | "cookie"
                    | "authorization"
                    | "x-toph-csrf"
                    | "content-length"
                    | "connection"
                    | "accept-encoding"
            ) {
                continue;
            }
            if let Ok(value) = value.to_str() {
                request = request.header(name, value);
            }
        }
        if !auth.is_empty() {
            request = request.header("Authorization", auth);
        }
        let response = match request.send().await {
            Ok(response) => response,
            Err(error) => {
                tracing::warn!(%error, path = %target, "opencode proxy error");
                return (
                    StatusCode::BAD_GATEWAY,
                    axum::Json(serde_json::json!({ "error": "opencode unavailable" })),
                )
                    .into_response();
            }
        };
        let status = response.status();
        let headers = response.headers().clone();
        let stream = response.bytes_stream().map(|chunk| {
            chunk.map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))
        });
        let mut builder = Response::builder().status(status);
        for (name, value) in headers.iter() {
            if matches!(
                name.as_str(),
                "connection" | "transfer-encoding" | "content-length" | "content-encoding"
            ) {
                continue;
            }
            builder = builder.header(name, value);
        }
        builder
            .body(Body::from_stream(stream))
            .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
    }

    fn start_monitor(&self) {
        if self.inner.stopped.load(Ordering::SeqCst) {
            return;
        }
        let has_callback = self
            .inner
            .on_idle
            .read()
            .map(|callback| callback.is_some())
            .unwrap_or(false);
        if !has_callback {
            return;
        }
        let Some((base, auth)) = self.config() else {
            return;
        };
        let generation = self.inner.generation.load(Ordering::SeqCst);
        let inner = self.inner.clone();
        tokio::spawn(async move {
            loop {
                if inner.stopped.load(Ordering::SeqCst)
                    || inner.generation.load(Ordering::SeqCst) != generation
                {
                    return;
                }
                if let Err(error) = consume_events(&inner, &base, &auth, generation).await {
                    tracing::debug!(%error, "opencode event monitor disconnected");
                }
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        });
    }
}

async fn consume_events(
    inner: &Arc<ProxyInner>,
    base: &Url,
    auth: &str,
    generation: u64,
) -> anyhow::Result<()> {
    let mut url = base.clone();
    url.set_path("/api/event");
    let mut request = inner.client.get(url).header("Accept", "text/event-stream");
    if !auth.is_empty() {
        request = request.header("Authorization", auth);
    }
    let response = request.send().await?;
    if !response.status().is_success() {
        anyhow::bail!("opencode events returned {}", response.status());
    }
    let mut stream = response.bytes_stream();
    let mut pending = Vec::<u8>::new();
    let mut data_lines: Vec<String> = Vec::new();
    let mut busy = false;
    let mut last_idle = Instant::now() - Duration::from_secs(10);
    while let Some(chunk) = stream.next().await {
        if inner.stopped.load(Ordering::SeqCst)
            || inner.generation.load(Ordering::SeqCst) != generation
        {
            return Ok(());
        }
        let chunk = chunk?;
        pending.extend_from_slice(&chunk);
        while let Some(index) = pending.iter().position(|byte| *byte == b'\n') {
            let line = String::from_utf8_lossy(&pending[..index])
                .trim_end_matches('\r')
                .to_string();
            pending.drain(..=index);
            if line.is_empty() {
                flush_event(&data_lines, &mut busy, &mut last_idle, inner);
                data_lines.clear();
            } else if let Some(data) = line.strip_prefix("data:") {
                data_lines.push(data.trim().to_string());
            }
        }
    }
    flush_event(&data_lines, &mut busy, &mut last_idle, inner);
    Ok(())
}

fn flush_event(
    data_lines: &[String],
    busy: &mut bool,
    last_idle: &mut Instant,
    inner: &Arc<ProxyInner>,
) {
    if data_lines.is_empty() {
        return;
    }
    let raw = data_lines.join("\n");
    let Ok(event) = serde_json::from_str::<Value>(&raw) else {
        return;
    };
    let event_type = event.get("type").and_then(Value::as_str).unwrap_or("");
    match event_type {
        "session.execution.started" => *busy = true,
        "session.status" => {
            let status = event
                .pointer("/data/status/type")
                .and_then(Value::as_str)
                .unwrap_or("");
            match status {
                "busy" => *busy = true,
                "idle" => notify_if_idle(busy, last_idle, inner),
                _ => {}
            }
        }
        "session.execution.succeeded"
        | "session.execution.interrupted"
        | "session.execution.failed"
        | "session.idle" => notify_if_idle(busy, last_idle, inner),
        _ => {}
    }
}

fn notify_if_idle(busy: &mut bool, last_idle: &mut Instant, inner: &Arc<ProxyInner>) {
    if !*busy {
        return;
    }
    *busy = false;
    if last_idle.elapsed() < Duration::from_secs(3) {
        return;
    }
    *last_idle = Instant::now();
    if let Ok(callback) = inner.on_idle.read() {
        if let Some(callback) = callback.as_ref() {
            callback();
        }
    }
}
