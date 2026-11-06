use crate::errors::AppResult;
use crate::platform::store::now;
use crate::platform::store::Store;

impl Store {
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
