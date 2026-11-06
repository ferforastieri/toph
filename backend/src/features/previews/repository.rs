use crate::errors::AppError;
use crate::errors::AppResult;
use crate::model::WebTarget;
use crate::platform::store::now;
use crate::platform::store::Store;

impl Store {
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
}
