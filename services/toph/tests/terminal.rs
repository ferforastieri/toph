use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use reqwest::cookie::{CookieStore, Jar};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::header::COOKIE;
use tokio_tungstenite::tungstenite::Message;
use toph_server::config::Config;

#[tokio::test]
async fn terminal_websocket_streams_commands_and_output() {
    if !cfg!(unix) {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let workspace = dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();
    let server = toph_server::start_embedded(Config::local(
        dir.path().join("data"),
        PathBuf::from(&workspace),
        "secret".into(),
        "127.0.0.1:0".into(),
    ))
    .await
    .unwrap();
    let origin = format!("http://{}", server.addr);
    let jar = Arc::new(Jar::default());
    let client = reqwest::Client::builder()
        .cookie_provider(jar.clone())
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let login: serde_json::Value = client
        .post(format!("{origin}/api/auth/login"))
        .json(&serde_json::json!({"username":"admin","password":"secret","kind":"web"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let csrf = login["csrfToken"].as_str().unwrap().to_string();
    let projects: Vec<serde_json::Value> = client
        .get(format!("{origin}/api/projects"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let project_id = projects[0]["id"].as_str().unwrap();
    let terminal: serde_json::Value = client
        .post(format!("{origin}/api/projects/{project_id}/terminals"))
        .header("X-Toph-CSRF", csrf)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let terminal_id = terminal["id"].as_str().unwrap();

    let ws_url = format!("ws://{}/api/terminals/{terminal_id}/ws", server.addr);
    let mut request = ws_url.into_client_request().unwrap();
    let cookie_url = reqwest::Url::parse(&origin).unwrap();
    if let Some(cookies) = jar.cookies(&cookie_url) {
        request
            .headers_mut()
            .insert(COOKIE, cookies.to_str().unwrap().parse().unwrap());
    }
    let (mut socket, _) = tokio_tungstenite::connect_async(request).await.unwrap();
    socket
        .send(Message::Binary(
            b"printf 'toph-terminal-ok\\n'\n".to_vec().into(),
        ))
        .await
        .unwrap();

    let found = tokio::time::timeout(Duration::from_secs(10), async {
        while let Some(message) = socket.next().await {
            let message = message.unwrap();
            if let Message::Binary(data) = message {
                let text = String::from_utf8_lossy(&data);
                if text.contains("toph-terminal-ok") {
                    return true;
                }
            }
        }
        false
    })
    .await
    .unwrap();
    assert!(found, "terminal did not stream command output");
    server.shutdown();
}
