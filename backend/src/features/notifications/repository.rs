use serde::Serialize;

use crate::errors::AppResult;
use crate::platform::store::now;
use crate::platform::store::Store;

/// One persisted in-app notification, shared by every client of the user.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StoredNotification {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chat_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bot_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bot_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bot_role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notification_id: Option<String>,
    pub created_at: i64,
    #[serde(rename = "read")]
    pub is_read: bool,
}

impl Store {
    pub async fn save_notification(
        &self,
        user_id: i64,
        item: &StoredNotification,
    ) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO notifications
                (id, user_id, kind, title, body, project_id, project_name, chat_id, session_id,
                 bot_id, bot_name, bot_role, notification_id, created_at, is_read)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title, body = excluded.body, is_read = excluded.is_read",
        )
        .bind(&item.id)
        .bind(user_id)
        .bind(&item.kind)
        .bind(&item.title)
        .bind(&item.body)
        .bind(&item.project_id)
        .bind(&item.project_name)
        .bind(&item.chat_id)
        .bind(&item.session_id)
        .bind(&item.bot_id)
        .bind(&item.bot_name)
        .bind(&item.bot_role)
        .bind(&item.notification_id)
        .bind(item.created_at)
        .bind(item.is_read)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_notifications(
        &self,
        user_id: i64,
        limit: i64,
    ) -> AppResult<Vec<StoredNotification>> {
        Ok(sqlx::query_as::<_, StoredNotification>(
            "SELECT id, kind, title, body, project_id, project_name, chat_id, session_id,
                    bot_id, bot_name, bot_role, notification_id, created_at, is_read
             FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?)
    }

    pub async fn mark_notifications_read(&self, user_id: i64, ids: &[String]) -> AppResult<()> {
        for id in ids {
            sqlx::query("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id = ?")
                .bind(user_id)
                .bind(id)
                .execute(&self.pool)
                .await?;
        }
        Ok(())
    }

    pub async fn mark_chat_notifications_read(&self, user_id: i64, chat_id: &str) -> AppResult<()> {
        sqlx::query("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND chat_id = ?")
            .bind(user_id)
            .bind(chat_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn mark_project_notifications_read(
        &self,
        user_id: i64,
        project_id: &str,
    ) -> AppResult<()> {
        sqlx::query("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND project_id = ?")
            .bind(user_id)
            .bind(project_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn mark_all_notifications_read(&self, user_id: i64) -> AppResult<()> {
        sqlx::query("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0")
            .bind(user_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn clear_notifications(&self, user_id: i64) -> AppResult<()> {
        sqlx::query("DELETE FROM notifications WHERE user_id = ?")
            .bind(user_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn register_push_token(&self, token: &str, platform: &str) -> AppResult<()> {
        let created = now();
        sqlx::query(
            "INSERT INTO push_tokens (token, platform, created_at, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(token) DO UPDATE SET platform = excluded.platform, updated_at = excluded.updated_at",
        )
        .bind(token)
        .bind(platform)
        .bind(&created)
        .bind(&created)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_push_tokens(&self) -> AppResult<Vec<String>> {
        Ok(
            sqlx::query_scalar("SELECT token FROM push_tokens ORDER BY updated_at DESC")
                .fetch_all(&self.pool)
                .await?,
        )
    }

    pub async fn delete_push_token(&self, token: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM push_tokens WHERE token = ?")
            .bind(token)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
