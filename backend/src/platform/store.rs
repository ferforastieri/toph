use std::path::Path;
use std::str::FromStr;
use std::time::Duration;

use chrono::Utc;
use serde_json::Value;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Row, SqlitePool};

use crate::errors::{AppError, AppResult};
pub use crate::features::conversations::repository::{
    WorkspaceMessageCursor, WorkspaceMessagePage,
};

#[derive(Clone)]
pub struct Store {
    pub(crate) pool: SqlitePool,
}

impl Store {
    pub async fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let options = SqliteConnectOptions::from_str(&path.to_string_lossy())
            .map_err(|error| crate::errors::internal(error.to_string()))?
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal)
            .foreign_keys(true)
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await?;
        sqlx::raw_sql(include_str!("schema.sql"))
            .execute(&pool)
            .await?;
        sqlx::raw_sql(include_str!("../features/agents/schema.sql"))
            .execute(&pool)
            .await?;
        // Older local databases may predate these columns.
        let _ = sqlx::query("ALTER TABLE db_profiles ADD COLUMN folder TEXT NOT NULL DEFAULT ''")
            .execute(&pool)
            .await;
        let _ =
            sqlx::query("ALTER TABLE db_profiles ADD COLUMN project_root TEXT NOT NULL DEFAULT ''")
                .execute(&pool)
                .await;
        // Clean break from the old team/individual Toph model. New chat
        // messages use mode = 'chat' and are preserved.
        let _ = sqlx::query("DELETE FROM bot_messages WHERE mode <> 'chat'")
            .execute(&pool)
            .await;
        if let Ok(rows) = sqlx::query("SELECT user_id, project_id, layout FROM workspaces")
            .fetch_all(&pool)
            .await
        {
            for row in rows {
                let user_id: i64 = row.get("user_id");
                let project_id: String = row.get("project_id");
                let raw: String = row.get("layout");
                let Ok(mut layout) = serde_json::from_str::<Value>(&raw) else {
                    continue;
                };
                let Some(object) = layout.as_object_mut() else {
                    continue;
                };
                let mut changed = false;
                for key in [
                    "bots",
                    "savedSolo",
                    "savedTeam",
                    "mode",
                    "modeExplicit",
                    "activeBotId",
                ] {
                    if object.remove(key).is_some() {
                        changed = true;
                    }
                }
                if changed {
                    let _ = sqlx::query(
                        "UPDATE workspaces SET layout = ?, updated_at = ? WHERE user_id = ? AND project_id = ?",
                    )
                    .bind(layout.to_string())
                    .bind(now())
                    .bind(user_id)
                    .bind(&project_id)
                    .execute(&pool)
                    .await;
                }
            }
        }
        Ok(Self { pool })
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn close(&self) {
        self.pool.close().await;
    }
}

pub(crate) fn now() -> String {
    Utc::now().to_rfc3339()
}

pub(crate) fn map_not_found(error: sqlx::Error) -> AppError {
    match error {
        sqlx::Error::RowNotFound => AppError::NotFound,
        other => other.into(),
    }
}

pub(crate) fn is_unique(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .map(|error| error.is_unique_violation())
        .unwrap_or(false)
}
