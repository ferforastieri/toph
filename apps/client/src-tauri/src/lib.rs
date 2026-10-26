use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent, State};
use url::Url;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerInfo {
    base_url: String,
    name: String,
    version: String,
    build_id: Option<String>,
}

#[derive(Default)]
struct LocalState {
    child: Mutex<Option<Child>>,
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
fn open_server(window: tauri::WebviewWindow, app: tauri::AppHandle, url: String) -> Result<(), String> {
    require_local(&window)?;
    let base = normalize_server(&url)?;
    let mut target = endpoint(&base, "app/")?;
    target
        .query_pairs_mut()
        .append_pair("server", base.as_str());
    match navigate_main(&app, target.clone()) {
        Ok(()) => {
            eprintln!("toph: navigating to server {target}");
            Ok(())
        }
        Err(err) => {
            eprintln!("toph: could not navigate to server {target}: {err}");
            Err(err)
        }
    }
}

fn sidecar_name() -> &'static str {
    if cfg!(windows) {
        "toph.exe"
    } else {
        "toph"
    }
}

fn local_binary(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(resource) = app.path().resource_dir() {
        let candidate = resource.join("resources").join(sidecar_name());
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    let name = sidecar_name();
    for candidate in [format!("../bin/{name}"), format!("../../bin/{name}")] {
        let candidate = PathBuf::from(candidate);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err("Backend local não foi encontrado nesta instalação.".into())
}

fn quiet_command(binary: &PathBuf) -> Command {
    let mut command = Command::new(binary);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: the sidecar is a console program, but the desktop
        // app is graphical and must not flash a console window.
        command.creation_flags(0x08000000);
    }
    command
}

fn kill_child(child: &mut Child) {
    #[cfg(unix)]
    {
        // Let the Go server shut down terminals and close its database cleanly.
        unsafe {
            libc::kill(child.id() as i32, libc::SIGTERM);
        }
        for _ in 0..20 {
            if matches!(child.try_wait(), Ok(Some(_))) {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/T", "/F", "/PID", &child.id().to_string()])
            .creation_flags(0x08000000)
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

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

#[tauri::command]
async fn start_local_server(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<'_, LocalState>,
    workspace: Option<String>,
) -> Result<(), String> {
    require_local(&window)?;
    let binary = local_binary(&app)?;
    if let Ok(mut slot) = state.child.lock() {
        if let Some(mut old) = slot.take() {
            kill_child(&mut old);
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

    let port = (38100u16..38200)
        .find(|port| TcpListener::bind(("127.0.0.1", *port)).is_ok())
        .ok_or_else(|| "Não encontrei uma porta local livre.".to_string())?;
    let base = Url::parse(&format!("http://127.0.0.1:{port}/")).map_err(|err| err.to_string())?;

    let mut child = quiet_command(&binary)
        .env("TOPH_ADDR", format!("127.0.0.1:{port}"))
        .env("TOPH_DATA_DIR", &data_dir)
        .env("TOPH_WORKSPACES", &workspace_root)
        .env("TOPH_ADMIN_PASSWORD", &password)
        .env("TOPH_SECURE_COOKIES", "false")
        .env("TOPH_TRUSTED_PROXIES", "127.0.0.1/32")
        .spawn()
        .map_err(|err| format!("Não foi possível iniciar o backend local: {err}"))?;

    let mut healthy = false;
    for _ in 0..30 {
        if health(&base).await.is_ok() {
            healthy = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    if !healthy {
        kill_child(&mut child);
        return Err("O backend local não ficou saudável.".into());
    }

    let (session, csrf) = match login_cookie_headers(&base, &password).await {
        Ok(value) => value,
        Err(err) => {
            kill_child(&mut child);
            return Err(err);
        }
    };
    if let Err(err) = ensure_local_workspace(&base, &session, &csrf, &workspace_root).await {
        kill_child(&mut child);
        return Err(err);
    }
    if let Ok(mut slot) = state.child.lock() {
        *slot = Some(child);
    }

    let mut target = endpoint(&base, "app/")?;
    target
        .query_pairs_mut()
        .append_pair("server", base.as_str());
    if let Err(err) = navigate_main(&app, target) {
        if let Ok(mut slot) = state.child.lock() {
            if let Some(mut process) = slot.take() {
                kill_child(&mut process);
            }
        }
        return Err(err);
    }
    if let Some(window) = app.get_webview_window("main") {
        let fallback = format!(
            "if (!document.cookie.includes('toph_session={session}')) {{ \
                 document.cookie='toph_session={session}; Path=/; SameSite=Strict'; \
                 document.cookie='toph_csrf={csrf}; Path=/; SameSite=Strict'; \
                 location.reload(); \
             }}"
        );
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(1200));
            let _ = window.eval(&fallback);
        });
    }
    Ok(())
}

#[tauri::command]
fn is_mobile() -> bool {
    cfg!(mobile)
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
        Some("github.com") | Some("objects.githubusercontent.com") | Some("github-releases.githubusercontent.com")
    ) {
        return Err("Origem de atualização não permitida.".into());
    }
    let name = filename
        .rsplit(|character| character == '/' || character == '\\')
        .next()
        .unwrap_or("")
        .trim();
    if !matches!(
        PathBuf::from(name).extension().and_then(|value| value.to_str()),
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
    fs::write(&target, &bytes).map_err(|err| format!("Não foi possível salvar o instalador: {err}"))?;
    Ok(target.display().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(LocalState::default())
        .setup(|_app| Ok(()))
        .invoke_handler(tauri::generate_handler![
            validate_server,
            open_server,
            start_local_server,
            is_mobile,
            download_update
        ]);

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building Toph Client");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<LocalState>() {
                if let Ok(mut child) = state.child.lock() {
                    if let Some(mut process) = child.take() {
                        kill_child(&mut process);
                    }
                }
            }
        }
    });
}
