use crate::errors::AppResult;
use crate::platform::store::map_not_found;
use crate::platform::store::Store;

impl Store {
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
}
