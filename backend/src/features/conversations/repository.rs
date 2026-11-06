use crate::errors::AppResult;
use crate::platform::store::now;
use crate::platform::store::Store;
use chrono::Utc;
use serde_json::json;
use serde_json::Value;
use sqlx::Row;
use sqlx::Sqlite;
use sqlx::Transaction;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceMessageCursor {
    pub created_at: i64,
    pub channel: String,
    pub id: String,
}

#[derive(Debug, Clone)]
pub struct WorkspaceMessagePage {
    pub items: Vec<Value>,
    pub has_more: bool,
    pub next_cursor: Option<WorkspaceMessageCursor>,
}

#[derive(Debug)]
struct StoredWorkspaceMessage {
    id: String,
    mode: String,
    channel: String,
    role: String,
    bot_id: Option<String>,
    created_at: i64,
    payload: String,
}

impl Store {
    pub async fn workspace_layout(&self, user_id: i64, project_id: &str) -> AppResult<String> {
        let row = sqlx::query("SELECT layout FROM workspaces WHERE user_id = ? AND project_id = ?")
            .bind(user_id)
            .bind(project_id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row
            .map(|row| row.get::<String, _>("layout"))
            .unwrap_or_else(|| "{}".into()))
    }

    pub async fn save_workspace_layout(
        &self,
        user_id: i64,
        project_id: &str,
        layout: &str,
    ) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO workspaces (user_id, project_id, layout, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id, project_id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at",
        )
        .bind(user_id)
        .bind(project_id)
        .bind(layout)
        .bind(now())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn save_workspace_messages(
        &self,
        user_id: i64,
        project_id: &str,
        messages: Vec<Value>,
    ) -> AppResult<()> {
        let mut records = Vec::with_capacity(messages.len());
        for message in messages {
            if let Some(record) = stored_workspace_message(message)? {
                records.push(record);
            }
        }
        let mut transaction = self.pool.begin().await?;
        upsert_workspace_messages(&mut transaction, user_id, project_id, records).await?;
        transaction.commit().await?;
        Ok(())
    }

    pub async fn replace_workspace_messages(
        &self,
        user_id: i64,
        project_id: &str,
        mode: &str,
        channel: &str,
        messages: Vec<Value>,
    ) -> AppResult<()> {
        let mut records = Vec::with_capacity(messages.len());
        for message in messages {
            if let Some(record) = stored_workspace_message(message)? {
                records.push(record);
            }
        }
        let mut transaction = self.pool.begin().await?;
        sqlx::query(
            "DELETE FROM bot_messages
             WHERE user_id = ? AND project_id = ? AND mode = ? AND channel = ?",
        )
        .bind(user_id)
        .bind(project_id)
        .bind(mode)
        .bind(channel)
        .execute(&mut *transaction)
        .await?;
        upsert_workspace_messages(&mut transaction, user_id, project_id, records).await?;
        transaction.commit().await?;
        Ok(())
    }

    pub async fn inline_image_messages(
        &self,
    ) -> AppResult<Vec<(i64, String, String, String, String)>> {
        let rows = sqlx::query_as::<_, (i64, String, String, String, String)>(
            "SELECT user_id, project_id, channel, message_id, payload
             FROM bot_messages
             WHERE mode = 'chat' AND payload LIKE '%data:image%'",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn update_message_payload(
        &self,
        user_id: i64,
        project_id: &str,
        channel: &str,
        message_id: &str,
        payload: &str,
    ) -> AppResult<()> {
        sqlx::query(
            "UPDATE bot_messages
             SET payload = ?, updated_at = ?
             WHERE user_id = ? AND project_id = ? AND mode = 'chat' AND channel = ? AND message_id = ?",
        )
        .bind(payload)
        .bind(now())
        .bind(user_id)
        .bind(project_id)
        .bind(channel)
        .bind(message_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn workspace_messages(
        &self,
        user_id: i64,
        project_id: &str,
        mode: &str,
        channel: Option<&str>,
        scope: &str,
        before: Option<&WorkspaceMessageCursor>,
        limit: usize,
    ) -> AppResult<WorkspaceMessagePage> {
        let limit = limit.clamp(1, 500);
        let before_at = before.map(|cursor| cursor.created_at);
        let before_channel = before.map(|cursor| cursor.channel.as_str());
        let before_id = before.map(|cursor| cursor.id.as_str());
        let channel_value = channel.filter(|value| !value.is_empty());
        let rows = sqlx::query(
            "SELECT message_id, channel, created_at, payload
             FROM bot_messages
             WHERE user_id = ? AND project_id = ? AND mode = ?
               AND (? IS NULL OR channel = ?)
               AND (
                 ? = 'all'
                 OR (? = 'conversation' AND role NOT IN ('tool', 'reasoning'))
                 OR (? = 'activity' AND role IN ('tool', 'reasoning'))
               )
               AND (
                 ? IS NULL
                 OR created_at < ?
                 OR (created_at = ? AND channel < ?)
                 OR (created_at = ? AND channel = ? AND message_id < ?)
               )
             ORDER BY created_at DESC, channel DESC, message_id DESC
             LIMIT ?",
        )
        .bind(user_id)
        .bind(project_id)
        .bind(mode)
        .bind(channel_value)
        .bind(channel_value)
        .bind(scope)
        .bind(scope)
        .bind(scope)
        .bind(before_at)
        .bind(before_at)
        .bind(before_at)
        .bind(before_channel)
        .bind(before_at)
        .bind(before_channel)
        .bind(before_id)
        .bind((limit + 1) as i64)
        .fetch_all(&self.pool)
        .await?;

        let has_more = rows.len() > limit;
        let mut rows = rows.into_iter().take(limit).collect::<Vec<_>>();
        let next_cursor = if has_more {
            rows.last().map(|row| WorkspaceMessageCursor {
                created_at: row.get("created_at"),
                channel: row.get("channel"),
                id: row.get("message_id"),
            })
        } else {
            None
        };
        rows.reverse();
        let items = rows
            .into_iter()
            .map(|row| serde_json::from_str::<Value>(&row.get::<String, _>("payload")))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(WorkspaceMessagePage {
            items,
            has_more,
            next_cursor,
        })
    }

    pub async fn delete_workspace_messages(
        &self,
        user_id: i64,
        project_id: &str,
        mode: Option<&str>,
        channel: Option<&str>,
        bot_id: Option<&str>,
    ) -> AppResult<u64> {
        let result = sqlx::query(
            "DELETE FROM bot_messages
             WHERE user_id = ? AND project_id = ?
               AND (? IS NULL OR mode = ?)
               AND (? IS NULL OR channel = ?)
               AND (? IS NULL OR bot_id = ?)",
        )
        .bind(user_id)
        .bind(project_id)
        .bind(mode)
        .bind(mode)
        .bind(channel)
        .bind(channel)
        .bind(bot_id)
        .bind(bot_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected())
    }
}

fn stored_workspace_message(mut message: Value) -> AppResult<Option<StoredWorkspaceMessage>> {
    let Some(object) = message.as_object_mut() else {
        return Ok(None);
    };
    if object.get("pending").and_then(Value::as_bool) == Some(true) {
        return Ok(None);
    }
    let Some(id) = object
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
    else {
        return Ok(None);
    };
    let Some(chat_id) = object
        .get("chatId")
        .and_then(Value::as_str)
        .filter(|chat_id| !chat_id.is_empty())
        .map(str::to_string)
    else {
        return Ok(None);
    };
    let role = object
        .get("role")
        .and_then(Value::as_str)
        .unwrap_or("system")
        .to_string();
    let bot_id = object
        .get("tophId")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .map(str::to_string);
    let created_at = object
        .get("createdAt")
        .and_then(Value::as_i64)
        .unwrap_or_else(|| Utc::now().timestamp_millis());
    object.insert("chatId".into(), Value::String(chat_id.clone()));
    object.insert("createdAt".into(), json!(created_at));
    // Guard the database and older clients against multi-megabyte tool
    // payloads (inline base64 images, huge command output).
    const MAX_MESSAGE_TEXT: usize = 200_000;
    for key in ["content", "detail"] {
        if let Some(Value::String(text)) = object.get_mut(key) {
            if text.len() > MAX_MESSAGE_TEXT {
                let mut end = MAX_MESSAGE_TEXT;
                while !text.is_char_boundary(end) {
                    end -= 1;
                }
                let removed = text.len() - end;
                text.truncate(end);
                text.push_str(&format!("\n… ({removed} caracteres omitidos)"));
            }
        }
    }
    Ok(Some(StoredWorkspaceMessage {
        id,
        mode: "chat".into(),
        channel: chat_id,
        role,
        bot_id,
        created_at,
        payload: serde_json::to_string(&message)?,
    }))
}

async fn upsert_workspace_messages(
    transaction: &mut Transaction<'_, Sqlite>,
    user_id: i64,
    project_id: &str,
    messages: Vec<StoredWorkspaceMessage>,
) -> AppResult<()> {
    for message in messages {
        sqlx::query(
            "INSERT INTO bot_messages (
               user_id, project_id, message_id, mode, channel, role, bot_id, created_at, payload, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, project_id, mode, channel, message_id) DO UPDATE SET
               mode = excluded.mode,
               channel = excluded.channel,
               role = excluded.role,
               bot_id = excluded.bot_id,
               created_at = excluded.created_at,
               payload = excluded.payload,
               updated_at = excluded.updated_at",
        )
        .bind(user_id)
        .bind(project_id)
        .bind(message.id)
        .bind(message.mode)
        .bind(message.channel)
        .bind(message.role)
        .bind(message.bot_id)
        .bind(message.created_at)
        .bind(message.payload)
        .bind(now())
        .execute(&mut **transaction)
        .await?;
    }
    Ok(())
}
