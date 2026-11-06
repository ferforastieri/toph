use std::path::Path;

use toph_server::auth::{hash_password, verify_password, AuthManager};
use toph_server::crypto::sha256_hex;
use toph_server::store::Store;
use toph_server::workspace::WorkspaceService;

#[test]
fn passwords_use_argon2_and_verify() {
    let hash = hash_password("correct horse battery staple").unwrap();
    assert!(hash.starts_with("$argon2id$"));
    assert!(verify_password(&hash, "correct horse battery staple"));
    assert!(!verify_password(&hash, "wrong"));
}

#[tokio::test]
async fn auth_bootstraps_and_authenticates_sessions() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("toph.db")).await.unwrap();
    let auth = AuthManager::new(store.clone(), false);
    assert_eq!(auth.bootstrap("secret").await.unwrap(), None);
    assert_eq!(auth.bootstrap("secret").await.unwrap(), None);
    let login = auth.login("admin", "secret", "web").await.unwrap();
    let (session, user) = auth.authenticate(&login.token).await.unwrap();
    assert_eq!(session.id, login.session.id);
    assert_eq!(user.username, "admin");
    assert!(auth.login("admin", "wrong", "web").await.is_err());
    auth.logout(&session.id).await.unwrap();
    assert!(auth.authenticate(&login.token).await.is_err());
}

#[tokio::test]
async fn workspace_rejects_escapes_and_handles_conflicts() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("repo");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src/main.rs"), "fn main() {}\n").unwrap();
    let workspace = WorkspaceService::new(vec![root.clone()]).unwrap();
    let entries = workspace.list(Path::new(&root), "").unwrap();
    assert!(entries.iter().any(|entry| entry.name == "src"));
    let file = workspace.read(Path::new(&root), "src/main.rs").unwrap();
    assert_eq!(file.content, "fn main() {}\n");
    assert_eq!(file.hash, sha256_hex(file.content.as_bytes()));

    let updated = workspace
        .write(
            Path::new(&root),
            "src/main.rs",
            "fn main() { println!(\"ok\"); }\n",
            &file.hash,
        )
        .unwrap();
    assert_ne!(updated.hash, file.hash);
    assert!(matches!(
        workspace.write(Path::new(&root), "src/main.rs", "x", &file.hash),
        Err(toph_server::errors::AppError::FileConflict)
    ));
    assert!(workspace.read(Path::new(&root), "../outside").is_err());
}

#[tokio::test]
async fn store_persists_projects_and_profiles() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("toph.db")).await.unwrap();
    let project = store
        .create_project(toph_server::model::Project {
            id: "project".into(),
            name: "Repo".into(),
            root: dir.path().to_string_lossy().to_string(),
            color: "#43E6A0".into(),
            created_at: String::new(),
            updated_at: String::new(),
        })
        .await
        .unwrap();
    assert_eq!(store.project("project").await.unwrap().name, "Repo");
    assert_eq!(store.list_projects().await.unwrap().len(), 1);
    store.set_setting("theme", "dark").await.unwrap();
    assert_eq!(store.setting("theme").await.unwrap(), "dark");
    store.delete_project(&project.id).await.unwrap();
    assert!(store.list_projects().await.unwrap().is_empty());
}

#[tokio::test]
async fn chat_history_is_paginated_by_scope() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("toph.db")).await.unwrap();
    let user = store
        .create_user("history-user", &hash_password("secret").unwrap())
        .await
        .unwrap();
    store
        .create_project(toph_server::model::Project {
            id: "history-project".into(),
            name: "History".into(),
            root: dir.path().join("history").to_string_lossy().to_string(),
            color: "#43E6A0".into(),
            created_at: String::new(),
            updated_at: String::new(),
        })
        .await
        .unwrap();

    let layout = serde_json::json!({
        "tabs": [],
        "activeTabId": null,
        "chats": {
            "version": 1,
            "chats": [{
                "id": "chat-one",
                "name": "checkout",
                "description": "pagamentos",
                "createdAt": 1,
                "updatedAt": 1
            }],
            "tophs": [],
            "activeChatId": "chat-one"
        }
    });
    store
        .save_workspace_layout(user.id, "history-project", &layout.to_string())
        .await
        .unwrap();

    let saved: serde_json::Value = serde_json::from_str(
        &store
            .workspace_layout(user.id, "history-project")
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(saved["chats"]["chats"][0]["name"], "checkout");

    let mut messages = Vec::new();
    for index in 0..55 {
        messages.push(serde_json::json!({
            "id": format!("conversation-{index:02}"),
            "chatId": "chat-one",
            "role": "assistant",
            "content": format!("answer {index}"),
            "createdAt": index * 2,
        }));
        messages.push(serde_json::json!({
            "id": format!("activity-{index:02}"),
            "chatId": "chat-one",
            "role": "tool",
            "content": "{}",
            "detail": format!("output {index}"),
            "createdAt": index * 2 + 1,
        }));
    }
    store
        .save_workspace_messages(user.id, "history-project", messages)
        .await
        .unwrap();

    let first = store
        .workspace_messages(
            user.id,
            "history-project",
            "chat",
            Some("chat-one"),
            "conversation",
            None,
            20,
        )
        .await
        .unwrap();
    assert_eq!(first.items.len(), 20);
    assert!(first.has_more);
    assert_eq!(first.items.first().unwrap()["id"], "conversation-35");
    assert_eq!(first.items.last().unwrap()["id"], "conversation-54");

    let second = store
        .workspace_messages(
            user.id,
            "history-project",
            "chat",
            Some("chat-one"),
            "conversation",
            first.next_cursor.as_ref(),
            20,
        )
        .await
        .unwrap();
    assert_eq!(second.items.first().unwrap()["id"], "conversation-15");
    assert_eq!(second.items.last().unwrap()["id"], "conversation-34");

    let activity = store
        .workspace_messages(
            user.id,
            "history-project",
            "chat",
            Some("chat-one"),
            "activity",
            None,
            10,
        )
        .await
        .unwrap();
    assert_eq!(activity.items.len(), 10);
    assert!(activity
        .items
        .iter()
        .all(|message| message["role"] == "tool"));

    let deleted = store
        .delete_workspace_messages(
            user.id,
            "history-project",
            Some("chat"),
            Some("chat-one"),
            None,
        )
        .await
        .unwrap();
    assert_eq!(deleted, 110);

    let empty = store
        .workspace_messages(
            user.id,
            "history-project",
            "chat",
            Some("chat-one"),
            "conversation",
            None,
            20,
        )
        .await
        .unwrap();
    assert!(empty.items.is_empty());
}
