use crate::errors::AppResult;
use crate::model::PetConfig;
use crate::platform::store::now;
use crate::platform::store::Store;

impl Store {
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
}
