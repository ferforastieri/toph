use crate::errors::AppError;
use crate::errors::AppResult;
use crate::model::Session;
use crate::model::User;
use crate::platform::store::map_not_found;
use crate::platform::store::now;
use crate::platform::store::Store;
use chrono::DateTime;
use chrono::Utc;

impl Store {
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

    pub async fn user_by_id(&self, id: i64) -> AppResult<User> {
        sqlx::query_as::<_, User>(
            "SELECT id, username, password_hash, created_at FROM users WHERE id = ?",
        )
        .bind(id)
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
}
use sqlx::Row;
