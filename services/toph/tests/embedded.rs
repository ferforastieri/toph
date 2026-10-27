use std::path::PathBuf;
use std::time::Duration;

use serde_json::Value;
use toph_server::config::Config;

#[tokio::test]
async fn embedded_server_serves_authenticated_api() {
    let dir = tempfile::tempdir().unwrap();
    let workspace = dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();
    std::fs::write(workspace.join("hello.txt"), "hello\n").unwrap();
    let config = Config::local(
        dir.path().join("data"),
        PathBuf::from(&workspace),
        "secret".into(),
        "127.0.0.1:0".into(),
    );
    let server = toph_server::start_embedded(config).await.unwrap();
    let client = reqwest::Client::builder()
        .cookie_store(true)
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let base = format!("http://{}", server.addr);

    let health: Value = client
        .get(format!("{base}/api/health"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(health["name"], "toph");

    let login: Value = client
        .post(format!("{base}/api/auth/login"))
        .json(&serde_json::json!({"username":"admin","password":"secret","kind":"web"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let csrf = login["csrfToken"].as_str().unwrap().to_string();

    let projects: Vec<Value> = client
        .get(format!("{base}/api/projects"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(projects.len(), 1);
    let project_id = projects[0]["id"].as_str().unwrap();
    let entries: Vec<Value> = client
        .get(format!("{base}/api/projects/{project_id}/tree?path="))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(entries.iter().any(|entry| entry["name"] == "hello.txt"));

    let saved: Value = client
        .put(format!("{base}/api/projects/{project_id}/file"))
        .header("X-Toph-CSRF", csrf)
        .json(&serde_json::json!({"path":"hello.txt","content":"updated\n","baseHash":""}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(saved["content"], "updated\n");

    server.shutdown();
}
