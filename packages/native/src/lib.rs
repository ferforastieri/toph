use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{Manager, RunEvent, State};
use url::Url;

/// The launcher URL captured before the window navigates to a server. In dev
/// this is the Vite URL; in a bundled app it is the custom protocol origin.
static LAUNCHER_URL: OnceLock<Url> = OnceLock::new();

/// Set when the connected web UI asks to go back. The launcher consumes it on
/// boot, so the reset does not depend on the query surviving the navigation.
static LAUNCHER_RESET: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerInfo {
    base_url: String,
    name: String,
    version: String,
    build_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalServerInfo {
    base_url: String,
    lan_url: Option<String>,
    port: u16,
    password: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PairingInfo {
    url: String,
    expires_in: u64,
}

#[cfg(not(target_os = "android"))]
struct LocalServer {
    server: toph_server::server::EmbeddedServer,
    base: Url,
    lan: Option<Url>,
    session: String,
    csrf: String,
}

#[cfg(not(target_os = "android"))]
#[derive(Default)]
struct LocalState {
    server: Mutex<Option<LocalServer>>,
}

#[cfg(not(target_os = "android"))]
impl LocalState {
    fn current(&self) -> Result<(Url, Option<Url>, String, String), String> {
        let slot = self
            .server
            .lock()
            .map_err(|_| "O estado do backend local está indisponível.".to_string())?;
        let server = slot
            .as_ref()
            .ok_or_else(|| "O backend local não está em execução.".to_string())?;
        Ok((
            server.base.clone(),
            server.lan.clone(),
            server.session.clone(),
            server.csrf.clone(),
        ))
    }
}

fn normalize_server(raw: &str) -> Result<Url, String> {
    let input = raw.trim();
    if input.is_empty() {
        return Err("Informe a URL do servidor Toph.".into());
    }
    let with_scheme = if input.starts_with("http://") || input.starts_with("https://") {
        input.to_string()
    } else {
        format!("https://{input}")
    };
    let mut url = Url::parse(&with_scheme).map_err(|_| "URL inválida.".to_string())?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("A URL deve usar http ou https.".into());
    }
    if url.host_str().is_none() {
        return Err("A URL precisa ter um host.".into());
    }
    url.set_query(None);
    url.set_fragment(None);
    let path = url.path().trim_end_matches('/').to_string();
    let path = path.strip_suffix("/app").unwrap_or(&path).to_string();
    url.set_path(if path.is_empty() { "/" } else { &path });
    Ok(url)
}

fn endpoint(base: &Url, suffix: &str) -> Result<Url, String> {
    let mut base = base.clone();
    let mut path = base.path().trim_end_matches('/').to_string();
    path.push('/');
    path.push_str(suffix.trim_start_matches('/'));
    base.set_path(&path);
    Ok(base)
}

async fn health(base: &Url) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|err| err.to_string())?;
    let response = client
        .get(endpoint(base, "api/health")?)
        .send()
        .await
        .map_err(|_| {
            "Não foi possível conectar. Confira a URL e se o servidor está acessível.".to_string()
        })?;
    if !response.status().is_success() {
        return Err(format!("O servidor respondeu HTTP {}.", response.status()));
    }
    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|_| "A resposta não parece ser um servidor Toph.".to_string())?;
    if value.get("ok").and_then(|v| v.as_bool()) != Some(true) {
        return Err("Este endereço não é um servidor Toph saudável.".into());
    }
    Ok(value)
}

fn is_local_window(window: &tauri::WebviewWindow) -> bool {
    let Ok(url) = window.url() else {
        return false;
    };
    match url.scheme() {
        "tauri" => true,
        "http" | "https" => url
            .host_str()
            .map(|host| {
                host == "localhost"
                    || host == "127.0.0.1"
                    || host == "::1"
                    || host.ends_with(".localhost")
            })
            .unwrap_or(false),
        _ => false,
    }
}

fn require_local(window: &tauri::WebviewWindow) -> Result<(), String> {
    if is_local_window(window) {
        Ok(())
    } else {
        Err("Esta operação só está disponível no launcher local.".into())
    }
}

#[tauri::command]
async fn validate_server(window: tauri::WebviewWindow, url: String) -> Result<ServerInfo, String> {
    require_local(&window)?;
    let base = normalize_server(&url)?;
    let value = match health(&base).await {
        Ok(value) => value,
        Err(err) => {
            eprintln!("toph: health check failed for {base}: {err}");
            return Err(err);
        }
    };
    Ok(ServerInfo {
        base_url: base.to_string(),
        name: value
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Toph")
            .to_string(),
        version: value
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string(),
        build_id: value
            .get("buildId")
            .and_then(|v| v.as_str())
            .map(ToString::to_string),
    })
}

fn navigate_main(app: &tauri::AppHandle, url: Url) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "Janela principal não encontrada.".to_string())?;
    main.navigate(url)
        .map_err(|err| format!("Não foi possível abrir o servidor: {err}"))
}

#[tauri::command]
fn open_server(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    url: String,
) -> Result<(), String> {
    require_local(&window)?;
    let base = normalize_server(&url)?;
    let mut target = endpoint(&base, "app/")?;
    target
        .query_pairs_mut()
        .append_pair("server", base.as_str())
        .append_pair("desktop", "1");
    navigate_main(&app, target.clone()).inspect_err(|err| {
        eprintln!("toph: could not navigate to server {target}: {err}");
    })
}

#[cfg(not(target_os = "android"))]
async fn login_cookie_headers(base: &Url, password: &str) -> Result<(String, String), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|err| err.to_string())?;
    let response = client
        .post(endpoint(base, "api/auth/login")?)
        .json(&serde_json::json!({"username":"admin","password":password,"kind":"web"}))
        .send()
        .await
        .map_err(|_| "Não foi possível autenticar no backend local.".to_string())?;
    if !response.status().is_success() {
        return Err("O backend local recusou a autenticação inicial.".into());
    }
    let mut session = String::new();
    let mut csrf = String::new();
    for value in response.headers().get_all("set-cookie") {
        for part in value.to_str().unwrap_or("").split(';') {
            let part = part.trim();
            if let Some(value) = part.strip_prefix("toph_session=") {
                session = value.to_string();
            } else if let Some(value) = part.strip_prefix("toph_csrf=") {
                csrf = value.to_string();
            }
        }
    }
    if session.is_empty() || csrf.is_empty() {
        return Err("O backend local não devolveu uma sessão válida.".into());
    }
    Ok((session, csrf))
}

#[cfg(not(target_os = "android"))]
async fn ensure_local_workspace(
    base: &Url,
    session: &str,
    csrf: &str,
    root: &std::path::Path,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|err| err.to_string())?;
    let cookie = format!("toph_session={session}; toph_csrf={csrf}");
    let root = dunce::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let root_text = root.to_string_lossy().to_string();

    let roots_response = client
        .get(endpoint(base, "api/workspaces/roots")?)
        .header(reqwest::header::COOKIE, &cookie)
        .send()
        .await
        .map_err(|err| format!("Não foi possível consultar os workspaces locais: {err}"))?;
    if !roots_response.status().is_success() {
        return Err("O backend local não devolveu os workspaces.".into());
    }
    let roots: serde_json::Value = roots_response
        .json()
        .await
        .map_err(|_| "Resposta inválida ao listar workspaces.".to_string())?;
    let known = roots
        .get("roots")
        .and_then(|value| value.as_array())
        .map(|items| items.iter().any(|item| item.as_str() == Some(&root_text)))
        .unwrap_or(false);
    if !known {
        let response = client
            .post(endpoint(base, "api/workspaces/roots")?)
            .header(reqwest::header::COOKIE, &cookie)
            .header("X-Toph-CSRF", csrf)
            .json(&serde_json::json!({ "path": root_text }))
            .send()
            .await
            .map_err(|err| format!("Não foi possível registrar o workspace local: {err}"))?;
        if !response.status().is_success() {
            return Err("O backend local recusou o workspace escolhido.".into());
        }
    }

    let projects_response = client
        .get(endpoint(base, "api/projects")?)
        .header(reqwest::header::COOKIE, &cookie)
        .send()
        .await
        .map_err(|err| format!("Não foi possível consultar os projetos locais: {err}"))?;
    if !projects_response.status().is_success() {
        return Err("O backend local não devolveu os projetos.".into());
    }
    let projects: serde_json::Value = projects_response
        .json()
        .await
        .map_err(|_| "Resposta inválida ao listar projetos.".to_string())?;
    let exists = projects
        .as_array()
        .map(|items| {
            items.iter().any(|item| {
                item.get("root")
                    .and_then(|value| value.as_str())
                    .map(|value| value == root_text)
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false);
    if exists {
        return Ok(());
    }

    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("workspace");
    let response = client
        .post(endpoint(base, "api/projects")?)
        .header(reqwest::header::COOKIE, &cookie)
        .header("X-Toph-CSRF", csrf)
        .json(&serde_json::json!({ "name": name, "root": root_text }))
        .send()
        .await
        .map_err(|err| format!("Não foi possível abrir o projeto local: {err}"))?;
    if !response.status().is_success() {
        return Err("O backend local não conseguiu criar o projeto.".into());
    }
    Ok(())
}

/// Best-effort IPv4 address of the machine on the local network. The UDP
/// connect does not send anything; it only asks the routing table which
/// interface would be used. Interface enumeration covers offline networks.
#[cfg(not(target_os = "android"))]
fn lan_ip() -> Option<std::net::IpAddr> {
    use std::net::UdpSocket;

    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip();
                if ip.is_ipv4() && !ip.is_loopback() && !ip.is_unspecified() {
                    return Some(ip);
                }
            }
        }
    }

    if_addrs::get_if_addrs()
        .ok()?
        .into_iter()
        .find_map(|interface| {
            let ip = interface.ip();
            (ip.is_ipv4() && !ip.is_loopback() && !ip.is_unspecified()).then_some(ip)
        })
}

#[cfg(not(target_os = "android"))]
async fn create_pairing(base: &Url, session: &str, csrf: &str) -> Result<(String, u64), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|err| err.to_string())?;
    let cookie = format!("toph_session={session}; toph_csrf={csrf}");
    let response = client
        .post(endpoint(base, "api/pairing")?)
        .header(reqwest::header::COOKIE, cookie)
        .header("X-Toph-CSRF", csrf)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|err| format!("Não foi possível gerar o código de pareamento: {err}"))?;
    if !response.status().is_success() {
        return Err("O backend local recusou o código de pareamento.".into());
    }
    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|_| "Resposta inválida ao gerar o código de pareamento.".to_string())?;
    let code = value
        .get("code")
        .and_then(|code| code.as_str())
        .map(ToString::to_string)
        .ok_or_else(|| "O backend local não devolveu um código de pareamento.".to_string())?;
    let expires_in = value
        .get("expiresIn")
        .and_then(|expires| expires.as_u64())
        .unwrap_or(600);
    Ok((code, expires_in))
}

#[cfg(not(target_os = "android"))]
fn app_url(target: &Url, pair: &str, desktop: bool) -> Result<Url, String> {
    let mut url = endpoint(target, "app/")?;
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("server", target.as_str());
        if desktop {
            query.append_pair("desktop", "1");
        }
        query.append_pair("pair", pair);
    }
    Ok(url)
}

#[cfg(not(target_os = "android"))]
fn random_password() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 24];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let mut value = String::with_capacity(48);
    for byte in bytes {
        use std::fmt::Write;
        let _ = write!(value, "{byte:02x}");
    }
    value
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn start_local_server(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<'_, LocalState>,
    workspace: Option<String>,
    share_network: Option<bool>,
) -> Result<LocalServerInfo, String> {
    require_local(&window)?;
    if let Ok(mut slot) = state.server.lock() {
        if let Some(server) = slot.take() {
            server.server.shutdown();
        }
    }

    let data_root = app
        .path()
        .app_data_dir()
        .map_err(|err| err.to_string())?
        .join("local");
    let data_dir = data_root.join("data");
    let workspaces = data_root.join("workspaces");
    fs::create_dir_all(&data_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&workspaces).map_err(|err| err.to_string())?;

    let password_file = data_root.join("admin-password");
    let password = if let Ok(value) = fs::read_to_string(&password_file) {
        value.trim().to_string()
    } else {
        let value = random_password();
        let mut file = fs::File::create(&password_file).map_err(|err| err.to_string())?;
        file.write_all(value.as_bytes())
            .map_err(|err| err.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&password_file, fs::Permissions::from_mode(0o600));
        }
        value
    };

    let workspace_root = if let Some(raw) = workspace
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        let selected = PathBuf::from(raw);
        let metadata =
            fs::metadata(&selected).map_err(|_| "A pasta escolhida não existe.".to_string())?;
        if !metadata.is_dir() {
            return Err("Escolha uma pasta, não um arquivo.".into());
        }
        selected
    } else {
        workspaces.clone()
    };

    let share_network = share_network.unwrap_or(false);
    let listen = if share_network {
        "0.0.0.0:0"
    } else {
        "127.0.0.1:0"
    };
    let config = toph_server::config::Config::local(
        data_dir,
        workspace_root.clone(),
        password.clone(),
        listen.into(),
    );
    let server = toph_server::start_embedded(config)
        .await
        .map_err(|err| format!("Não foi possível iniciar o backend local: {err}"))?;
    let port = server.addr.port();
    let base = Url::parse(&format!("http://127.0.0.1:{port}/")).map_err(|err| err.to_string())?;

    let mut healthy = false;
    for _ in 0..30 {
        if health(&base).await.is_ok() {
            healthy = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    if !healthy {
        server.shutdown();
        return Err("O backend local não ficou saudável.".into());
    }

    let (session, csrf) = match login_cookie_headers(&base, &password).await {
        Ok(value) => value,
        Err(err) => {
            server.shutdown();
            return Err(err);
        }
    };
    if let Err(err) = ensure_local_workspace(&base, &session, &csrf, &workspace_root).await {
        server.shutdown();
        return Err(err);
    }

    let lan = if share_network {
        match lan_ip().and_then(|ip| Url::parse(&format!("http://{ip}:{port}/")).ok()) {
            Some(url) => Some(url),
            None => {
                server.shutdown();
                return Err(
                    "Não encontrei um endereço IPv4 nesta rede. Conecte o computador ao Wi-Fi ou à rede local e tente novamente."
                        .into(),
                );
            }
        }
    } else {
        None
    };

    if let Ok(mut slot) = state.server.lock() {
        *slot = Some(LocalServer {
            server,
            base: base.clone(),
            lan: lan.clone(),
            session,
            csrf,
        });
    } else {
        return Err("O estado do backend local está indisponível.".into());
    }

    Ok(LocalServerInfo {
        base_url: base.to_string(),
        lan_url: lan.map(|url| url.to_string()),
        port,
        password,
    })
}

/// Opens the workbench of the running local server. Each call mints a fresh
/// one-time pairing code, so the web app authenticates through the normal
/// `/api/auth/pair` flow instead of receiving cookies through injected scripts.
#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn open_local_server(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<'_, LocalState>,
    network: Option<bool>,
) -> Result<(), String> {
    require_local(&window)?;
    let (base, lan, session, csrf) = state.current()?;
    let network = network.unwrap_or(false);
    let destination = if network {
        lan.ok_or_else(|| "O acesso pela rede local não está habilitado nesta sessão.".to_string())?
    } else {
        base.clone()
    };
    let (code, _) = create_pairing(&base, &session, &csrf)
        .await
        .map_err(|err| {
            eprintln!("toph: could not create a pairing code for the local workbench: {err}");
            err
        })?;
    let url = app_url(&destination, &code, !network)?;
    navigate_main(&app, url.clone())
        .inspect_err(|err| eprintln!("toph: could not open local workbench at {url}: {err}"))
}

/// Creates a pairing URL for the phone QR code. Only available when local mode
/// was started with LAN sharing enabled.
#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn local_pairing(
    window: tauri::WebviewWindow,
    state: State<'_, LocalState>,
) -> Result<PairingInfo, String> {
    require_local(&window)?;
    let (base, lan, session, csrf) = state.current()?;
    let lan = lan.ok_or_else(|| {
        "Inicie o modo local com o acesso pelo celular habilitado para gerar o QR.".to_string()
    })?;
    let (code, expires_in) = create_pairing(&base, &session, &csrf).await?;
    Ok(PairingInfo {
        url: app_url(&lan, &code, false)?.to_string(),
        expires_in,
    })
}

/// Returns to the launcher and discards the saved server, so the user lands on
/// the server/local-mode picker instead of reconnecting to the last server.
#[cfg(not(target_os = "android"))]
#[tauri::command]
fn show_launcher(app: tauri::AppHandle) -> Result<(), String> {
    let mut target = LAUNCHER_URL
        .get()
        .cloned()
        .ok_or_else(|| "A URL do launcher não foi capturada no startup.".to_string())?;
    if target.path().is_empty() || target.path() == "/" {
        target.set_path("/index.html");
    }
    target.set_query(Some("change=1"));
    LAUNCHER_RESET.store(true, Ordering::Relaxed);
    navigate_main(&app, target)
}

#[tauri::command]
fn take_launcher_reset() -> bool {
    LAUNCHER_RESET.swap(false, Ordering::Relaxed)
}

/// Navigates the launcher to a Toph URL read from a QR code. The server in the
/// QR must answer the health check before the app navigates, so a stray or
/// malicious QR cannot silently replace the launcher with an arbitrary page.
#[tauri::command]
async fn open_scanned_url(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    url: String,
) -> Result<(), String> {
    require_local(&window)?;
    let parsed =
        Url::parse(url.trim()).map_err(|_| "O QR code não contém uma URL válida.".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("O QR code precisa apontar para um endereço http ou https.".into());
    }
    if parsed.host_str().is_none() {
        return Err("O QR code não contém um servidor.".into());
    }
    if !parsed.path().trim_end_matches('/').ends_with("/app") {
        return Err("O QR code não aponta para o aplicativo Toph.".into());
    }
    let server = parsed
        .query_pairs()
        .find_map(|(key, value)| (key == "server").then(|| value.to_string()))
        .ok_or_else(|| "O QR code não contém o endereço do servidor Toph.".to_string())?;
    let base = normalize_server(&server)?;
    health(&base)
        .await
        .map_err(|err| format!("O servidor do QR code não respondeu: {err}"))?;
    navigate_main(&app, parsed)
}

#[tauri::command]
fn is_mobile() -> bool {
    cfg!(mobile)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolStatus {
    id: String,
    label: String,
    installed: bool,
    version: String,
}

const TOOL_COMPONENTS: &[(&str, &str, &[&str], &str)] = &[
    ("git", "Git", &["git"], "--version"),
    ("node", "Node.js", &["node"], "--version"),
    ("pnpm", "pnpm", &["pnpm"], "--version"),
    ("rust", "Rust + Cargo", &["rustc"], "--version"),
    ("go", "Go", &["go"], "version"),
    ("python", "Python", &["python3", "python"], "--version"),
];

async fn tool_version(command: &str, version_arg: &str) -> Option<String> {
    let direct = tokio::process::Command::new(command)
        .arg(version_arg)
        .output()
        .await;
    // Package-manager shims such as pnpm are `.cmd` files on Windows, which
    // CreateProcess does not resolve on its own.
    let output = match direct {
        Ok(output) if output.status.success() => Some(output),
        _ if cfg!(windows) => tokio::process::Command::new("cmd")
            .args(["/C", command, version_arg])
            .output()
            .await
            .ok()
            .filter(|output| output.status.success()),
        _ => None,
    }?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let version = stdout
        .lines()
        .chain(stderr.lines())
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("");
    Some(version.to_string())
}

#[tauri::command]
async fn environment_status() -> Vec<ToolStatus> {
    let mut statuses = Vec::new();
    for (id, label, commands, version_arg) in TOOL_COMPONENTS {
        let mut installed = false;
        let mut version = String::new();
        for command in *commands {
            if let Some(found) = tool_version(command, version_arg).await {
                installed = true;
                version = found;
                break;
            }
        }
        statuses.push(ToolStatus {
            id: (*id).into(),
            label: (*label).into(),
            installed,
            version,
        });
    }
    statuses
}

#[tauri::command]
async fn install_environment(components: Vec<String>) -> Result<String, String> {
    let allowed = ["git", "node", "pnpm", "rust", "go", "python"];
    let selected: Vec<String> = components
        .into_iter()
        .filter(|component| allowed.contains(&component.as_str()))
        .collect();
    if selected.is_empty() {
        return Err("Selecione pelo menos uma ferramenta.".into());
    }
    if cfg!(windows) {
        install_environment_windows(&selected).await
    } else {
        install_environment_linux(&selected).await
    }
}

async fn run_installer(command: &str, args: &[&str]) -> Result<String, String> {
    let output = tokio::process::Command::new(command)
        .args(args)
        .output()
        .await
        .map_err(|error| format!("Não foi possível executar {command}: {error}"))?;
    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Err(format!(
            "{command} terminou com {}. {}",
            output.status,
            text.trim()
        ));
    }
    Ok(text)
}

async fn install_environment_windows(selected: &[String]) -> Result<String, String> {
    run_installer("winget", &["--version"]).await?;
    let packages = [
        ("git", "Git.Git"),
        ("node", "OpenJS.NodeJS.LTS"),
        ("pnpm", "pnpm.pnpm"),
        ("rust", "Rustlang.Rustup"),
        ("go", "GoLang.Go"),
        ("python", "Python.Python.3.13"),
    ];
    let mut log = String::new();
    for component in selected {
        let Some((_, package)) = packages.iter().find(|(id, _)| id == component) else {
            continue;
        };
        log.push_str(&format!("Instalando {component} ({package})...\n"));
        let output = run_installer(
            "winget",
            &[
                "install",
                "--id",
                package,
                "-e",
                "--silent",
                "--accept-package-agreements",
                "--accept-source-agreements",
            ],
        )
        .await?;
        log.push_str(&output);
    }
    log.push_str("\nAmbiente instalado. Reinicie o Toph para carregar o PATH atualizado.\n");
    Ok(log)
}

async fn install_environment_linux(selected: &[String]) -> Result<String, String> {
    let use_apt = std::path::Path::new("/usr/bin/apt-get").exists();
    let use_dnf = std::path::Path::new("/usr/bin/dnf").exists();
    let use_pacman = std::path::Path::new("/usr/bin/pacman").exists();
    if !use_apt && !use_dnf && !use_pacman {
        return Err("Gerenciador de pacotes não suportado. Instale Git, Node, Rust, Go e Python manualmente.".into());
    }
    let mut packages: Vec<&str> = Vec::new();
    for component in selected {
        match component.as_str() {
            "git" => packages.push("git"),
            "node" => packages.extend(["nodejs", "npm"]),
            "pnpm" => packages.extend(["nodejs", "npm"]),
            "rust" => packages.extend(["rustc", "cargo"]),
            "go" => packages.push(if use_apt {
                "golang-go"
            } else if use_dnf {
                "golang"
            } else {
                "go"
            }),
            "python" => packages.extend(["python3", "python3-pip", "python3-venv"]),
            _ => {}
        }
    }
    packages.sort();
    packages.dedup();
    let root_prefix = if std::path::Path::new("/usr/bin/pkexec").exists() {
        "pkexec"
    } else {
        "sudo"
    };
    let mut log = String::new();
    let sudo = root_prefix == "sudo";
    if use_apt {
        let mut update = vec!["env", "DEBIAN_FRONTEND=noninteractive", "apt-get", "update"];
        if sudo {
            update.insert(0, "-n");
        }
        log.push_str(&run_installer(root_prefix, &update).await?);
        let mut args = vec![
            "env",
            "DEBIAN_FRONTEND=noninteractive",
            "apt-get",
            "install",
            "-y",
        ];
        if sudo {
            args.insert(0, "-n");
        }
        args.extend(packages.iter().copied());
        log.push_str(&run_installer(root_prefix, &args).await?);
    } else if use_dnf {
        let mut args = vec!["dnf", "install", "-y"];
        if sudo {
            args.insert(0, "-n");
        }
        args.extend(packages.iter().copied());
        log.push_str(&run_installer(root_prefix, &args).await?);
    } else {
        let mut args = vec!["pacman", "-S", "--noconfirm", "--needed"];
        if sudo {
            args.insert(0, "-n");
        }
        args.extend(packages.iter().copied());
        log.push_str(&run_installer(root_prefix, &args).await?);
    }
    if selected.iter().any(|component| component == "pnpm") {
        let mut args = vec!["npm", "install", "-g", "pnpm"];
        if sudo {
            args.insert(0, "-n");
        }
        log.push_str(&run_installer(root_prefix, &args).await?);
    }
    log.push_str("\nAmbiente instalado. Reinicie o Toph para carregar o PATH atualizado.\n");
    Ok(log)
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
async fn download_update(
    app: tauri::AppHandle,
    url: String,
    filename: String,
    sha256: Option<String>,
) -> Result<String, String> {
    let parsed = Url::parse(&url).map_err(|_| "URL de atualização inválida.".to_string())?;
    if parsed.scheme() != "https" {
        return Err("O instalador precisa usar HTTPS.".into());
    }
    if !matches!(
        parsed.host_str(),
        Some("github.com")
            | Some("objects.githubusercontent.com")
            | Some("github-releases.githubusercontent.com")
    ) {
        return Err("Origem de atualização não permitida.".into());
    }
    let name = filename
        .rsplit(|character| character == '/' || character == '\\')
        .next()
        .unwrap_or("")
        .trim();
    if !matches!(
        PathBuf::from(name)
            .extension()
            .and_then(|value| value.to_str()),
        Some("exe") | Some("msi") | Some("AppImage") | Some("deb") | Some("rpm")
    ) {
        return Err("Nome de instalador inválido.".into());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|err| err.to_string())?;
    let response = client
        .get(parsed)
        .send()
        .await
        .map_err(|err| format!("Não foi possível baixar o instalador: {err}"))?;
    if !response.status().is_success() {
        return Err(format!("O download respondeu HTTP {}.", response.status()));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|err| format!("Falha ao ler o instalador: {err}"))?;
    if let Some(expected) = sha256.filter(|value| !value.trim().is_empty()) {
        let actual = format!("{:x}", Sha256::digest(&bytes));
        if !actual.eq_ignore_ascii_case(expected.trim()) {
            return Err("O instalador baixado não corresponde ao checksum publicado.".into());
        }
    }

    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir().map(|home| home.join("Downloads")))
        .map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let mut target = dir.join(name);
    let stem = target
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("toph-update")
        .to_string();
    let extension = target
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_string();
    let mut counter = 1;
    while target.exists() {
        let candidate = if extension.is_empty() {
            format!("{stem} ({counter})")
        } else {
            format!("{stem} ({counter}).{extension}")
        };
        target = dir.join(candidate);
        counter += 1;
    }
    fs::write(&target, &bytes)
        .map_err(|err| format!("Não foi possível salvar o instalador: {err}"))?;
    Ok(target.display().to_string())
}

#[cfg(not(target_os = "android"))]
macro_rules! desktop_commands {
    () => {
        tauri::generate_handler![
            validate_server,
            open_server,
            open_scanned_url,
            show_launcher,
            take_launcher_reset,
            start_local_server,
            open_local_server,
            local_pairing,
            is_mobile,
            environment_status,
            install_environment,
            restart_app,
            download_update
        ]
    };
}

#[cfg(target_os = "android")]
macro_rules! desktop_commands {
    () => {
        tauri::generate_handler![
            validate_server,
            open_server,
            open_scanned_url,
            is_mobile,
            download_update
        ]
    };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(url) = window.url() {
                    let _ = LAUNCHER_URL.set(url);
                }
            }
            Ok(())
        })
        .invoke_handler(desktop_commands!());

    #[cfg(mobile)]
    {
        builder = builder.plugin(tauri_plugin_barcode_scanner::init());
    }

    #[cfg(not(target_os = "android"))]
    {
        builder = builder.manage(LocalState::default());
    }

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building Toph Client");

    app.run(|_app_handle, _event| {
        #[cfg(not(target_os = "android"))]
        if let RunEvent::Exit = _event {
            if let Some(state) = _app_handle.try_state::<LocalState>() {
                if let Ok(mut slot) = state.server.lock() {
                    if let Some(server) = slot.take() {
                        server.server.shutdown();
                    }
                }
            }
        }
    });
}

#[cfg(all(test, not(target_os = "android")))]
mod local_mode_tests {
    use super::*;

    async fn json(response: reqwest::Response) -> serde_json::Value {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        assert!(status.is_success(), "HTTP {status}: {body}");
        serde_json::from_str(&body).unwrap_or_default()
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn desktop_local_helpers_create_workspace_and_pairing() {
        let data = tempfile::tempdir().expect("data");
        let workspace = tempfile::tempdir().expect("workspace");
        let workspace_root = workspace
            .path()
            .canonicalize()
            .unwrap_or_else(|_| workspace.path().to_path_buf());
        let password = random_password();

        let config = toph_server::config::Config::local(
            data.path().to_path_buf(),
            workspace_root.clone(),
            password.clone(),
            "127.0.0.1:0".into(),
        );
        let server = toph_server::start_embedded(config).await.expect("server");
        let base = Url::parse(&format!("http://127.0.0.1:{}/", server.addr.port())).unwrap();

        let mut healthy = false;
        for _ in 0..30 {
            if health(&base).await.is_ok() {
                healthy = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        assert!(healthy, "embedded server did not become healthy");

        let (session, csrf) = login_cookie_headers(&base, &password)
            .await
            .expect("local login");
        ensure_local_workspace(&base, &session, &csrf, &workspace_root)
            .await
            .expect("workspace setup");

        let (code, expires_in) = create_pairing(&base, &session, &csrf)
            .await
            .expect("pairing code");
        assert!(expires_in > 0);
        let url = app_url(&base, &code, true).expect("app url");
        let query: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(query.get("pair").map(String::as_str), Some(code.as_str()));
        assert_eq!(query.get("desktop").map(String::as_str), Some("1"));

        let client = reqwest::Client::new();
        let paired = client
            .post(endpoint(&base, "api/auth/pair").unwrap())
            .json(&serde_json::json!({"code": code, "kind": "web"}))
            .send()
            .await
            .expect("pair");
        assert!(paired.status().is_success());
        let cookies: Vec<String> = paired
            .headers()
            .get_all(reqwest::header::SET_COOKIE)
            .iter()
            .filter_map(|value| value.to_str().ok())
            .filter_map(|value| value.split(';').next())
            .map(ToString::to_string)
            .collect();
        let me = client
            .get(endpoint(&base, "api/auth/me").unwrap())
            .header(reqwest::header::COOKIE, cookies.join("; "))
            .send()
            .await
            .expect("me");
        let me = json(me).await;
        assert_eq!(
            me.pointer("/user/username")
                .and_then(serde_json::Value::as_str),
            Some("admin")
        );

        let projects = client
            .get(endpoint(&base, "api/projects").unwrap())
            .header(
                reqwest::header::COOKIE,
                format!("toph_session={session}; toph_csrf={csrf}"),
            )
            .send()
            .await
            .expect("projects");
        let projects = json(projects).await;
        assert!(
            projects
                .as_array()
                .map(|items| items.iter().any(|item| {
                    item.get("root").and_then(serde_json::Value::as_str)
                        == Some(workspace_root.to_string_lossy().as_ref())
                }))
                .unwrap_or(false),
            "workspace project was not created: {projects}"
        );

        server.shutdown();
    }
}
