use std::path::Path;
use std::str::FromStr;
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Row, Sqlite, SqlitePool, Transaction};

use crate::errors::{AppError, AppResult};
use crate::model::{DbProfile, PetConfig, Project, Session, User, WebTarget};

#[derive(Clone)]
pub struct Store {
    pool: SqlitePool,
}

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

    pub async fn user_count(&self) -> AppResult<i64> {
        Ok(sqlx::query_scalar("SELECT COUNT(*) FROM users")
            .fetch_one(&self.pool)
            .await?)
    }

    pub async fn create_user(&self, username: &str, password_hash: &str) -> AppResult<User> {
        let created = now();
        let id =
            sqlx::query("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
                .bind(username)
                .bind(password_hash)
                .bind(&created)
                .execute(&self.pool)
                .await?
                .last_insert_rowid();
        Ok(User {
            id,
            username: username.to_string(),
            password_hash: password_hash.to_string(),
            created_at: created,
        })
    }

    pub async fn user_by_username(&self, username: &str) -> AppResult<User> {
        sqlx::query_as::<_, User>(
            "SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
        )
        .bind(username)
        .fetch_one(&self.pool)
        .await
        .map_err(map_not_found)
    }

    pub async fn create_session(
        &self,
        id: &str,
        user_id: i64,
        token_hash: &str,
        kind: &str,
        expires_at: DateTime<Utc>,
    ) -> AppResult<Session> {
        let created = now();
        let expiry = expires_at.to_rfc3339();
        sqlx::query(
            "INSERT INTO sessions (id, user_id, token_hash, kind, created_at, expires_at, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id)
        .bind(user_id)
        .bind(token_hash)
        .bind(kind)
        .bind(&created)
        .bind(&expiry)
        .bind(&created)
        .execute(&self.pool)
        .await?;
        Ok(Session {
            id: id.to_string(),
            user_id,
            kind: kind.to_string(),
            created_at: created.clone(),
            expires_at: expiry,
            last_seen_at: created,
        })
    }

    pub async fn session_by_token_hash(&self, token_hash: &str) -> AppResult<(Session, User)> {
        let row = sqlx::query(
            "SELECT s.id, s.user_id, s.kind, s.created_at, s.expires_at, s.last_seen_at,
                    u.id AS user_id_value, u.username, u.password_hash, u.created_at AS user_created_at
             FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ?",
        )
        .bind(token_hash)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(AppError::NotFound)?;

        let session = Session {
            id: row.try_get("id")?,
            user_id: row.try_get("user_id")?,
            kind: row.try_get("kind")?,
            created_at: row.try_get("created_at")?,
            expires_at: row.try_get("expires_at")?,
            last_seen_at: row.try_get("last_seen_at")?,
        };
        let expires = DateTime::parse_from_rfc3339(&session.expires_at)
            .map_err(|_| AppError::NotFound)?
            .with_timezone(&Utc);
        if Utc::now() > expires {
            return Err(AppError::NotFound);
        }
        let user = User {
            id: row.try_get("user_id_value")?,
            username: row.try_get("username")?,
            password_hash: row.try_get("password_hash")?,
            created_at: row.try_get("user_created_at")?,
        };
        Ok((session, user))
    }

    pub async fn touch_session(&self, session_id: &str) -> AppResult<()> {
        sqlx::query("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
            .bind(now())
            .bind(session_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_session(&self, session_id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM sessions WHERE id = ?")
            .bind(session_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_expired_sessions(&self) -> AppResult<()> {
        sqlx::query("DELETE FROM sessions WHERE expires_at < ?")
            .bind(now())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn list_projects(&self) -> AppResult<Vec<Project>> {
        Ok(sqlx::query_as::<_, Project>(
            "SELECT id, name, root, color, created_at, updated_at FROM projects ORDER BY name",
        )
        .fetch_all(&self.pool)
        .await?)
    }

    pub async fn project(&self, id: &str) -> AppResult<Project> {
        sqlx::query_as::<_, Project>(
            "SELECT id, name, root, color, created_at, updated_at FROM projects WHERE id = ?",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_not_found)
    }

    pub async fn project_by_root(&self, root: &str) -> AppResult<Project> {
        sqlx::query_as::<_, Project>(
            "SELECT id, name, root, color, created_at, updated_at FROM projects WHERE root = ?",
        )
        .bind(root)
        .fetch_one(&self.pool)
        .await
        .map_err(map_not_found)
    }

    pub async fn create_project(&self, project: Project) -> AppResult<Project> {
        let created = now();
        let result = sqlx::query(
            "INSERT INTO projects (id, name, root, color, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&project.id)
        .bind(&project.name)
        .bind(&project.root)
        .bind(&project.color)
        .bind(&created)
        .bind(&created)
        .execute(&self.pool)
        .await;
        match result {
            Ok(_) => Ok(Project {
                created_at: created.clone(),
                updated_at: created,
                ..project
            }),
            Err(error) if is_unique(&error) => Err(AppError::Conflict),
            Err(error) => Err(error.into()),
        }
    }

    pub async fn update_project(&self, project: Project) -> AppResult<Project> {
        let updated = now();
        let result = sqlx::query(
            "UPDATE projects SET name = ?, root = ?, color = ?, updated_at = ? WHERE id = ?",
        )
        .bind(&project.name)
        .bind(&project.root)
        .bind(&project.color)
        .bind(&updated)
        .bind(&project.id)
        .execute(&self.pool)
        .await;
        match result {
            Ok(result) if result.rows_affected() == 0 => Err(AppError::NotFound),
            Ok(_) => Ok(Project {
                updated_at: updated,
                ..project
            }),
            Err(error) if is_unique(&error) => Err(AppError::Conflict),
            Err(error) => Err(error.into()),
        }
    }

    pub async fn delete_project(&self, id: &str) -> AppResult<()> {
        let result = sqlx::query("DELETE FROM projects WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }
        Ok(())
    }

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

    pub async fn pet_config(&self, user_id: i64) -> AppResult<Option<PetConfig>> {
        Ok(sqlx::query_as::<_, PetConfig>(
            "SELECT chosen, enabled, kind, mode, commits FROM pet_configs WHERE user_id = ?",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?)
    }

    pub async fn save_pet_config(&self, user_id: i64, pet: &PetConfig) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO pet_configs (user_id, chosen, enabled, kind, mode, commits, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               chosen = excluded.chosen,
               enabled = excluded.enabled,
               kind = excluded.kind,
               mode = excluded.mode,
               commits = excluded.commits,
               updated_at = excluded.updated_at",
        )
        .bind(user_id)
        .bind(pet.chosen)
        .bind(pet.enabled)
        .bind(&pet.kind)
        .bind(&pet.mode)
        .bind(pet.commits)
        .bind(now())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_db_profiles(&self, project_root: &str) -> AppResult<Vec<DbProfile>> {
        let mut query = String::from(
            "SELECT id, name, folder, project_root, driver, dsn_encrypted, read_only, created_at, updated_at FROM db_profiles",
        );
        if !project_root.is_empty() {
            query.push_str(" WHERE project_root = ?");
        }
        query.push_str(" ORDER BY folder, name");
        let mut request = sqlx::query_as::<_, DbProfile>(&query);
        if !project_root.is_empty() {
            request = request.bind(project_root);
        }
        Ok(request.fetch_all(&self.pool).await?)
    }

    pub async fn db_profile(&self, id: &str) -> AppResult<DbProfile> {
        sqlx::query_as::<_, DbProfile>(
            "SELECT id, name, folder, project_root, driver, dsn_encrypted, read_only, created_at, updated_at FROM db_profiles WHERE id = ?",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_not_found)
    }

    pub async fn create_db_profile(&self, profile: DbProfile) -> AppResult<DbProfile> {
        let created = now();
        sqlx::query(
            "INSERT INTO db_profiles (id, name, folder, project_root, driver, dsn_encrypted, read_only, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&profile.id)
        .bind(&profile.name)
        .bind(&profile.folder)
        .bind(&profile.project_root)
        .bind(&profile.driver)
        .bind(&profile.dsn_encrypted)
        .bind(profile.read_only)
        .bind(&created)
        .bind(&created)
        .execute(&self.pool)
        .await?;
        Ok(DbProfile {
            created_at: created.clone(),
            updated_at: created,
            ..profile
        })
    }

    pub async fn delete_db_profile(&self, id: &str) -> AppResult<()> {
        let result = sqlx::query("DELETE FROM db_profiles WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }
        Ok(())
    }

    pub async fn list_web_targets(&self) -> AppResult<Vec<WebTarget>> {
        Ok(sqlx::query_as::<_, WebTarget>(
            "SELECT id, name, url, icon, created_at FROM web_targets ORDER BY name",
        )
        .fetch_all(&self.pool)
        .await?)
    }

    pub async fn create_web_target(&self, target: WebTarget) -> AppResult<WebTarget> {
        let created = now();
        sqlx::query(
            "INSERT INTO web_targets (id, name, url, icon, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&target.id)
        .bind(&target.name)
        .bind(&target.url)
        .bind(&target.icon)
        .bind(&created)
        .execute(&self.pool)
        .await?;
        Ok(WebTarget {
            created_at: created,
            ..target
        })
    }

    pub async fn delete_web_target(&self, id: &str) -> AppResult<()> {
        let result = sqlx::query("DELETE FROM web_targets WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }
        Ok(())
    }

    pub async fn setting(&self, key: &str) -> AppResult<String> {
        sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
            .bind(key)
            .fetch_one(&self.pool)
            .await
            .map_err(map_not_found)
    }

    pub async fn set_setting(&self, key: &str, value: &str) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .bind(key)
        .bind(value)
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

fn now() -> String {
    Utc::now().to_rfc3339()
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

fn map_not_found(error: sqlx::Error) -> AppError {
    match error {
        sqlx::Error::RowNotFound => AppError::NotFound,
        other => other.into(),
    }
}

fn is_unique(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .map(|error| error.is_unique_violation())
        .unwrap_or(false)
}
