use std::collections::{HashMap, VecDeque};
use std::net::SocketAddr;
use std::path::{Path as FsPath, PathBuf};
use std::sync::{Arc, Mutex, Once};
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, Extension, Path, Query, State};
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
use tower_http::trace::TraceLayer;

use crate::ai::{AiService, CompleteInput, Message as AiMessage};
use crate::auth::AuthManager;
use crate::config::Config;
use crate::crypto::new_id;
use crate::database::{DatabaseService, ProfileInput, RowChange};
use crate::errors::{AppError, AppResult};
use crate::events::{EventHub, ProjectWatcher};
use crate::model::{DbProfile, PetConfig, Project, Session, User, WebTarget};
use crate::opencode::OpenCodeProxy;
use crate::push::{PushMessage, PushService};
use crate::store::Store;
use crate::terminal::TerminalManager;
use crate::update::{UpdateManager, UpdateStart, UpdateStatus, VERSION};
use crate::workspace::WorkspaceService;

const SESSION_COOKIE: &str = "toph_session";
const CSRF_COOKIE: &str = "toph_csrf";
const CSRF_HEADER: &str = "x-toph-csrf";

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub store: Store,
    pub auth: AuthManager,
    pub workspace: WorkspaceService,
    pub terminals: Arc<TerminalManager>,
    pub database: DatabaseService,
    pub ai: AiService,
    pub opencode: OpenCodeProxy,
    pub push: PushService,
    pub events: EventHub,
    pub watcher: Arc<ProjectWatcher>,
    pub notifications: broadcast::Sender<NotificationEvent>,
    pub update: UpdateManager,
    pub http: reqwest::Client,
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
        let database = DatabaseService::new(store.clone(), &config.master_key_file)?;
        let ai = AiService::new(
            store.clone(),
            &config.master_key_file,
            config.opencode_url.clone(),
            config.opencode_auth.clone(),
        )?;
        let opencode = OpenCodeProxy::new(&config.opencode_url, &config.opencode_auth)?;
        let push = PushService::new(
            store.clone(),
            config.firebase_file.as_deref(),
            &config.firebase_project,
        );
        let events = EventHub::new();
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
            config,
            store,
            auth,
            workspace,
            terminals,
            database,
            ai,
            opencode,
            push,
            events,
            watcher,
            notifications,
        });

        if state.store.list_projects().await?.is_empty() {
            let _ = state.ensure_default_project().await;
        }
        let projects = state.store.list_projects().await?;
        state
            .watcher
            .watch_existing(&projects, &state.config.workspace_roots);

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
}

impl EmbeddedServer {
    pub fn shutdown(mut self) {
        if let Some(state) = self.state.take() {
            state.opencode.stop();
            state.watcher.stop_all();
            state.terminals.close_all();
        }
        if let Some(sender) = self.shutdown.take() {
            let _ = sender.send(());
        }
        self.task.abort();
    }
}

pub async fn start_embedded(config: Config) -> AppResult<EmbeddedServer> {
    let state = AppState::build(config).await?;
    let listener = TcpListener::bind("127.0.0.1:0").await?;
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
    })
}

pub async fn serve(config: Config) -> AppResult<()> {
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
    state.opencode.stop();
    state.watcher.stop_all();
    state.terminals.close_all();
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
        .route("/api/update", get(update_status).post(start_update))
        .route("/api/push/tokens", post(register_push_token))
        .route("/api/notifications/bot", post(notify_bot))
        .route("/api/pet", get(get_pet).put(save_pet))
        .route("/api/notifications/stream", get(notification_stream))
        .route("/api/events/ws", get(events_ws))
        .route("/api/projects", get(list_projects).post(create_project))
        .route(
            "/api/projects/{project_id}",
            get(get_project).put(update_project).delete(delete_project),
        )
        .route("/api/projects/{project_id}/tree", get(tree))
        .route(
            "/api/projects/{project_id}/file",
            get(read_file).put(write_file),
        )
        .route("/api/projects/{project_id}/files", get(files))
        .route("/api/projects/{project_id}/mkdir", post(make_dir))
        .route("/api/projects/{project_id}/upload", post(upload_file))
        .route("/api/projects/{project_id}/raw", get(raw_file))
        .route("/api/projects/{project_id}/search", post(search))
        .route("/api/projects/{project_id}/git/history", get(git_history))
        .route("/api/projects/{project_id}/git/status", get(git_status))
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
            get(get_layout).put(save_layout),
        )
        .route(
            "/api/projects/{project_id}/terminals",
            post(create_terminal).delete(close_terminals),
        )
        .route("/api/terminals/shells", get(terminal_shells))
        .route("/api/terminals/{terminal_id}", delete(close_terminal))
        .route("/api/terminals/{terminal_id}/ws", get(terminal_ws))
        .route("/api/ports", get(list_ports))
        .route("/api/projects/{project_id}/debug/eval", post(debug_eval))
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
        .route("/api/opencode", any(opencode_proxy_root))
        .route("/api/opencode/{*rest}", any(opencode_proxy))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    Router::new()
        .route("/api/health", get(health))
        .route("/api/version", get(version))
        .route("/api/auth/login", post(login))
        .merge(protected)
        .fallback(static_handler)
        .layer(middleware::from_fn(security_headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn security_headers(request: Request<Body>, next: Next) -> Response {
    let preview = request.uri().path() == "/api/web-preview";
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
        HeaderValue::from_static("camera=(), microphone=(), geolocation=()"),
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
    if uri.path().starts_with("/api/terminals/") && uri.path().ends_with("/ws") {
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
    // OpenCode proxy have their own flow control.
    let long_lived = path == "/api/events/ws"
        || path == "/api/notifications/stream"
        || path.starts_with("/api/opencode/")
        || (path.starts_with("/api/terminals/") && path.ends_with("/ws"));
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
    if from_cookie && unsafe_method(request.method()) {
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

#[derive(Deserialize)]
struct LoginRequest {
    #[serde(default)]
    username: String,
    password: String,
    #[serde(default)]
    kind: String,
}

async fn login(
    State(state): State<Arc<AppState>>,
    ConnectInfo(connect): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(mut input): Json<LoginRequest>,
) -> Response {
    let key = client_key(&headers, Some(connect), &state.config.trusted_proxies);
    if !state.login_limiter.allow(&key) {
        let mut response = AppError::RateLimited.into_response();
        response
            .headers_mut()
            .insert(header::RETRY_AFTER, HeaderValue::from_static("60"));
        return response;
    }
    if input.username.is_empty() {
        input.username = "admin".into();
    }
    if input.kind.is_empty() {
        input.kind = "web".into();
    }
    if input.kind != "web" && input.kind != "mobile" {
        return AppError::BadRequest("invalid client kind".into()).into_response();
    }
    let result = match state
        .auth
        .login(&input.username, &input.password, &input.kind)
        .await
    {
        Ok(value) => value,
        Err(AppError::Unauthorized | AppError::InvalidCredentials) => {
            return AppError::InvalidCredentials.into_response()
        }
        Err(error) => return error.into_response(),
    };
    state.login_limiter.reset(&key);
    let mut response = Json(json!({
        "token": if input.kind == "mobile" { result.token.clone() } else { String::new() },
        "csrfToken": result.csrf_token,
        "expiresAt": result.session.expires_at,
        "user": result.user,
    }))
    .into_response();
    if input.kind == "web" {
        append_auth_cookies(
            response.headers_mut(),
            &result.token,
            &result.csrf_token,
            state.auth.secure_cookies(),
        );
    }
    response
}

fn append_auth_cookies(headers: &mut HeaderMap, token: &str, csrf: &str, secure: bool) {
    let secure_flag = if secure { "; Secure" } else { "" };
    let session = format!(
        "{SESSION_COOKIE}={token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict{secure_flag}"
    );
    let csrf_cookie =
        format!("{CSRF_COOKIE}={csrf}; Path=/; Max-Age=2592000; SameSite=Strict{secure_flag}");
    if let Ok(value) = HeaderValue::from_str(&session) {
        headers.append(header::SET_COOKIE, value);
    }
    if let Ok(value) = HeaderValue::from_str(&csrf_cookie) {
        headers.append(header::SET_COOKIE, value);
    }
}

fn clear_auth_cookies(headers: &mut HeaderMap, secure: bool) {
    let secure_flag = if secure { "; Secure" } else { "" };
    for name in [SESSION_COOKIE, CSRF_COOKIE] {
        let value = format!(
            "{name}=; Path=/; Max-Age=0; HttpOnly={}; SameSite=Strict{secure_flag}",
            name == SESSION_COOKIE
        );
        if let Ok(value) = HeaderValue::from_str(&value) {
            headers.append(header::SET_COOKIE, value);
        }
    }
}

async fn me(Extension(context): Extension<AuthContext>) -> Json<Value> {
    Json(json!({ "user": context.user, "session": context.session }))
}

async fn get_pet(
    State(state): State<Arc<AppState>>,
    Extension(context): Extension<AuthContext>,
) -> AppResult<Json<PetConfig>> {
    Ok(Json(
        state
            .store
            .pet_config(context.user.id)
            .await?
            .unwrap_or_default(),
    ))
}

async fn save_pet(
    State(state): State<Arc<AppState>>,
    Extension(context): Extension<AuthContext>,
    Json(mut input): Json<PetConfig>,
) -> AppResult<Json<PetConfig>> {
    if !matches!(input.kind.as_str(), "momo" | "pip" | "byte" | "nori") {
        input.kind = "momo".into();
    }
    if input.mode != "free" {
        input.mode = "corner".into();
    }
    input.commits = input.commits.max(0);
    state.store.save_pet_config(context.user.id, &input).await?;
    Ok(Json(input))
}

async fn logout(
    State(state): State<Arc<AppState>>,
    Extension(context): Extension<AuthContext>,
) -> Response {
    let _ = state.auth.logout(&context.session.id).await;
    let mut response = Json(json!({ "ok": true })).into_response();
    if context.from_cookie {
        clear_auth_cookies(response.headers_mut(), state.auth.secure_cookies());
    }
    response
}

async fn update_status(State(state): State<Arc<AppState>>) -> AppResult<Json<UpdateStatus>> {
    Ok(Json(state.update.status().await?))
}

async fn start_update(State(state): State<Arc<AppState>>) -> AppResult<Json<UpdateStart>> {
    Ok(Json(state.update.start().await?))
}

#[derive(Deserialize)]
struct PushTokenRequest {
    token: String,
    #[serde(default)]
    platform: String,
}

async fn register_push_token(
    State(state): State<Arc<AppState>>,
    Json(input): Json<PushTokenRequest>,
) -> AppResult<Json<Value>> {
    let token = input.token.trim();
    if token.is_empty() {
        return Err(AppError::BadRequest("token is required".into()));
    }
    let platform = if input.platform.trim().is_empty() {
        "android"
    } else {
        input.platform.trim()
    };
    state.push.register(token, platform).await?;
    Ok(Json(json!({ "status": "registered" })))
}

#[derive(Deserialize)]
struct BotNotificationRequest {
    #[serde(rename = "notificationId", default)]
    notification_id: String,
    #[serde(rename = "projectId")]
    project_id: String,
    #[serde(rename = "botId")]
    bot_id: String,
    #[serde(rename = "botName", default)]
    bot_name: String,
    #[serde(rename = "botRole", default)]
    bot_role: String,
    #[serde(rename = "sessionId", default)]
    session_id: String,
    #[serde(rename = "tabId", default)]
    tab_id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    body: String,
}

async fn notify_bot(
    State(state): State<Arc<AppState>>,
    Extension(_context): Extension<AuthContext>,
    Json(input): Json<BotNotificationRequest>,
) -> AppResult<Json<Value>> {
    let project_id = input.project_id.trim();
    let bot_id = input.bot_id.trim();
    if project_id.is_empty() || bot_id.is_empty() {
        return Err(AppError::BadRequest(
            "projectId and botId are required".into(),
        ));
    }
    state.store.project(project_id).await?;

    let bot_name = input.bot_name.trim();
    let title = if bot_name.is_empty() {
        let fallback = input.title.trim();
        if fallback.is_empty() {
            "Bot"
        } else {
            fallback
        }
    } else {
        bot_name
    };
    let raw_body = input.body.trim();
    let body = if raw_body.is_empty() {
        "O bot terminou de responder."
    } else {
        raw_body
    };
    let title: String = title.chars().take(120).collect();
    let body: String = body.chars().take(500).collect();
    let notification_id = if input.notification_id.trim().is_empty() {
        new_id()
    } else {
        input.notification_id.trim().chars().take(100).collect()
    };
    let bot_role = input.bot_role.trim();
    let session_id = input.session_id.trim();
    let tab_id = if input.tab_id.trim().is_empty() {
        format!("bots:{project_id}")
    } else {
        input.tab_id.trim().to_string()
    };

    let event = NotificationEvent {
        event_type: "ai.done".into(),
        title: title.clone(),
        body: body.clone(),
        created_at: chrono::Utc::now().timestamp_millis(),
        notification_id: Some(notification_id.clone()),
        project_id: Some(project_id.to_string()),
        bot_id: Some(bot_id.to_string()),
        bot_name: Some(title.clone()),
        bot_role: (!bot_role.is_empty()).then(|| bot_role.to_string()),
        session_id: (!session_id.is_empty()).then(|| session_id.to_string()),
        tab_id: Some(tab_id.clone()),
    };
    let _ = state.notifications.send(event);

    if state.push.enabled() {
        let message = PushMessage {
            title: title.clone(),
            body: body.clone(),
            data: vec![
                ("projectId".into(), project_id.to_string()),
                ("botId".into(), bot_id.to_string()),
                ("botName".into(), title),
                ("botRole".into(), bot_role.to_string()),
                ("sessionId".into(), session_id.to_string()),
                ("tabId".into(), tab_id),
                ("notificationId".into(), notification_id),
            ],
        };
        let push = state.push.clone();
        tokio::spawn(async move { push.notify(&message).await });
    }

    Ok(Json(json!({ "status": "sent" })))
}

async fn notification_stream(
    State(state): State<Arc<AppState>>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let mut receiver = state.notifications.subscribe();
    let stream = async_stream::stream! {
        yield Ok(Event::default().event("ready").data("{}"));
        let mut heartbeat = tokio::time::interval(Duration::from_secs(25));
        loop {
            tokio::select! {
                event = receiver.recv() => {
                    match event {
                        Ok(event) => {
                            yield Ok(Event::default().event("ai.done").json_data(event).unwrap_or_else(|_| Event::default().data("{}")));
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => break,
                    }
                }
                _ = heartbeat.tick() => {
                    yield Ok(Event::default().comment("keep-alive"));
                }
            }
        }
    };
    Sse::new(stream).keep_alive(KeepAlive::default())
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

#[derive(Deserialize)]
struct ProjectRequest {
    name: String,
    root: String,
    #[serde(default)]
    color: String,
}

async fn list_projects(State(state): State<Arc<AppState>>) -> AppResult<Json<Vec<Project>>> {
    Ok(Json(state.store.list_projects().await?))
}

async fn create_project(
    State(state): State<Arc<AppState>>,
    Json(input): Json<ProjectRequest>,
) -> AppResult<Response> {
    let root = state
        .workspace
        .validate_root(PathBuf::from(&input.root).as_path())?;
    let project = state
        .store
        .create_project(Project {
            id: new_id(),
            name: input.name,
            root: root.to_string_lossy().to_string(),
            color: if input.color.is_empty() {
                "#FFB547".into()
            } else {
                input.color
            },
            created_at: String::new(),
            updated_at: String::new(),
        })
        .await?;
    state.watch_project(&project.id, &root).await?;
    Ok((StatusCode::CREATED, Json(project)).into_response())
}

async fn get_project(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> AppResult<Json<Project>> {
    Ok(Json(state.store.project(&project_id).await?))
}

async fn update_project(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<ProjectRequest>,
) -> AppResult<Json<Project>> {
    let mut project = state.store.project(&project_id).await?;
    let previous_root = project.root.clone();
    if !input.root.is_empty() && input.root != project.root {
        let root = state
            .workspace
            .validate_root(PathBuf::from(&input.root).as_path())?;
        project.root = root.to_string_lossy().to_string();
    }
    if !input.name.is_empty() {
        project.name = input.name;
    }
    if !input.color.is_empty() {
        project.color = input.color;
    }
    let updated = state.store.update_project(project).await?;
    if updated.root != previous_root {
        state.watcher.unwatch(&updated.id);
        state
            .watch_project(&updated.id, FsPath::new(&updated.root))
            .await?;
    }
    Ok(Json(updated))
}

async fn delete_project(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> AppResult<Json<Value>> {
    state.store.delete_project(&project_id).await?;
    state.watcher.unwatch(&project_id);
    Ok(Json(json!({ "ok": true })))
}

async fn tree(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Vec<crate::model::FileEntry>>> {
    let project = state.store.project(&project_id).await?;
    Ok(Json(state.workspace.list(
        FsPath::new(&project.root),
        query.get("path").map(String::as_str).unwrap_or(""),
    )?))
}

async fn files(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    let files = state.workspace.files(
        FsPath::new(&project.root),
        query.get("q").map(String::as_str).unwrap_or(""),
        80,
    )?;
    Ok(Json(json!({ "files": files })))
}

async fn read_file(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<crate::model::FileContent>> {
    let project = state.store.project(&project_id).await?;
    Ok(Json(state.workspace.read(
        FsPath::new(&project.root),
        query.get("path").map(String::as_str).unwrap_or(""),
    )?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WriteFileRequest {
    path: String,
    content: String,
    #[serde(default)]
    base_hash: String,
}

async fn write_file(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<WriteFileRequest>,
) -> AppResult<Json<crate::model::FileContent>> {
    let project = state.store.project(&project_id).await?;
    let file = state.workspace.write(
        FsPath::new(&project.root),
        &input.path,
        &input.content,
        &input.base_hash,
    )?;
    state.events.publish(&project_id, "files", Some(input.path));
    Ok(Json(file))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewPathRequest {
    path: String,
}

async fn make_dir(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<NewPathRequest>,
) -> AppResult<Response> {
    let project = state.store.project(&project_id).await?;
    state
        .workspace
        .create_dir(FsPath::new(&project.root), &input.path)?;
    state.events.publish(&project_id, "files", Some(input.path));
    Ok((StatusCode::CREATED, Json(json!({ "ok": true }))).into_response())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadFileRequest {
    path: String,
    data: String,
}

async fn upload_file(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<UploadFileRequest>,
) -> AppResult<Response> {
    let project = state.store.project(&project_id).await?;
    let data = base64::engine::general_purpose::STANDARD
        .decode(input.data.as_bytes())
        .map_err(|_| AppError::BadRequest("invalid base64 file".into()))?;
    if data.len() > 32 * 1024 * 1024 {
        return Err(AppError::TooLarge);
    }
    let size = state
        .workspace
        .write_bytes(FsPath::new(&project.root), &input.path, &data)?;
    state.events.publish(&project_id, "files", Some(input.path));
    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "size": size })),
    )
        .into_response())
}

async fn raw_file(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Response> {
    let project = state.store.project(&project_id).await?;
    let path = query.get("path").map(String::as_str).unwrap_or("");
    let data = state
        .workspace
        .read_bytes(FsPath::new(&project.root), path)?;
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    Ok(Response::builder()
        .header(header::CONTENT_TYPE, mime.as_ref())
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(data))
        .map_err(|error| AppError::Internal(error.into()))?)
}

async fn git_history(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    let path = query.get("path").map(String::as_str).unwrap_or("");
    let history = state
        .workspace
        .git_history(FsPath::new(&project.root), path)
        .await?;
    Ok(Json(json!({ "history": history })))
}

#[derive(Deserialize)]
struct SearchRequest {
    query: String,
    limit: Option<usize>,
}

async fn search(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<SearchRequest>,
) -> AppResult<Json<Vec<crate::model::SearchMatch>>> {
    let project = state.store.project(&project_id).await?;
    Ok(Json(
        state
            .workspace
            .search(
                FsPath::new(&project.root),
                &input.query,
                input.limit.unwrap_or(100),
            )
            .await?,
    ))
}

async fn git_status(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    let status = state.workspace.git_status(FsPath::new(&project.root)).await;
    Ok(Json(json!({ "status": status })))
}

async fn git_branches(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> AppResult<Json<crate::model::GitBranches>> {
    let project = state.store.project(&project_id).await?;
    Ok(Json(
        state
            .workspace
            .git_branches(FsPath::new(&project.root))
            .await?,
    ))
}

#[derive(Deserialize)]
struct GitPathsRequest {
    paths: Vec<String>,
}

#[derive(Deserialize)]
struct NameRequest {
    name: String,
}

async fn git_stage(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<GitPathsRequest>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    state
        .workspace
        .git_stage(FsPath::new(&project.root), &input.paths)
        .await?;
    state.events.publish(&project_id, "git", None);
    Ok(Json(json!({ "ok": true })))
}

async fn git_unstage(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<GitPathsRequest>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    state
        .workspace
        .git_unstage(FsPath::new(&project.root), &input.paths)
        .await?;
    state.events.publish(&project_id, "git", None);
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct CommitRequest {
    message: String,
}

async fn git_commit(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<CommitRequest>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    let output = state
        .workspace
        .git_commit(FsPath::new(&project.root), &input.message)
        .await?;
    state.events.publish(&project_id, "git", None);
    Ok(Json(json!({ "output": output })))
}

async fn git_diff(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Value>> {
    let path = query
        .get("path")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("path is required".into()))?;
    let staged = query.get("staged").map(String::as_str) == Some("true");
    let project = state.store.project(&project_id).await?;
    let diff = state
        .workspace
        .git_diff(FsPath::new(&project.root), path, staged)
        .await?;
    Ok(Json(json!({ "diff": diff })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitDiscardRequest {
    paths: Vec<String>,
    #[serde(default)]
    staged: bool,
}

async fn git_discard(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<GitDiscardRequest>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    state
        .workspace
        .git_discard(FsPath::new(&project.root), &input.paths, input.staged)
        .await?;
    state.publish_git(&project_id, None);
    Ok(Json(json!({ "ok": true })))
}

async fn git_checkout(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<NameRequest>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    state
        .workspace
        .git_checkout(FsPath::new(&project.root), &input.name)
        .await?;
    state.publish_git(&project_id, None);
    Ok(Json(json!({ "ok": true })))
}

async fn git_delete_branches(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    let deleted = state
        .workspace
        .git_delete_other_branches(FsPath::new(&project.root))
        .await?;
    state.events.publish(&project_id, "git", None);
    Ok(Json(json!({ "deleted": deleted })))
}

async fn git_create_branch(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<NameRequest>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    let name = state
        .workspace
        .git_create_branch(FsPath::new(&project.root), &input.name)
        .await?;
    state.events.publish(&project_id, "git", Some(name.clone()));
    Ok(Json(json!({ "name": name })))
}

async fn git_file_versions(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Value>> {
    let path = query
        .get("path")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("path is required".into()))?;
    let staged = query.get("staged").map(String::as_str) == Some("true");
    let project = state.store.project(&project_id).await?;
    let (original, modified) = state
        .workspace
        .git_file_versions(FsPath::new(&project.root), path, staged)
        .await?;
    Ok(Json(json!({ "original": original, "modified": modified })))
}

async fn git_blame(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Value>> {
    let path = query
        .get("path")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("path is required".into()))?;
    let project = state.store.project(&project_id).await?;
    let lines = state
        .workspace
        .git_blame(FsPath::new(&project.root), path)
        .await?;
    Ok(Json(json!({ "lines": lines })))
}

async fn get_layout(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Extension(context): Extension<AuthContext>,
) -> AppResult<Response> {
    let layout = state
        .store
        .workspace_layout(context.user.id, &project_id)
        .await?;
    Ok((
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        layout,
    )
        .into_response())
}

async fn save_layout(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Extension(context): Extension<AuthContext>,
    Json(layout): Json<Value>,
) -> AppResult<Json<Value>> {
    state
        .store
        .save_workspace_layout(context.user.id, &project_id, &layout.to_string())
        .await?;
    Ok(Json(json!({ "ok": true })))
}

async fn list_repos(
    State(state): State<Arc<AppState>>,
    Query(query): Query<HashMap<String, String>>,
) -> Json<Value> {
    let repos = state
        .workspace
        .find_repos(query.get("q").map(String::as_str).unwrap_or(""), 50);
    Json(json!({ "repos": repos }))
}

async fn list_workspace_roots(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(
        json!({ "roots": state.workspace.roots().iter().map(|path| path.to_string_lossy().to_string()).collect::<Vec<_>>() }),
    )
}

#[derive(Deserialize)]
struct WorkspaceRootRequest {
    path: String,
}

async fn add_workspace_root(
    State(state): State<Arc<AppState>>,
    Json(input): Json<WorkspaceRootRequest>,
) -> AppResult<Json<Value>> {
    state
        .workspace
        .add_root(PathBuf::from(&input.path).as_path())?;
    persist_workspace_roots(&state).await?;
    Ok(list_workspace_roots(State(state)).await)
}

async fn remove_workspace_root(
    State(state): State<Arc<AppState>>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Value>> {
    let path = query
        .get("path")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("path is required".into()))?;
    state.workspace.remove_root(PathBuf::from(path).as_path())?;
    persist_workspace_roots(&state).await?;
    Ok(list_workspace_roots(State(state)).await)
}

async fn persist_workspace_roots(state: &AppState) -> AppResult<()> {
    let roots: Vec<String> = state
        .workspace
        .roots()
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect();
    state
        .store
        .set_setting("workspace_roots", &serde_json::to_string(&roots)?)
        .await
}

#[derive(Debug, Deserialize, Default)]
struct CreateTerminalInput {
    #[serde(default)]
    shell: Option<String>,
}

async fn create_terminal(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<CreateTerminalInput>,
) -> AppResult<Response> {
    let project = state.store.project(&project_id).await?;
    let session = state.terminals.create(
        &project_id,
        FsPath::new(&project.root),
        input.shell.as_deref(),
    )?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": session.id, "projectId": project_id, "shell": session.shell })),
    )
        .into_response())
}

async fn terminal_shells() -> Json<Value> {
    Json(json!({ "shells": crate::terminal::available_shells() }))
}

async fn close_terminal(
    State(state): State<Arc<AppState>>,
    Path(terminal_id): Path<String>,
) -> AppResult<Json<Value>> {
    let closed = state.terminals.close_session(&terminal_id);
    Ok(Json(json!({ "ok": true, "closed": closed })))
}

async fn close_terminals(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> Json<Value> {
    let closed = state.terminals.close_project(&project_id);
    Json(json!({ "ok": true, "closed": closed }))
}

async fn terminal_ws(
    State(state): State<Arc<AppState>>,
    Path(terminal_id): Path<String>,
    ws: WebSocketUpgrade,
) -> Response {
    let Some(session) = state.terminals.get(&terminal_id) else {
        return AppError::NotFound.into_response();
    };
    ws.on_upgrade(move |socket| terminal_socket(socket, session))
}

async fn terminal_socket(mut socket: WebSocket, session: Arc<crate::terminal::TerminalSession>) {
    let Ok((initial, mut output, closed)) = session.subscribe() else {
        return;
    };
    if !initial.is_empty() && socket.send(Message::Binary(initial.into())).await.is_err() {
        return;
    }
    let mut heartbeat = tokio::time::interval(Duration::from_secs(2));
    loop {
        tokio::select! {
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Binary(data))) => {
                        if session.write(&data).is_err() { break; }
                    }
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(value) = serde_json::from_str::<Value>(&text) {
                            if value.get("type").and_then(Value::as_str) == Some("resize") {
                                let cols = value.get("cols").and_then(Value::as_u64).unwrap_or(0) as u16;
                                let rows = value.get("rows").and_then(Value::as_u64).unwrap_or(0) as u16;
                                let _ = session.resize(cols, rows);
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
            data = output.recv() => {
                match data {
                    Ok(data) => {
                        if socket.send(Message::Binary(data.into())).await.is_err() { break; }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            _ = heartbeat.tick() => {
                if closed.load(std::sync::atomic::Ordering::SeqCst) { break; }
            }
        }
    }
}

async fn get_ai_config(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<crate::ai::PublicConfig>> {
    Ok(Json(state.ai.public().await?))
}

async fn save_ai_config(
    State(state): State<Arc<AppState>>,
    Json(input): Json<crate::ai::AiConfigInput>,
) -> AppResult<Json<crate::ai::PublicConfig>> {
    let config = state.ai.save(input).await?;
    if config.provider == "opencode" && !config.base_url.is_empty() {
        let raw = state.ai.load().await?;
        state.opencode.set_config(&raw.base_url, &raw.api_key)?;
    }
    Ok(Json(config))
}

async fn test_ai(State(state): State<Arc<AppState>>) -> AppResult<Json<Value>> {
    state.ai.test().await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct ChatRequest {
    messages: Vec<AiMessage>,
    #[serde(default)]
    model: String,
    #[serde(default)]
    effort: String,
    #[serde(default)]
    yolo: bool,
}

async fn chat_ai(
    State(state): State<Arc<AppState>>,
    Json(input): Json<ChatRequest>,
) -> AppResult<Json<Value>> {
    let _ = input.yolo;
    let text = state
        .ai
        .chat(
            input.messages,
            (!input.model.is_empty()).then_some(input.model.as_str()),
            (!input.effort.is_empty()).then_some(input.effort.as_str()),
        )
        .await?;
    state.emit_ai_response();
    Ok(Json(json!({ "text": text })))
}

async fn complete_ai(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CompleteInput>,
) -> AppResult<Json<Value>> {
    if input.prefix.len() > 12000 || input.suffix.len() > 4000 {
        return Err(AppError::TooLarge);
    }
    let completion = state.ai.complete(input).await?;
    Ok(Json(json!({ "completion": completion })))
}

async fn ai_models(State(state): State<Arc<AppState>>) -> AppResult<Json<Value>> {
    Ok(Json(json!({ "models": state.ai.models().await? })))
}

async fn list_db_profiles(
    State(state): State<Arc<AppState>>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Vec<DbProfile>>> {
    Ok(Json(
        state
            .store
            .list_db_profiles(query.get("projectRoot").map(String::as_str).unwrap_or(""))
            .await?,
    ))
}

async fn create_db_profile(
    State(state): State<Arc<AppState>>,
    Json(input): Json<ProfileInput>,
) -> AppResult<Response> {
    let profile = state.database.create(input).await?;
    state.publish_project_root(&profile.project_root, "databases", Some(profile.id.clone()));
    Ok((StatusCode::CREATED, Json(profile)).into_response())
}

async fn delete_db_profile(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
) -> AppResult<Json<Value>> {
    let profile = state.store.db_profile(&profile_id).await.ok();
    state.database.delete(&profile_id).await?;
    if let Some(profile) = profile {
        state.publish_project_root(&profile.project_root, "databases", Some(profile_id));
    }
    Ok(Json(json!({ "ok": true })))
}

async fn test_db_profile(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
) -> AppResult<Json<Value>> {
    state.database.test(&profile_id).await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueryRequest {
    sql: String,
    #[serde(default)]
    max_rows: usize,
}

async fn query_db(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
    Json(input): Json<QueryRequest>,
) -> AppResult<Json<crate::database::QueryResult>> {
    let result = state
        .database
        .query(&profile_id, &input.sql, input.max_rows)
        .await?;
    if let Ok(profile) = state.store.db_profile(&profile_id).await {
        let kind = mutation_kind(&input.sql);
        if !kind.is_empty() {
            state.publish_project_root(&profile.project_root, kind, Some(profile_id.clone()));
        } else if result.columns.is_empty() {
            state.publish_project_root(
                &profile.project_root,
                "database.rows",
                Some(profile_id.clone()),
            );
        }
    }
    Ok(Json(result))
}

async fn db_schema(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
) -> AppResult<Json<Vec<crate::database::SchemaTable>>> {
    Ok(Json(state.database.schema(&profile_id).await?))
}

async fn insert_db_row(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
    Json(change): Json<RowChange>,
) -> AppResult<Json<Value>> {
    let affected: u64 = state.database.insert_row(&profile_id, change).await?;
    publish_db_rows(&state, &profile_id).await;
    Ok(Json(json!({ "rowsAffected": affected })))
}

async fn update_db_row(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
    Json(change): Json<RowChange>,
) -> AppResult<Json<Value>> {
    let affected: u64 = state.database.update_row(&profile_id, change).await?;
    publish_db_rows(&state, &profile_id).await;
    Ok(Json(json!({ "rowsAffected": affected })))
}

async fn delete_db_row(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
    Json(change): Json<RowChange>,
) -> AppResult<Json<Value>> {
    let affected: u64 = state.database.delete_row(&profile_id, change).await?;
    publish_db_rows(&state, &profile_id).await;
    Ok(Json(json!({ "rowsAffected": affected })))
}

async fn publish_db_rows(state: &AppState, profile_id: &str) {
    if let Ok(profile) = state.store.db_profile(profile_id).await {
        state.publish_project_root(
            &profile.project_root,
            "database.rows",
            Some(profile_id.to_string()),
        );
    }
}

fn mutation_kind(sql: &str) -> &'static str {
    let first = sql
        .trim()
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_uppercase();
    match first.as_str() {
        "CREATE" | "ALTER" | "DROP" | "TRUNCATE" | "RENAME" | "COMMENT" | "GRANT" | "REVOKE" => {
            "databases"
        }
        "INSERT" | "UPDATE" | "DELETE" | "REPLACE" | "MERGE" | "UPSERT" => "database.rows",
        _ => "",
    }
}

async fn list_web_targets(State(state): State<Arc<AppState>>) -> AppResult<Json<Vec<WebTarget>>> {
    Ok(Json(state.store.list_web_targets().await?))
}

#[derive(Deserialize)]
struct WebTargetRequest {
    name: String,
    url: String,
    #[serde(default)]
    icon: String,
}

async fn create_web_target(
    State(state): State<Arc<AppState>>,
    Json(input): Json<WebTargetRequest>,
) -> AppResult<Response> {
    let url = reqwest::Url::parse(&input.url)
        .map_err(|_| AppError::BadRequest("url must be http or https".into()))?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err(AppError::BadRequest("url must be http or https".into()));
    }
    let target = state
        .store
        .create_web_target(WebTarget {
            id: new_id(),
            name: input.name,
            url: url.to_string(),
            icon: input.icon,
            created_at: String::new(),
        })
        .await?;
    Ok((StatusCode::CREATED, Json(target)).into_response())
}

async fn delete_web_target(
    State(state): State<Arc<AppState>>,
    Path(target_id): Path<String>,
) -> AppResult<Json<Value>> {
    state.store.delete_web_target(&target_id).await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct WebPreviewQuery {
    url: String,
}

const PREVIEW_SCRIPT: &str = r#"
(function () {
  function proxied(url) {
    return new URL('/api/web-preview?url=' + encodeURIComponent(url), window.location.href).href;
  }
  document.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    var href = anchor.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(javascript:|mailto:|tel:)/i.test(href)) return;
    var absolute;
    try { absolute = new URL(href, document.baseURI).href; } catch (error) { return; }
    if (anchor.target === '_blank') {
      event.preventDefault();
      window.open(absolute, '_blank', 'noopener,noreferrer');
      return;
    }
    event.preventDefault();
    window.location.href = proxied(absolute);
  }, true);
})();
"#;

fn escape_preview(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn strip_preview_tags(html: &str, remove: impl Fn(&str) -> bool) -> String {
    let lower = html.to_ascii_lowercase();
    let mut out = String::with_capacity(html.len());
    let mut pos = 0;
    while let Some(relative) = lower[pos..].find('<') {
        let start = pos + relative;
        let Some(end_relative) = lower[start..].find('>') else {
            break;
        };
        let end = start + end_relative + 1;
        if !remove(&lower[start..end]) {
            out.push_str(&html[pos..end]);
        } else {
            out.push_str(&html[pos..start]);
        }
        pos = end;
    }
    out.push_str(&html[pos..]);
    out
}

fn rewrite_preview_html(html: &str, base_url: &str) -> String {
    let html = strip_preview_tags(html, |tag| tag.starts_with("<base"));
    let html = strip_preview_tags(&html, |tag| {
        tag.starts_with("<meta")
            && tag.contains("http-equiv")
            && tag.contains("content-security-policy")
    });
    let injected = format!(
        "<base href=\"{}\"><script>{}</script>",
        escape_preview(base_url),
        PREVIEW_SCRIPT,
    );
    let lower = html.to_ascii_lowercase();
    if let Some(start) = lower.find("<head") {
        if let Some(end_relative) = lower[start..].find('>') {
            let pos = start + end_relative + 1;
            return format!("{}{}{}", &html[..pos], injected, &html[pos..]);
        }
    }
    format!("<head>{injected}</head>{html}")
}

fn preview_error(message: &str, target: &str, status: StatusCode) -> Response {
    let safe_target = escape_preview(target);
    let safe_message = escape_preview(message);
    let html = format!(
        r#"<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Preview indisponível</title><style>
        :root{{color-scheme:dark}}*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#e8e8e8;font-family:Inter,system-ui,sans-serif;padding:24px}}
        main{{width:min(520px,100%);border:1px solid #282828;background:#141414;border-radius:24px;padding:28px;box-shadow:0 20px 60px #0008}}
        h1{{margin:0 0 8px;font-size:20px}}p{{margin:0 0 18px;color:#aaa;line-height:1.6}}a{{display:inline-flex;border:1px solid #3c3c3c;border-radius:999px;padding:8px 14px;color:#ffb547;text-decoration:none}}code{{color:#ddd;word-break:break-all}}
        </style></head><body><main><h1>Não foi possível abrir o preview</h1><p>{safe_message}</p><p><code>{safe_target}</code></p><a href="{safe_target}" target="_blank" rel="noreferrer">Abrir em nova aba</a></main></body></html>"#,
    );
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(html))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

async fn web_preview(
    State(state): State<Arc<AppState>>,
    Query(query): Query<WebPreviewQuery>,
) -> Response {
    let raw_url = query.url.trim();
    let target = match reqwest::Url::parse(raw_url) {
        Ok(url) if matches!(url.scheme(), "http" | "https") => url,
        _ => {
            return preview_error(
                "O endereço precisa ser uma URL http ou https válida.",
                raw_url,
                StatusCode::BAD_REQUEST,
            )
        }
    };

    let response = match state
        .http
        .get(target.clone())
        .header(
            header::ACCEPT,
            "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        )
        .header(
            header::USER_AGENT,
            "Mozilla/5.0 (compatible; TophPreview/1.0; +https://github.com/ferforastieri/toph)",
        )
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            tracing::warn!(%error, url = %target, "web preview fetch failed");
            return preview_error(
                "Não foi possível alcançar este endereço a partir do servidor.",
                target.as_str(),
                StatusCode::BAD_GATEWAY,
            );
        }
    };

    let final_url = response.url().clone();
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !content_type.contains("text/html") && !content_type.contains("application/xhtml+xml") {
        return preview_error(
            "Este endereço não retornou uma página HTML. Abra em uma nova aba para visualizar o conteúdo.",
            final_url.as_str(),
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
        );
    }
    if response
        .content_length()
        .is_some_and(|length| length > 8 * 1024 * 1024)
    {
        return preview_error(
            "A página é grande demais para o preview.",
            final_url.as_str(),
            StatusCode::PAYLOAD_TOO_LARGE,
        );
    }
    let body = match response.bytes().await {
        Ok(body) => body,
        Err(error) => {
            tracing::warn!(%error, url = %final_url, "web preview body read failed");
            return preview_error(
                "Não foi possível ler a página para o preview.",
                final_url.as_str(),
                StatusCode::BAD_GATEWAY,
            );
        }
    };
    let html = String::from_utf8_lossy(&body);
    let html = rewrite_preview_html(&html, final_url.as_str());
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(html))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

async fn opencode_proxy_root(
    State(state): State<Arc<AppState>>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Body,
) -> Response {
    state
        .opencode
        .proxy(String::new(), method, uri, headers, body)
        .await
}

async fn opencode_proxy(
    State(state): State<Arc<AppState>>,
    Path(rest): Path<String>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Body,
) -> Response {
    state.opencode.proxy(rest, method, uri, headers, body).await
}

#[derive(RustEmbed)]
#[folder = "../../apps/web/dist/"]
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
            return static_response(relative, data);
        }
    } else if let Some(asset) = WebAssets::get(relative) {
        return static_response(relative, asset.data.into_owned());
    }
    if !relative.contains('.') {
        if let Some(web_dir) = &state.config.web_dir {
            if let Ok(data) = tokio::fs::read(web_dir.join("index.html")).await {
                return static_response("index.html", data);
            }
        } else if let Some(asset) = WebAssets::get("index.html") {
            return static_response("index.html", asset.data.into_owned());
        }
    }
    AppError::NotFound.into_response()
}

fn static_response(path: &str, data: Vec<u8>) -> Response {
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

// Keep this handler public so future server integrations can reuse the same
// health shape without constructing an AppState manually.
pub fn version_string() -> &'static str {
    VERSION
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

#[derive(Debug, Deserialize)]
struct DebugEvalInput {
    code: String,
}

async fn debug_eval(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<DebugEvalInput>,
) -> AppResult<Json<Value>> {
    if input.code.len() > 20_000 {
        return Err(crate::errors::bad_request("code is too large"));
    }
    let project = state.store.project(&project_id).await?;
    let script = format!(
        "const __toph_result = (0, eval)({}); if (__toph_result !== undefined) console.log(__toph_result);",
        serde_json::to_string(&input.code).map_err(|error| crate::errors::internal(error.to_string()))?
    );
    let command = tokio::process::Command::new("node")
        .arg("-e")
        .arg(script)
        .current_dir(&project.root)
        .kill_on_drop(true)
        .output();
    let output = tokio::time::timeout(Duration::from_secs(10), command)
        .await
        .map_err(|_| crate::errors::bad_request("evaluation timed out"))??;
    Ok(Json(json!({
        "stdout": String::from_utf8_lossy(&output.stdout),
        "stderr": String::from_utf8_lossy(&output.stderr),
        "exitCode": output.status.code(),
    })))
}
