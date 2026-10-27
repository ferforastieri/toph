use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: i64,
    pub username: String,
    #[serde(skip)]
    pub password_hash: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub user_id: i64,
    pub kind: String,
    pub created_at: String,
    pub expires_at: String,
    pub last_seen_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub root: String,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DbProfile {
    pub id: String,
    pub name: String,
    pub folder: String,
    pub project_root: String,
    pub driver: String,
    #[serde(skip)]
    pub dsn_encrypted: String,
    pub read_only: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct WebTarget {
    pub id: String,
    pub name: String,
    pub url: String,
    pub icon: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub dir: bool,
    pub size: i64,
    pub mod_time: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub hash: String,
    pub mod_time: String,
    pub size: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchMatch {
    pub path: String,
    pub line: usize,
    pub column: usize,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Repository {
    pub name: String,
    pub path: String,
    pub root: String,
    pub relative: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBlameLine {
    pub line: usize,
    pub commit: String,
    pub author: String,
    pub author_time: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitBranches {
    pub current: String,
    pub branches: Vec<String>,
}
