//! End-to-end smoke test for desktop local mode.
//!
//! Starts the embedded server the same way the desktop app does, then checks
//! the pieces local mode depends on: health, admin login, the default
//! workspace/project, a real PTY terminal over WebSocket, and the one-time
//! pairing code used by the phone QR flow.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

const PASSWORD: &str = "local-mode-test-password";

fn cookie_header(response: &reqwest::Response) -> String {
    response
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .filter_map(|value| value.split(';').next())
        .collect::<Vec<_>>()
        .join("; ")
}

fn cookie_value(response: &reqwest::Response, name: &str) -> String {
    response
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .find_map(|value| {
            value
                .split(';')
                .next()
                .and_then(|pair| pair.strip_prefix(&format!("{name}=")))
                .map(ToString::to_string)
        })
        .unwrap_or_default()
}

async fn json_response(response: reqwest::Response) -> Value {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    assert!(status.is_success(), "unexpected HTTP {status}: {body}");
    serde_json::from_str(&body).unwrap_or_else(|_| json!({}))
}

#[tokio::test(flavor = "multi_thread")]
async fn local_mode_workspace_terminal_and_pairing() {
    let workspace = tempfile::tempdir().expect("workspace");
    let data = tempfile::tempdir().expect("data");
    let workspace_root = workspace
        .path()
        .canonicalize()
        .unwrap_or_else(|_| workspace.path().to_path_buf());

    // `0.0.0.0:0` is what the desktop uses when LAN sharing is enabled.
    let config = toph_server::config::Config::local(
        data.path().to_path_buf(),
        workspace_root.clone(),
        PASSWORD.into(),
        "0.0.0.0:0".into(),
    );
    let server = toph_server::start_embedded(config)
        .await
        .expect("embedded server");
    let port = server.addr.port();
    let base = format!("http://127.0.0.1:{port}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .expect("http client");

    // Health is reachable through loopback even when the listener is on 0.0.0.0.
    let health: Value = json_response(
        client
            .get(format!("{base}/api/health"))
            .send()
            .await
            .expect("health"),
    )
    .await;
    assert_eq!(health.get("ok").and_then(Value::as_bool), Some(true));
    assert_eq!(health.get("name").and_then(Value::as_str), Some("toph"));

    // Admin login returns the HttpOnly session plus the CSRF cookie.
    let login = client
        .post(format!("{base}/api/auth/login"))
        .json(&json!({"username": "admin", "password": PASSWORD, "kind": "web"}))
        .send()
        .await
        .expect("login");
    assert!(login.status().is_success(), "login failed");
    let cookie = cookie_header(&login);
    let csrf = cookie_value(&login, "toph_csrf");
    assert!(cookie.contains("toph_session="), "missing session cookie");
    assert!(!csrf.is_empty(), "missing csrf cookie");

    let me = client
        .get(format!("{base}/api/auth/me"))
        .header(reqwest::header::COOKIE, &cookie)
        .send()
        .await
        .expect("me");
    let me: Value = json_response(me).await;
    assert_eq!(
        me.pointer("/user/username").and_then(Value::as_str),
        Some("admin")
    );

    // The configured workspace becomes the default project without extra setup.
    let projects: Value = json_response(
        client
            .get(format!("{base}/api/projects"))
            .header(reqwest::header::COOKIE, &cookie)
            .send()
            .await
            .expect("projects"),
    )
    .await;
    let project = projects
        .as_array()
        .and_then(|items| items.first())
        .expect("default project");
    let project_id = project
        .get("id")
        .and_then(Value::as_str)
        .expect("project id")
        .to_string();
    assert_eq!(
        project.get("root").and_then(Value::as_str),
        Some(workspace_root.to_string_lossy().as_ref())
    );

    // A real PTY accepts input and streams output back.
    let terminal: Value = json_response(
        client
            .post(format!("{base}/api/projects/{project_id}/terminals"))
            .header(reqwest::header::COOKIE, &cookie)
            .header("X-Toph-CSRF", &csrf)
            .json(&json!({}))
            .send()
            .await
            .expect("terminal"),
    )
    .await;
    let terminal_id = terminal
        .get("id")
        .and_then(Value::as_str)
        .expect("terminal id")
        .to_string();

    let mut ws_request = format!("ws://127.0.0.1:{port}/api/terminals/{terminal_id}/ws")
        .into_client_request()
        .expect("ws request");
    ws_request.headers_mut().insert(
        reqwest::header::COOKIE,
        cookie.parse().expect("cookie header"),
    );
    let (mut socket, _) = tokio_tungstenite::connect_async(ws_request)
        .await
        .expect("terminal websocket");
    socket
        .send(Message::Binary(b"echo toph-local-ok\n".to_vec().into()))
        .await
        .expect("terminal input");

    let mut output = Vec::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    let mut found = false;
    while tokio::time::Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        match tokio::time::timeout(remaining, socket.next()).await {
            Ok(Some(Ok(Message::Binary(data)))) => {
                output.extend_from_slice(&data);
                if String::from_utf8_lossy(&output).contains("toph-local-ok") {
                    found = true;
                    break;
                }
            }
            Ok(Some(Ok(_))) => {}
            Ok(Some(Err(error))) => panic!("terminal socket error: {error}"),
            Ok(None) | Err(_) => break,
        }
    }
    assert!(
        found,
        "terminal did not return the command output: {}",
        String::from_utf8_lossy(&output)
    );
    let _ = socket.close(None).await;

    // Pairing issues a single-use code that creates a normal web session.
    let pairing: Value = json_response(
        client
            .post(format!("{base}/api/pairing"))
            .header(reqwest::header::COOKIE, &cookie)
            .header("X-Toph-CSRF", &csrf)
            .json(&json!({}))
            .send()
            .await
            .expect("pairing"),
    )
    .await;
    let code = pairing
        .get("code")
        .and_then(Value::as_str)
        .expect("pairing code")
        .to_string();
    assert!(
        pairing
            .get("expiresIn")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            > 0
    );

    let paired = client
        .post(format!("{base}/api/auth/pair"))
        .json(&json!({"code": code, "kind": "web"}))
        .send()
        .await
        .expect("pair");
    assert!(paired.status().is_success(), "pairing failed");
    let paired_cookie = cookie_header(&paired);
    assert!(
        paired_cookie.contains("toph_session="),
        "missing paired session"
    );
    let paired_me: Value = json_response(
        client
            .get(format!("{base}/api/auth/me"))
            .header(reqwest::header::COOKIE, &paired_cookie)
            .send()
            .await
            .expect("paired me"),
    )
    .await;
    assert_eq!(
        paired_me.pointer("/user/username").and_then(Value::as_str),
        Some("admin")
    );

    let replay = client
        .post(format!("{base}/api/auth/pair"))
        .json(&json!({"code": code, "kind": "web"}))
        .send()
        .await
        .expect("replay");
    assert_eq!(replay.status(), reqwest::StatusCode::UNAUTHORIZED);

    server.shutdown();
}
