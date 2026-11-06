use super::*;

pub(super) async fn list_db_profiles(
    State(state): State<Arc<AppState>>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Vec<DbProfile>>> {
    Ok(Json(
        state
            .store
            .list_db_profiles(query.get("projectRoot").map(String::as_str).unwrap_or(""))
            .await?,
    ))
}

pub(super) async fn create_db_profile(
    State(state): State<Arc<AppState>>,
    Json(input): Json<ProfileInput>,
) -> AppResult<Response> {
    let profile = state.database.create(input).await?;
    state.publish_project_root(&profile.project_root, "databases", Some(profile.id.clone()));
    Ok((StatusCode::CREATED, Json(profile)).into_response())
}

pub(super) async fn delete_db_profile(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
) -> AppResult<Json<Value>> {
    let profile = state.store.db_profile(&profile_id).await.ok();
    state.database.delete(&profile_id).await?;
    if let Some(profile) = profile {
        state.publish_project_root(&profile.project_root, "databases", Some(profile_id));
    }
    Ok(Json(json!({ "ok": true })))
}

pub(super) async fn test_db_profile(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
) -> AppResult<Json<Value>> {
    state.database.test(&profile_id).await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct QueryRequest {
    sql: String,
    #[serde(default)]
    max_rows: usize,
}

pub(super) async fn query_db(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
    Json(input): Json<QueryRequest>,
) -> AppResult<Json<crate::database::QueryResult>> {
    let result = state
        .database
        .query(&profile_id, &input.sql, input.max_rows)
        .await?;
    if let Ok(profile) = state.store.db_profile(&profile_id).await {
        let kind = mutation_kind(&input.sql);
        if !kind.is_empty() {
            state.publish_project_root(&profile.project_root, kind, Some(profile_id.clone()));
        } else if result.columns.is_empty() {
            state.publish_project_root(
                &profile.project_root,
                "database.rows",
                Some(profile_id.clone()),
            );
        }
    }
    Ok(Json(result))
}

pub(super) async fn db_schema(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
) -> AppResult<Json<Vec<crate::database::SchemaTable>>> {
    Ok(Json(state.database.schema(&profile_id).await?))
}

pub(super) async fn insert_db_row(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
    Json(change): Json<RowChange>,
) -> AppResult<Json<Value>> {
    let affected: u64 = state.database.insert_row(&profile_id, change).await?;
    publish_db_rows(&state, &profile_id).await;
    Ok(Json(json!({ "rowsAffected": affected })))
}

pub(super) async fn update_db_row(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
    Json(change): Json<RowChange>,
) -> AppResult<Json<Value>> {
    let affected: u64 = state.database.update_row(&profile_id, change).await?;
    publish_db_rows(&state, &profile_id).await;
    Ok(Json(json!({ "rowsAffected": affected })))
}

pub(super) async fn delete_db_row(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
    Json(change): Json<RowChange>,
) -> AppResult<Json<Value>> {
    let affected: u64 = state.database.delete_row(&profile_id, change).await?;
    publish_db_rows(&state, &profile_id).await;
    Ok(Json(json!({ "rowsAffected": affected })))
}

pub(super) async fn publish_db_rows(state: &AppState, profile_id: &str) {
    if let Ok(profile) = state.store.db_profile(profile_id).await {
        state.publish_project_root(
            &profile.project_root,
            "database.rows",
            Some(profile_id.to_string()),
        );
    }
}

pub(super) fn mutation_kind(sql: &str) -> &'static str {
    let first = sql
        .trim()
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_uppercase();
    match first.as_str() {
        "CREATE" | "ALTER" | "DROP" | "TRUNCATE" | "RENAME" | "COMMENT" | "GRANT" | "REVOKE" => {
            "databases"
        }
        "INSERT" | "UPDATE" | "DELETE" | "REPLACE" | "MERGE" | "UPSERT" => "database.rows",
        _ => "",
    }
}
