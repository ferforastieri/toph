use crate::errors::AppError;
use crate::errors::AppResult;
use crate::model::DbProfile;
use crate::platform::store::map_not_found;
use crate::platform::store::now;
use crate::platform::store::Store;

impl Store {
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
}
