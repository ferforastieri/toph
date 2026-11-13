#[path = "../features/auth/routes.rs"]
mod auth_routes;
use auth_routes::*;
#[path = "../features/updates/routes.rs"]
mod updates_routes;
use updates_routes::*;
#[path = "../features/notifications/routes.rs"]
mod notifications_routes;
use notifications_routes::*;
#[path = "../features/projects/routes.rs"]
mod projects_routes;
use projects_routes::*;
#[path = "../features/workspace/routes.rs"]
mod workspace_routes;
use workspace_routes::*;
#[path = "../features/conversations/routes.rs"]
mod conversations_routes;
use conversations_routes::*;
#[path = "../features/terminals/routes.rs"]
mod terminals_routes;
use terminals_routes::*;
#[path = "../features/debug/routes.rs"]
mod debug_routes;
use debug_routes::*;
#[path = "../features/providers/routes.rs"]
mod providers_routes;
use providers_routes::*;
#[path = "../features/integrations/email/routes.rs"]
mod integrations_email_routes;
use integrations_email_routes::*;
#[path = "../features/database_connections/routes.rs"]
mod database_connections_routes;
use database_connections_routes::*;
#[path = "../features/previews/routes.rs"]
mod previews_routes;
use previews_routes::*;
#[path = "../features/agents/routes.rs"]
mod agent_routes;
use agent_routes::*;

use std::borrow::Cow;
use std::collections::{HashMap, VecDeque};
use std::net::SocketAddr;
use std::path::{Path as FsPath, PathBuf};
use std::sync::{Arc, Mutex, Once};
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, DefaultBodyLimit, Extension, Path, Query, State};
use axum::http::header::{self, HeaderValue};
use axum::http::{HeaderMap, Method, Request, StatusCode, Uri};
use axum::middleware::{self, Next};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{any, delete, get, post};
use axum::{Json, Router};
use base64::Engine as _;
use ipnet::IpNet;
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use subtle::ConstantTimeEq;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, oneshot};
use tokio::task::JoinHandle;
use tower_http::compression::CompressionLayer;
use tower_http::trace::TraceLayer;

use crate::ai::{AiService, CompleteInput, Message as AiMessage};
use crate::auth::AuthManager;
use crate::config::Config;
use crate::crypto::new_id;
use crate::database::{DatabaseService, ProfileInput, RowChange};
use crate::debug::{DebugManager, DebugStartInput};
use crate::email::{AccountInput, EmailService, PublicAccount, SendInput, DEFAULT_LIST_LIMIT};
use crate::errors::{AppError, AppResult};
use crate::events::{EventHub, ProjectWatcher};
use crate::features::agents::{
    runtime::{CompletionNotice, Runtime as AgentRuntime},
    tools::Tools as AgentTools,
};
use crate::features::integrations::mcp::Service as McpService;
use crate::model::{DbProfile, Project, Session, User, WebTarget};
use crate::platform::instance_lock::InstanceLock;
use crate::push::{PushMessage, PushService};
use crate::store::{Store, WorkspaceMessageCursor};
use crate::terminal::TerminalManager;
use crate::update::{UpdateManager, UpdateStart, UpdateStatus, VERSION};
use crate::workspace::WorkspaceService;

const SESSION_COOKIE: &str = "toph_session";
const CSRF_COOKIE: &str = "toph_csrf";
const CSRF_HEADER: &str = "x-toph-csrf";

/// One-time codes that let a phone join a local server without typing the
/// generated admin password. Codes live in memory only: they expire after ten
/// minutes, are consumed on first use and disappear when the server restarts.
pub struct PairingCodes {
    codes: Mutex<HashMap<String, PairingEntry>>,
}

struct PairingEntry {
    user_id: i64,
    expires: Instant,
}

impl Default for PairingCodes {
    fn default() -> Self {
        Self {
            codes: Mutex::new(HashMap::new()),
        }
    }
}

impl PairingCodes {
    const TTL: Duration = Duration::from_secs(10 * 60);

    fn prune(&self, codes: &mut HashMap<String, PairingEntry>) {
        let now = Instant::now();
        codes.retain(|_, entry| entry.expires > now);
    }

    fn issue(&self, user_id: i64) -> (String, u64) {
        let code = crate::crypto::random_secret(24);
        let expires = Instant::now() + Self::TTL;
        if let Ok(mut codes) = self.codes.lock() {
            self.prune(&mut codes);
            // A single local user only needs a handful of live codes.
            if codes.len() >= 16 {
                codes.clear();
            }
            codes.insert(code.clone(), PairingEntry { user_id, expires });
        }
        (code, Self::TTL.as_secs())
    }

    fn consume(&self, code: &str) -> Option<i64> {
        let mut codes = self.codes.lock().ok()?;
        self.prune(&mut codes);
        codes.remove(code).map(|entry| entry.user_id)
    }
}

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub store: Store,
    pub auth: AuthManager,
    pub workspace: WorkspaceService,
    pub terminals: Arc<TerminalManager>,
    pub debug: Arc<DebugManager>,
    pub database: DatabaseService,
    pub email: EmailService,
    pub ai: AiService,
    pub agents: AgentRuntime,
    pub mcp: McpService,
    pub push: PushService,
    pub events: EventHub,
    pub watcher: Arc<ProjectWatcher>,
    pub notifications: broadcast::Sender<NotificationEvent>,
    pub update: UpdateManager,
    pub http: reqwest::Client,
    pub preview_http: reqwest::Client,
    pub pairing: Arc<PairingCodes>,
    login_limiter: Arc<RateLimiter>,
    api_limiter: Arc<RateLimiter>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NotificationEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub title: String,
    pub body: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "notificationId", skip_serializing_if = "Option::is_none")]
    pub notification_id: Option<String>,
    #[serde(rename = "projectId", skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(rename = "projectName", skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    #[serde(rename = "chatId", skip_serializing_if = "Option::is_none")]
    pub chat_id: Option<String>,
    #[serde(rename = "botId", skip_serializing_if = "Option::is_none")]
    pub bot_id: Option<String>,
    #[serde(rename = "botName", skip_serializing_if = "Option::is_none")]
    pub bot_name: Option<String>,
    #[serde(rename = "botRole", skip_serializing_if = "Option::is_none")]
    pub bot_role: Option<String>,
    #[serde(rename = "sessionId", skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(rename = "tabId", skip_serializing_if = "Option::is_none")]
    pub tab_id: Option<String>,
}

fn notification_preview(text: &str) -> String {
    let mut clean = String::new();
    let mut in_code = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            in_code = !in_code;
            continue;
        }
        if in_code || trimmed.is_empty() {
            continue;
        }
        let line = trimmed.trim_start_matches(['#', '>', '-', '*', '`']).trim();
        if line.is_empty() {
            continue;
        }
        if !clean.is_empty() {
            clean.push(' ');
        }
        clean.push_str(line);
        if clean.chars().count() >= 240 {
            break;
        }
    }
    let clean: String = clean.chars().take(240).collect();
    if clean.trim().is_empty() {
        "A execução terminou sem resposta textual.".into()
    } else {
        clean
    }
}

#[derive(Clone)]
struct AuthContext {
    session: Session,
    user: User,
    from_cookie: bool,
}

struct RateLimiter {
    entries: Mutex<HashMap<String, VecDeque<Instant>>>,
    limit: usize,
    window: Duration,
}

impl RateLimiter {
    fn new(limit: usize, window: Duration) -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            limit,
            window,
        }
    }

    fn allow(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut entries = match self.entries.lock() {
            Ok(entries) => entries,
            Err(_) => return false,
        };
        let queue = entries.entry(key.to_string()).or_default();
        while queue
            .front()
            .is_some_and(|time| now.duration_since(*time) > self.window)
        {
            queue.pop_front();
        }
        if queue.len() >= self.limit {
            return false;
        }
        queue.push_back(now);
        true
    }

    fn reset(&self, key: &str) {
        if let Ok(mut entries) = self.entries.lock() {
            entries.remove(key);
        }
    }

    fn prune(&self) {
        let now = Instant::now();
        if let Ok(mut entries) = self.entries.lock() {
            entries.retain(|_, queue| {
                queue
                    .back()
                    .is_some_and(|time| now.duration_since(*time) <= self.window)
            });
        }
    }
}

impl AppState {
    pub async fn build(config: Config) -> AppResult<Arc<Self>> {
        static DRIVERS: Once = Once::new();
        DRIVERS.call_once(sqlx::any::install_default_drivers);

        config.ensure_dirs()?;
        let store = Store::open(&config.data_dir.join("toph.db")).await?;
        let auth = AuthManager::new(store.clone(), config.secure_cookies);
        if let Some(password) = auth.bootstrap(&config.admin_password).await? {
            eprintln!(
                "\n  Toph initial admin password: {password}\n  Set TOPH_ADMIN_PASSWORD before the next start if you want a fixed password.\n"
            );
        }

        let mut roots = config.workspace_roots.clone();
        if let Ok(raw) = store.setting("workspace_roots").await {
            if let Ok(saved) = serde_json::from_str::<Vec<PathBuf>>(&raw) {
                if !saved.is_empty() {
                    roots = saved;
                }
            }
        }
        let workspace = WorkspaceService::new(roots)?;
        let terminals = Arc::new(TerminalManager::new(None));
        let debug = Arc::new(DebugManager::new());
        let database = DatabaseService::new(store.clone(), &config.master_key_file)?;
        let email = EmailService::new(store.clone(), &config.data_dir, &config.master_key_file)?;
        let ai = AiService::new(store.clone(), &config.master_key_file)?;
        let mcp = McpService::new(store.clone(), &config.master_key_file)?;
        let push = PushService::new(
            store.clone(),
            config.firebase_file.as_deref(),
            &config.firebase_project,
        );
        let events = EventHub::new();
        let agents = AgentRuntime::new(
            store.clone(),
            AgentTools {
                store: store.clone(),
                ai: ai.clone(),
                workspace: workspace.clone(),
                email: email.clone(),
                artifacts: config.data_dir.join("agent-artifacts"),
                mcp: mcp.clone(),
                http: reqwest::Client::builder()
                    .timeout(Duration::from_secs(30))
                    .build()
                    .map_err(|e| AppError::Internal(e.into()))?,
            },
            events.clone(),
        )
        .await?;
        let watcher = Arc::new(ProjectWatcher::new(events.clone()));
        let (notifications, _) = broadcast::channel(64);
        let state = Arc::new(Self {
            login_limiter: Arc::new(RateLimiter::new(10, Duration::from_secs(5 * 60))),
            api_limiter: Arc::new(RateLimiter::new(1200, Duration::from_secs(60))),
            update: UpdateManager::new(&config),
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(15))
                .build()
                .map_err(|error| AppError::Internal(error.into()))?,
            // Homelab services often use self-signed certificates. The preview
            // only fetches a page the user asked for, so accept them there and
            // nowhere else.
            preview_http: reqwest::Client::builder()
                .timeout(Duration::from_secs(20))
                .danger_accept_invalid_certs(true)
                .redirect(reqwest::redirect::Policy::limited(6))
                .build()
                .map_err(|error| AppError::Internal(error.into()))?,
            config,
            store,
            auth,
            pairing: Arc::new(PairingCodes::default()),
            workspace,
            terminals,
            debug,
            database,
            email,
            ai,
            agents,
            mcp,
            push,
            events,
            watcher,
            notifications,
        });

        let notify_state = Arc::downgrade(&state);
        state.agents.set_on_complete(move |notice| {
            if let Some(state) = notify_state.upgrade() {
                tokio::spawn(async move {
                    state.emit_agent_completion(notice).await;
                });
            }
        });
        if state.store.list_projects().await?.is_empty() {
            let _ = state.ensure_default_project().await;
        }
        let projects = state.store.list_projects().await?;
        state
            .watcher
            .watch_existing(&projects, &state.config.workspace_roots);

        let migration_state = state.clone();
        tokio::spawn(async move {
            migrate_inline_images(migration_state).await;
        });

        let maintain_state = Arc::downgrade(&state);
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(Duration::from_secs(4));
            loop {
                ticker.tick().await;
                let Some(state) = maintain_state.upgrade() else {
                    break;
                };
                state.debug.maintain().await;
                state.agents.maintain().await;
                state.login_limiter.prune();
                state.api_limiter.prune();
            }
        });

        Ok(state)
    }

    pub fn emit_ai_response(&self) {
        let event = NotificationEvent {
            event_type: "ai.done".into(),
            title: "Resposta da IA".into(),
            body: "A IA terminou de responder.".into(),
            created_at: chrono::Utc::now().timestamp_millis(),
            notification_id: None,
            project_id: None,
            project_name: None,
            chat_id: None,
            bot_id: None,
            bot_name: None,
            bot_role: None,
            session_id: None,
            tab_id: None,
        };
        let _ = self.notifications.send(event);
        if self.push.enabled() {
            let push = self.push.clone();
            tokio::spawn(async move { push.notify_ai().await });
        }
    }

    pub async fn emit_agent_completion(&self, notice: CompletionNotice) {
        let project_name = self
            .store
            .project(&notice.project_id)
            .await
            .map(|project| project.name)
            .unwrap_or_default();
        let title = if project_name.is_empty() {
            notice.agent_name.clone()
        } else {
            format!("{} · {}", notice.agent_name, project_name)
        };
        let body = notification_preview(&notice.text);
        let notification_id = crate::crypto::new_id();
        let tab_id = format!("bots:{}", notice.project_id);
        let event = NotificationEvent {
            event_type: "ai.done".into(),
            title: title.clone(),
            body: body.clone(),
            created_at: chrono::Utc::now().timestamp_millis(),
            notification_id: Some(notification_id.clone()),
            project_id: Some(notice.project_id.clone()),
            project_name: Some(project_name.clone()),
            chat_id: Some(notice.chat_id.clone()),
            bot_id: Some(notice.agent_id.clone()),
            bot_name: Some(notice.agent_name.clone()),
            bot_role: (!notice.agent_role.is_empty()).then(|| notice.agent_role.clone()),
            session_id: Some(notice.session_id.clone()),
            tab_id: Some(tab_id.clone()),
        };
        let stored = crate::features::notifications::repository::StoredNotification {
            id: notification_id.clone(),
            kind: "ai".into(),
            title: event.title.clone(),
            body: event.body.clone(),
            project_id: Some(notice.project_id.clone()),
            project_name: (!project_name.is_empty()).then(|| project_name.clone()),
            chat_id: Some(notice.chat_id.clone()),
            session_id: Some(notice.session_id.clone()),
            bot_id: Some(notice.agent_id.clone()),
            bot_name: Some(notice.agent_name.clone()),
            bot_role: (!notice.agent_role.is_empty()).then(|| notice.agent_role.clone()),
            notification_id: Some(notification_id.clone()),
            created_at: event.created_at,
            is_read: false,
        };
        if let Err(error) = self.store.save_notification(notice.user_id, &stored).await {
            tracing::warn!(%error, "could not persist notification");
        }
        let _ = self.notifications.send(event);
        if self.push.enabled() {
            let message = PushMessage {
                title,
                body,
                data: vec![
                    ("projectId".into(), notice.project_id),
                    ("projectName".into(), project_name),
                    ("chatId".into(), notice.chat_id),
                    ("botId".into(), notice.agent_id),
                    ("botName".into(), notice.agent_name),
                    ("botRole".into(), notice.agent_role),
                    ("sessionId".into(), notice.session_id),
                    ("tabId".into(), tab_id),
                    ("notificationId".into(), notification_id),
                ],
            };
            let push = self.push.clone();
            tokio::spawn(async move { push.notify(&message).await });
        }
    }

    async fn ensure_default_project(&self) -> AppResult<()> {
        let projects = self.store.list_projects().await?;
        if !projects.is_empty() {
            return Ok(());
        }
        let Some(root) = self.config.workspace_roots.first() else {
            return Ok(());
        };
        let Ok(root) = self.workspace.validate_root(root) else {
            return Ok(());
        };
        let name = root
            .file_name()
            .and_then(|value| value.to_str())
            .filter(|value| !value.is_empty())
            .unwrap_or("workspace")
            .to_string();
        let project = Project {
            id: new_id(),
            name,
            root: root.to_string_lossy().to_string(),
            color: "#FFB547".into(),
            created_at: String::new(),
            updated_at: String::new(),
        };
        let created = self.store.create_project(project).await?;
        self.watch_project(&created.id, FsPath::new(&created.root))
            .await?;
        Ok(())
    }

    async fn watch_project(&self, project_id: &str, root: &FsPath) -> AppResult<()> {
        // A project that covers an entire workspace root would otherwise
        // duplicate the watcher of every project nested below it. Keep the
        // parent shallow in that case; nested projects have their own trees.
        let projects = self.store.list_projects().await?;
        let nested = projects.iter().any(|other| {
            other.id != project_id
                && FsPath::new(&other.root) != root
                && FsPath::new(&other.root).starts_with(root)
        });
        let at_workspace_root = self
            .config
            .workspace_roots
            .iter()
            .any(|workspace| workspace == root);
        self.watcher
            .watch(project_id, root, !(at_workspace_root && nested))
    }

    fn publish_project_root(&self, root: &str, event_type: &str, path: Option<String>) {
        let store = self.store.clone();
        let hub = self.events.clone();
        let root = root.to_string();
        let event_type = event_type.to_string();
        tokio::spawn(async move {
            if let Ok(project) = store.project_by_root(&root).await {
                hub.publish(&project.id, &event_type, path);
            }
        });
    }

    fn publish_git(&self, project_id: &str, path: Option<String>) {
        self.events.publish(project_id, "git", path.clone());
        self.events.publish(project_id, "files", path);
    }
}

pub struct EmbeddedServer {
    pub addr: SocketAddr,
    shutdown: Option<oneshot::Sender<()>>,
    task: JoinHandle<()>,
    state: Option<Arc<AppState>>,
    _lock: Option<InstanceLock>,
}

impl EmbeddedServer {
    pub fn shutdown(mut self) {
        if let Some(state) = self.state.take() {
            state.agents.shutdown();
            state.watcher.stop_all();
            state.terminals.close_all();
            state.debug.close_all_now();
        }
        if let Some(sender) = self.shutdown.take() {
            let _ = sender.send(());
        }
        self.task.abort();
    }
}

pub async fn start_embedded(config: Config) -> AppResult<EmbeddedServer> {
    // Hold the data directory before `build` runs `recover`: a second embedded
    // server must not mark this one's live runs as interrupted.
    let lock = InstanceLock::acquire(&config.data_dir)?;
    // The embedded server uses the configured address so desktop local mode can
    // optionally listen on the LAN. `port 0` still picks a free ephemeral port.
    let addr = config.addr.clone();
    let state = AppState::build(config).await?;
    let listener = TcpListener::bind(&addr).await?;
    let addr = listener.local_addr()?;
    let app = router(state.clone());
    let (shutdown, receiver) = oneshot::channel();
    let task = tokio::spawn(async move {
        let server = axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        );
        let _ = server
            .with_graceful_shutdown(async {
                let _ = receiver.await;
            })
            .await;
    });
    Ok(EmbeddedServer {
        addr,
        shutdown: Some(shutdown),
        task,
        state: Some(state),
        _lock: Some(lock),
    })
}

pub async fn serve(config: Config) -> AppResult<()> {
    // A second process on the same data directory would run `recover()` and
    // interrupt this instance's runs. Refuse it before touching the database.
    let _lock = InstanceLock::acquire(&config.data_dir)?;
    let addr = config.addr.clone();
    let state = AppState::build(config).await?;
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!(%addr, data = %state.config.data_dir.display(), "toph listening");
    let server = axum::serve(
        listener,
        router(state.clone()).into_make_service_with_connect_info::<SocketAddr>(),
    );
    tokio::select! {
        result = server => {
            result.map_err(|error| AppError::Internal(error.into()))?;
        }
        _ = shutdown_signal() => {
            tracing::info!("toph shutting down");
        }
    }
    // Long-lived WebSockets and SSE streams do not complete on their own.
    // Stop their producers and leave the process; systemd will start the next
    // binary immediately.
    state.agents.shutdown();
    state.watcher.stop_all();
    state.terminals.close_all();
    state.debug.close_all().await;
    Ok(())
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("install SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = terminate.recv() => {}
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

fn router(state: Arc<AppState>) -> Router {
    let protected = Router::new()
        .route("/api/auth/me", get(me))
        .route("/api/auth/logout", post(logout))
        .route("/api/pairing", post(create_pairing))
        .route("/api/update", get(update_status).post(start_update))
        .route("/api/push/tokens", post(register_push_token))
        .route(
            "/api/notifications",
            get(list_notifications).delete(clear_notifications),
        )
        .route("/api/notifications/read", post(mark_notifications_read))
        .route("/api/notifications/stream", get(notification_stream))
        .route("/api/events/ws", get(events_ws))
        .route("/api/projects", get(list_projects).post(create_project))
        .route(
            "/api/open-projects",
            get(get_open_projects).put(save_open_projects),
        )
        .route(
            "/api/projects/{project_id}",
            get(get_project).put(update_project).delete(delete_project),
        )
        .route("/api/projects/{project_id}/tree", get(tree))
        .route(
            "/api/projects/{project_id}/file",
            get(read_file).put(write_file).delete(delete_path),
        )
        .route("/api/projects/{project_id}/files", get(files))
        .route("/api/projects/{project_id}/mkdir", post(make_dir))
        .route("/api/projects/{project_id}/move", post(move_path))
        .route("/api/projects/{project_id}/upload", post(upload_file))
        .route("/api/projects/{project_id}/raw", get(raw_file))
        .route("/api/projects/{project_id}/search", post(search))
        .route("/api/projects/{project_id}/git/history", get(git_history))
        .route("/api/projects/{project_id}/git/status", get(git_status))
        .route("/api/projects/{project_id}/git/state", get(git_state))
        .route(
            "/api/projects/{project_id}/git/merge/continue",
            post(git_merge_continue),
        )
        .route(
            "/api/projects/{project_id}/git/merge/abort",
            post(git_merge_abort),
        )
        .route(
            "/api/projects/{project_id}/git/branches",
            get(git_branches).delete(git_delete_branches),
        )
        .route(
            "/api/projects/{project_id}/git/checkout",
            post(git_checkout),
        )
        .route("/api/projects/{project_id}/git/diff", get(git_diff))
        .route(
            "/api/projects/{project_id}/git/file",
            get(git_file_versions),
        )
        .route("/api/projects/{project_id}/git/blame", get(git_blame))
        .route("/api/projects/{project_id}/git/stage", post(git_stage))
        .route("/api/projects/{project_id}/git/unstage", post(git_unstage))
        .route("/api/projects/{project_id}/git/commit", post(git_commit))
        .route(
            "/api/projects/{project_id}/git/branch",
            post(git_create_branch),
        )
        .route("/api/projects/{project_id}/git/discard", post(git_discard))
        .route(
            "/api/projects/{project_id}/workspace",
            get(get_layout)
                .put(save_layout)
                .layer(DefaultBodyLimit::max(32 * 1024 * 1024)),
        )
        .route(
            "/api/projects/{project_id}/workspace/messages",
            get(get_workspace_messages)
                .put(save_workspace_messages)
                .delete(delete_workspace_messages)
                .layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route("/api/projects/{project_id}/close", post(close_project))
        .route(
            "/api/projects/{project_id}/terminals",
            get(list_terminals)
                .post(create_terminal)
                .delete(close_terminals),
        )
        .route("/api/terminals/shells", get(terminal_shells))
        .route("/api/terminals/{terminal_id}", delete(close_terminal))
        .route("/api/terminals/{terminal_id}/ws", get(terminal_ws))
        .route("/api/ports", get(list_ports))
        .route("/api/projects/{project_id}/debug/eval", post(debug_eval))
        .route(
            "/api/projects/{project_id}/debug/config",
            get(get_debug_config).put(save_debug_config),
        )
        .route(
            "/api/projects/{project_id}/debug/session",
            get(get_debug_session).post(start_debug).delete(stop_debug),
        )
        .route("/api/projects/{project_id}/debug/ws", get(debug_ws))
        .route(
            "/api/projects/{project_id}/debug/release",
            post(release_debug),
        )
        .route("/api/repos", get(list_repos))
        .route(
            "/api/workspaces/roots",
            get(list_workspace_roots)
                .post(add_workspace_root)
                .delete(remove_workspace_root),
        )
        .route("/api/ai/config", get(get_ai_config).put(save_ai_config))
        .route("/api/ai/models", get(ai_models))
        .route("/api/ai/test", post(test_ai))
        .route("/api/ai/chat", post(chat_ai))
        .route("/api/ai/complete", post(complete_ai))
        .route(
            "/api/email/accounts",
            get(list_email_accounts).post(create_email_account),
        )
        .route(
            "/api/email/accounts/{account_id}",
            delete(delete_email_account),
        )
        .route(
            "/api/email/accounts/{account_id}/test",
            post(test_email_account),
        )
        .route(
            "/api/email/accounts/{account_id}/messages",
            get(list_email_messages),
        )
        .route(
            "/api/email/accounts/{account_id}/messages/{uid}",
            get(get_email_message),
        )
        .route(
            "/api/email/accounts/{account_id}/messages/{uid}/delete",
            post(delete_email_message),
        )
        .route("/api/email/accounts/{account_id}/send", post(send_email))
        .route(
            "/api/db/profiles",
            get(list_db_profiles).post(create_db_profile),
        )
        .route("/api/db/profiles/{profile_id}", delete(delete_db_profile))
        .route("/api/db/profiles/{profile_id}/test", post(test_db_profile))
        .route("/api/db/profiles/{profile_id}/query", post(query_db))
        .route("/api/db/profiles/{profile_id}/schema", get(db_schema))
        .route(
            "/api/db/profiles/{profile_id}/row",
            post(insert_db_row).put(update_db_row).delete(delete_db_row),
        )
        .route(
            "/api/web-targets",
            get(list_web_targets).post(create_web_target),
        )
        .route("/api/web-targets/{target_id}", delete(delete_web_target))
        .route("/api/web-preview", get(web_preview))
        .route("/api/web-preview/{token}", any(web_preview_root))
        .route("/api/web-preview/{token}/", any(web_preview_root))
        .route("/api/web-preview/{token}/{*path}", any(web_preview_asset))
        .route("/api/engines", get(engine_list))
        .route("/api/engines/{engine_id}/test", post(test_engine))
        .route("/api/engines/{engine_id}/install", post(install_engine))
        .route("/api/engines/{engine_id}/update", post(update_engine))
        .route("/api/engines/{engine_id}/limits", get(engine_limits))
        .route(
            "/api/projects/{project_id}/skills",
            get(skills_list).post(save_skill),
        )
        .route("/api/projects/{project_id}/skills/local", get(local_skills))
        .route(
            "/api/projects/{project_id}/skills/catalog",
            get(suggested_skills),
        )
        .route("/api/projects/{project_id}/skills/link", post(link_skill))
        .route(
            "/api/projects/{project_id}/skills/{skill_id}",
            delete(remove_skill),
        )
        .route(
            "/api/projects/{project_id}/skills/{skill_id}/decide",
            post(decide_skill),
        )
        .route(
            "/api/projects/{project_id}/skills/{skill_id}/archive",
            post(archive_skill),
        )
        .route(
            "/api/projects/{project_id}/skills/{skill_id}/versions",
            get(skill_versions),
        )
        .route(
            "/api/projects/{project_id}/skills/{skill_id}/restore",
            post(restore_skill),
        )
        .route(
            "/api/projects/{project_id}/agent/runs",
            get(agent_active_runs)
                .post(start_agent)
                .layer(DefaultBodyLimit::max(32 * 1024 * 1024)),
        )
        .route(
            "/api/projects/{project_id}/agent/cancel",
            post(cancel_project_agents),
        )
        .route(
            "/api/projects/{project_id}/agent/runs/{run_id}/cancel",
            post(cancel_agent),
        )
        .route("/api/projects/{project_id}/agent/search", get(agent_search))
        .route(
            "/api/projects/{project_id}/agent/snapshot",
            get(agent_snapshot),
        )
        .route(
            "/api/projects/{project_id}/agent/sessions",
            get(agent_sessions).post(switch_agent_session),
        )
        .route(
            "/api/projects/{project_id}/agent/chats/{chat_id}",
            delete(delete_chat),
        )
        .route(
            "/api/projects/{project_id}/agent/tophs/{toph_id}",
            delete(delete_toph),
        )
        .route(
            "/api/projects/{project_id}/agent/approvals/{call_id}",
            post(approve_agent),
        )
        .route("/api/projects/{project_id}/agent/events", get(agent_events))
        .route("/api/projects/{project_id}/agent/usage", get(agent_usage))
        .route(
            "/api/projects/{project_id}/agent/artifacts/{artifact_id}",
            get(agent_artifact),
        )
        .route(
            "/api/ai/connections",
            get(ai_connections).post(save_ai_connection),
        )
        .route(
            "/api/ai/connections/{connection_id}",
            delete(delete_ai_connection),
        )
        .route("/api/mcp/servers", get(mcp_servers).post(save_mcp_server))
        .route("/api/mcp/servers/{server_id}", delete(delete_mcp_server))
        .route("/api/mcp/servers/{server_id}/test", post(test_mcp_server))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    Router::new()
        .route("/api/health", get(health))
        .route("/api/version", get(version))
        .route("/api/auth/login", post(login))
        .route("/api/auth/pair", post(pair))
        .merge(protected)
        .fallback(static_handler)
        .layer(middleware::from_fn(security_headers))
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())
        .with_state(state)
}

async fn security_headers(request: Request<Body>, next: Next) -> Response {
    let preview = request.uri().path() == "/api/web-preview"
        || request.uri().path().starts_with("/api/web-preview/");
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        "X-Content-Type-Options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("Referrer-Policy", HeaderValue::from_static("same-origin"));
    headers.insert(
        "X-Frame-Options",
        HeaderValue::from_static(if preview { "SAMEORIGIN" } else { "DENY" }),
    );
    headers.insert(
        "Content-Security-Policy",
        HeaderValue::from_static(if preview {
            "frame-ancestors 'self'"
        } else {
            "frame-ancestors 'none'"
        }),
    );
    headers.insert(
        "Permissions-Policy",
        HeaderValue::from_static("camera=(), microphone=(self), geolocation=()"),
    );
    response
}

fn unsafe_method(method: &Method) -> bool {
    !matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS)
}

fn session_token(headers: &HeaderMap, uri: &Uri) -> Option<(String, bool)> {
    if let Some(value) = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
    {
        return Some((value.trim().to_string(), false));
    }
    if (uri.path().starts_with("/api/terminals/") && uri.path().ends_with("/ws"))
        || (uri.path().starts_with("/api/projects/") && uri.path().ends_with("/debug/ws"))
    {
        if let Some(token) = uri.query().and_then(|query| {
            query.split('&').find_map(|pair| {
                let (key, value) = pair.split_once('=')?;
                (key == "token").then(|| value.to_string())
            })
        }) {
            return Some((token, false));
        }
    }
    cookie_value(headers, SESSION_COOKIE).map(|token| (token, true))
}

fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| {
            value.split(';').find_map(|part| {
                let (key, value) = part.trim().split_once('=')?;
                (key == name).then(|| value.to_string())
            })
        })
}

async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    let connect = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|value| value.0);
    let key = client_key(request.headers(), connect, &state.config.trusted_proxies);
    let path = request.uri().path();
    // Reads power the live UI and can legitimately burst after file-system
    // changes. Mutations stay rate-limited; long-lived streams and the
    // Agent event streams have their own flow control.
    let long_lived = path == "/api/events/ws"
        || path == "/api/notifications/stream"
        || path.ends_with("/agent/events")
        || (path.starts_with("/api/terminals/") && path.ends_with("/ws"))
        || (path.starts_with("/api/projects/") && path.ends_with("/debug/ws"));
    if !long_lived
        && path.starts_with("/api/")
        && path != "/api/health"
        && path != "/api/version"
        && unsafe_method(request.method())
        && !state.api_limiter.allow(&key)
    {
        return AppError::RateLimited.into_response();
    }
    let Some((token, from_cookie)) = session_token(request.headers(), request.uri()) else {
        return AppError::Unauthorized.into_response();
    };
    let (session, user) = match state.auth.authenticate(&token).await {
        Ok(value) => value,
        Err(_) => {
            return AppError::Unauthorized.into_response();
        }
    };
    // The preview proxy forwards the app's own requests. They belong to the
    // previewed app, not to a Toph form, so Toph's CSRF token does not apply.
    let preview_proxy = request.uri().path().starts_with("/api/web-preview/");
    if from_cookie && unsafe_method(request.method()) && !preview_proxy {
        let csrf = cookie_value(request.headers(), CSRF_COOKIE).unwrap_or_default();
        let provided = request
            .headers()
            .get(CSRF_HEADER)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_string();
        if csrf.is_empty()
            || provided.is_empty()
            || csrf.as_bytes().ct_eq(provided.as_bytes()).unwrap_u8() != 1
        {
            return AppError::InvalidCsrf.into_response();
        }
    }
    request.extensions_mut().insert(AuthContext {
        session,
        user,
        from_cookie,
    });
    next.run(request).await
}

fn client_key(headers: &HeaderMap, connect: Option<SocketAddr>, trusted: &[IpNet]) -> String {
    if let Some(connect) = connect {
        let ip = connect.ip();
        if ip.is_loopback() || trusted.iter().any(|prefix| prefix.contains(&ip)) {
            if let Some(forwarded) = headers
                .get("x-forwarded-for")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.split(',').next())
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                return forwarded.to_string();
            }
        }
        return ip.to_string();
    }
    "local".into()
}

async fn health(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({
        "ok": true,
        "name": "toph",
        "version": VERSION.trim_start_matches('v'),
        "buildId": state.config.build_id,
    }))
}

async fn version(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({
        "name": "toph",
        "version": VERSION.trim_start_matches('v'),
        "buildId": state.config.build_id,
    }))
}

async fn events_ws(State(state): State<Arc<AppState>>, ws: WebSocketUpgrade) -> Response {
    let receiver = state.events.subscribe();
    ws.on_upgrade(move |socket| event_socket(socket, receiver))
}

async fn event_socket(
    mut socket: WebSocket,
    mut receiver: broadcast::Receiver<crate::events::ProjectEvent>,
) {
    let mut heartbeat = tokio::time::interval(Duration::from_secs(25));
    loop {
        tokio::select! {
            incoming = socket.recv() => {
                if incoming.is_none() { break; }
                if let Some(Ok(Message::Close(_))) = incoming { break; }
            }
            event = receiver.recv() => {
                match event {
                    Ok(event) => {
                        let Ok(payload) = serde_json::to_string(&event) else { continue };
                        if socket.send(Message::Text(payload.into())).await.is_err() { break; }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            _ = heartbeat.tick() => {
                if socket.send(Message::Ping(bytes::Bytes::new())).await.is_err() { break; }
            }
        }
    }
}

#[derive(RustEmbed)]
#[folder = "../web/dist/"]
struct WebAssets;

async fn static_handler(State(state): State<Arc<AppState>>, uri: Uri) -> Response {
    let path = uri.path();
    if path.starts_with("/api/") {
        return AppError::NotFound.into_response();
    }
    if path == "/" {
        return Redirect::temporary("/app/").into_response();
    }
    if path == "/app" {
        return Redirect::temporary("/app/").into_response();
    }
    let relative = path.strip_prefix("/app/").unwrap_or(path);
    let relative = relative.trim_start_matches('/');
    let relative = if relative.is_empty() {
        "index.html"
    } else {
        relative
    };
    if relative.split('/').any(|part| part == "..") {
        return AppError::Forbidden.into_response();
    }
    if let Some(web_dir) = &state.config.web_dir {
        let file = web_dir.join(relative);
        if let Ok(data) = tokio::fs::read(&file).await {
            return static_response(relative, data.into());
        }
    } else if let Some(asset) = WebAssets::get(relative) {
        return static_response(relative, asset.data);
    }
    if !relative.contains('.') {
        if let Some(web_dir) = &state.config.web_dir {
            if let Ok(data) = tokio::fs::read(web_dir.join("index.html")).await {
                return static_response("index.html", data.into());
            }
        } else if let Some(asset) = WebAssets::get("index.html") {
            return static_response("index.html", asset.data);
        }
    }
    AppError::NotFound.into_response()
}

fn static_response(path: &str, data: Cow<'static, [u8]>) -> Response {
    // Release builds can serve embedded assets without copying the whole file
    // into a fresh allocation for each browser request.
    let data = match data {
        Cow::Borrowed(bytes) => bytes::Bytes::from_static(bytes),
        Cow::Owned(bytes) => bytes::Bytes::from(bytes),
    };
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    let cache = if path.ends_with("index.html") {
        "no-cache"
    } else if path.starts_with("assets/") {
        "public, max-age=31536000, immutable"
    } else {
        "public, max-age=3600"
    };
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime.as_ref())
        .header(header::CACHE_CONTROL, cache)
        .body(Body::from(data))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

#[derive(Debug, Serialize)]
struct PortInfo {
    address: String,
    port: u16,
    protocol: String,
}

async fn list_ports() -> Json<Vec<PortInfo>> {
    let mut ports: Vec<PortInfo> = Vec::new();
    for (file, protocol) in [("/proc/net/tcp", "tcp"), ("/proc/net/tcp6", "tcp6")] {
        let Ok(contents) = std::fs::read_to_string(file) else {
            continue;
        };
        for line in contents.lines().skip(1) {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() < 4 || fields[3] != "0A" {
                continue;
            }
            let Some((address_hex, port_hex)) = fields[1].split_once(':') else {
                continue;
            };
            let Ok(port) = u16::from_str_radix(port_hex, 16) else {
                continue;
            };
            if ports
                .iter()
                .any(|item| item.port == port && item.protocol == protocol)
            {
                continue;
            }
            let address = if protocol == "tcp" && address_hex.len() == 8 {
                let value = u32::from_str_radix(address_hex, 16).unwrap_or(0);
                let octets = value.to_le_bytes();
                format!("{}.{}.{}.{}", octets[0], octets[1], octets[2], octets[3])
            } else {
                "[::]".to_string()
            };
            ports.push(PortInfo {
                address,
                port,
                protocol: protocol.to_string(),
            });
        }
    }
    ports.sort_by_key(|item| item.port);
    Json(ports)
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;

    #[tokio::test]
    async fn maintenance_does_not_retain_application_state() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = dir.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        let config = Config::local(
            dir.path().join("data"),
            workspace,
            "secret".into(),
            "127.0.0.1:0".into(),
        );
        let state = AppState::build(config).await.unwrap();
        let weak = Arc::downgrade(&state);
        state.agents.shutdown();
        state.watcher.stop_all();
        drop(state);
        tokio::time::timeout(Duration::from_secs(2), async {
            while weak.upgrade().is_some() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("maintenance retained the entire application after shutdown");
    }

    #[test]
    fn notification_preview_strips_markdown_fences() {
        let preview = notification_preview("```sh\nnpm test\n```\nTudo passou no teste final.");
        assert_eq!(preview, "Tudo passou no teste final.");
    }

    #[tokio::test]
    async fn agent_completion_notification_carries_project_toph_and_content() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = dir.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        let config = Config::local(
            dir.path().join("data"),
            workspace,
            "secret".into(),
            "127.0.0.1:0".into(),
        );
        let state = AppState::build(config).await.unwrap();
        let project = state
            .store
            .list_projects()
            .await
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        let mut events = state.notifications.subscribe();

        state
            .emit_agent_completion(CompletionNotice {
                user_id: 1,
                project_id: project.id.clone(),
                chat_id: "chat-1".into(),
                session_id: "session-1".into(),
                agent_id: "toph-1".into(),
                agent_name: "Beto".into(),
                agent_role: "Dev".into(),
                text: "```sh\nnpm test\n```\nTudo passou no teste final.".into(),
            })
            .await;

        let event = tokio::time::timeout(Duration::from_secs(1), events.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(event.project_name.as_deref(), Some(project.name.as_str()));
        assert_eq!(event.bot_name.as_deref(), Some("Beto"));
        assert_eq!(event.bot_role.as_deref(), Some("Dev"));
        assert_eq!(event.chat_id.as_deref(), Some("chat-1"));
        assert_eq!(event.title, format!("Beto · {}", project.name));
        assert!(event.body.contains("Tudo passou no teste final."));
        state.agents.shutdown();
        state.watcher.stop_all();
    }

    #[test]
    fn rate_limiter_reclaims_expired_clients() {
        let limiter = RateLimiter::new(2, Duration::from_secs(60));
        limiter.entries.lock().unwrap().insert(
            "old".into(),
            VecDeque::from([Instant::now() - Duration::from_secs(120)]),
        );
        assert!(limiter.allow("active"));
        limiter.prune();
        let entries = limiter.entries.lock().unwrap();
        assert!(!entries.contains_key("old"));
        assert!(entries.contains_key("active"));
    }
}
