use serde::Serialize;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use url::Url;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerInfo {
    base_url: String,
    name: String,
    version: String,
    build_id: Option<String>,
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

#[tauri::command]
async fn validate_server(url: String) -> Result<ServerInfo, String> {
    let base = normalize_server(&url)?;
    let health_url = endpoint(&base, "api/health")?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|err| err.to_string())?;
    let response = client
        .get(health_url)
        .send()
        .await
        .map_err(|_| "Não foi possível conectar. Confira a URL e se o servidor está acessível.".to_string())?;
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
    Ok(ServerInfo {
        base_url: base.to_string(),
        name: value.get("name").and_then(|v| v.as_str()).unwrap_or("Toph").to_string(),
        version: value.get("version").and_then(|v| v.as_str()).unwrap_or("unknown").to_string(),
        build_id: value.get("buildId").and_then(|v| v.as_str()).map(ToString::to_string),
    })
}

#[tauri::command]
fn open_server(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let base = normalize_server(&url)?;
    let target = endpoint(&base, "app/")?;
    if let Some(existing) = app.get_webview_window("server") {
        let _ = existing.close();
    }
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "Janela inicial não encontrada.".to_string())?;

    let remote = WebviewWindowBuilder::new(&app, "server", WebviewUrl::External(target))
        .title("Toph")
        .inner_size(1440.0, 900.0)
        .min_inner_size(960.0, 640.0)
        .resizable(true)
        .build()
        .map_err(|err| format!("Não foi possível abrir o servidor: {err}"))?;

    let _ = main.hide();
    let app_handle = app.clone();
    remote.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed | WindowEvent::CloseRequested { .. }) {
            if let Some(main) = app_handle.get_webview_window("main") {
                let _ = main.show();
                let _ = main.set_focus();
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn start_local_server() -> Result<(), String> {
    Err("O modo local ainda não está disponível nesta compilação. O cliente de servidor já está funcional.".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            validate_server,
            open_server,
            start_local_server
        ])
        .run(tauri::generate_context!())
        .expect("error while running Toph Desktop");
}
