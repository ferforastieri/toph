use std::path::PathBuf;
use std::time::Duration;

use serde_json::{json, Value};
use toph_server::config::Config;

#[tokio::test]
async fn email_accounts_are_managed_through_the_authenticated_api() {
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
    let client = reqwest::Client::builder()
        .cookie_store(true)
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let base = format!("http://{}", server.addr);

    let login: Value = client
        .post(format!("{base}/api/auth/login"))
        .json(&json!({"username":"admin","password":"secret","kind":"web"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let csrf = login["csrfToken"].as_str().unwrap().to_string();

    let accounts: Vec<Value> = client
        .get(format!("{base}/api/email/accounts"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(accounts.is_empty());

    let invalid = client
        .post(format!("{base}/api/email/accounts"))
        .header("X-Toph-CSRF", &csrf)
        .json(&json!({
            "name": "Incomplete",
            "email": "me@example.com"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(invalid.status(), reqwest::StatusCode::BAD_REQUEST);

    let created: Value = client
        .post(format!("{base}/api/email/accounts"))
        .header("X-Toph-CSRF", &csrf)
        .json(&json!({
            "name": "Personal",
            "email": "me@example.com",
            "imapHost": "imap.example.com",
            "imapPort": 993,
            "imapUser": "me@example.com",
            "imapPassword": "imap-secret",
            "imapTls": true,
            "smtpHost": "smtp.example.com",
            "smtpPort": 465,
            "smtpUser": "me@example.com",
            "smtpPassword": "smtp-secret",
            "smtpTls": true
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let account_id = created["id"].as_str().unwrap().to_string();
    assert_eq!(created["imapPort"], 993);
    assert_eq!(created["imapTls"], true);
    let serialized = created.to_string();
    assert!(!serialized.contains("imap-secret"));
    assert!(!serialized.contains("smtp-secret"));
    assert!(!serialized.to_ascii_lowercase().contains("password"));

    let accounts: Vec<Value> = client
        .get(format!("{base}/api/email/accounts"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(accounts.len(), 1);
    assert_eq!(accounts[0]["email"], "me@example.com");

    let missing = client
        .get(format!("{base}/api/email/accounts/missing/messages"))
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), reqwest::StatusCode::NOT_FOUND);

    let deleted: Value = client
        .delete(format!("{base}/api/email/accounts/{account_id}"))
        .header("X-Toph-CSRF", &csrf)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(deleted["ok"], true);

    let accounts: Vec<Value> = client
        .get(format!("{base}/api/email/accounts"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(accounts.is_empty());

    server.shutdown();
}
