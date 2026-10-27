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
use crate::model::{DbProfile, Project, Session, User, WebTarget};
use crate::opencode::OpenCodeProxy;
use crate::push::PushService;
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
        state.watcher.watch_existing(&projects);

        let weak = Arc::downgrade(&state);
        state.opencode.set_idle_handler(move || {
            if let Some(state) = weak.upgrade() {
                state.emit_ai_response();
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
            color: "#A8C66C".into(),
            created_at: String::new(),
            updated_at: String::new(),
        };
        let created = self.store.create_project(project).await?;
        self.watcher
            .watch(&created.id, PathBuf::from(&created.root).as_path())?;
        Ok(())
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
    axum::serve(
        listener,
        router(state).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .map_err(|error| AppError::Internal(error.into()))?;
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
        .route("/api/projects/{project_id}/search", post(search))
        .route("/api/projects/{project_id}/git/status", get(git_status))
        .route("/api/projects/{project_id}/git/branches", get(git_branches))
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
        .route("/api/terminals/{terminal_id}/ws", get(terminal_ws))
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
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        "X-Content-Type-Options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("Referrer-Policy", HeaderValue::from_static("same-origin"));
    headers.insert("X-Frame-Options", HeaderValue::from_static("DENY"));
    headers.insert(
        "Content-Security-Policy",
        HeaderValue::from_static("frame-ancestors 'none'"),
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
                "#A8C66C".into()
            } else {
                input.color
            },
            created_at: String::new(),
            updated_at: String::new(),
        })
        .await?;
    state.watcher.watch(&project.id, &root)?;
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
            .watcher
            .watch(&updated.id, FsPath::new(&updated.root))?;
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

async fn create_terminal(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> AppResult<Response> {
    let project = state.store.project(&project_id).await?;
    let session = state
        .terminals
        .create(&project_id, FsPath::new(&project.root))?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": session.id, "projectId": project_id })),
    )
        .into_response())
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
