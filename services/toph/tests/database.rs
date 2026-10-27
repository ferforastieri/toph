use std::collections::HashMap;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use toph_server::database::{DatabaseService, ProfileInput, RowChange};
use toph_server::store::Store;

#[tokio::test]
async fn sqlite_profiles_query_schema_and_edit_rows() {
    let dir = tempfile::tempdir().unwrap();
    let database_path = dir.path().join("app.sqlite");
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&database_path)
                .create_if_missing(true),
        )
        .await
        .unwrap();
    sqlx::query("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO items (name) VALUES ('alpha'), ('beta')")
        .execute(&pool)
        .await
        .unwrap();
    pool.close().await;

    let store = Store::open(&dir.path().join("toph.db")).await.unwrap();
    let service = DatabaseService::new(store.clone(), &dir.path().join("master.key")).unwrap();
    let profile = service
        .create(ProfileInput {
            name: "local".into(),
            folder: String::new(),
            project_root: String::new(),
            driver: "sqlite".into(),
            dsn: database_path.to_string_lossy().to_string(),
            read_only: false,
        })
        .await
        .unwrap();
    service.test(&profile.id).await.unwrap();

    let result = service
        .query(&profile.id, "SELECT id, name FROM items ORDER BY id", 10)
        .await
        .unwrap();
    assert_eq!(result.row_count, 2);
    assert_eq!(result.columns.len(), 2);

    let tables = service.schema(&profile.id).await.unwrap();
    let table = tables.iter().find(|table| table.name == "items").unwrap();
    assert!(table
        .columns
        .iter()
        .any(|column| column.name == "id" && column.primary));

    let inserted = service
        .insert_row(
            &profile.id,
            RowChange {
                schema: "main".into(),
                table: "items".into(),
                key: None,
                values: Some(HashMap::from([(
                    "name".to_string(),
                    serde_json::json!("gamma"),
                )])),
            },
        )
        .await
        .unwrap();
    assert_eq!(inserted, 1);

    let updated = service
        .update_row(
            &profile.id,
            RowChange {
                schema: "main".into(),
                table: "items".into(),
                key: Some(HashMap::from([("id".to_string(), serde_json::json!(1))])),
                values: Some(HashMap::from([(
                    "name".to_string(),
                    serde_json::json!("alpha2"),
                )])),
            },
        )
        .await
        .unwrap();
    assert_eq!(updated, 1);
}
