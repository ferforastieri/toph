use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use reqwest::cookie::{CookieStore, Jar};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::header::COOKIE;
use toph_server::config::Config;

#[tokio::test]
async fn external_file_changes_are_streamed_over_websocket() {
    let dir = tempfile::tempdir().unwrap();
    let workspace = dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();
    let config = Config::local(
        dir.path().join("data"),
        PathBuf::from(&workspace),
        "secret".into(),
        "127.0.0.1:0".into(),
    );
    let server = toph_server::start_embedded(config).await.unwrap();
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
    let project_id = projects[0]["id"].as_str().unwrap().to_string();

    let ws_url = format!("ws://{}/api/events/ws", server.addr);
    let mut request = ws_url.into_client_request().unwrap();
    let cookie_url = reqwest::Url::parse(&origin).unwrap();
    if let Some(cookies) = jar.cookies(&cookie_url) {
        request
            .headers_mut()
            .insert(COOKIE, cookies.to_str().unwrap().parse().unwrap());
    }
    let (mut socket, _) = tokio_tungstenite::connect_async(request).await.unwrap();

    std::fs::write(workspace.join("external.txt"), "changed\n").unwrap();
    let event = tokio::time::timeout(Duration::from_secs(5), async {
        while let Some(message) = socket.next().await {
            let message = message.unwrap();
            if let Ok(text) = message.into_text() {
                if text.trim().is_empty() {
                    continue;
                }
                let value: serde_json::Value = serde_json::from_str(&text).unwrap();
                if value["type"] == "files" && value["projectId"] == project_id {
                    return value;
                }
            }
        }
        panic!("websocket closed before an event arrived");
    })
    .await
    .expect("timed out waiting for file event");
    assert_eq!(event["path"], "external.txt");
    assert!(!csrf.is_empty());
    server.shutdown();
}
