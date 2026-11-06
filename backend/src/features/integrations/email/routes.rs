use super::*;

pub(super) async fn list_email_accounts(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<PublicAccount>>> {
    Ok(Json(state.email.list().await?))
}

pub(super) async fn create_email_account(
    State(state): State<Arc<AppState>>,
    Json(input): Json<AccountInput>,
) -> AppResult<Response> {
    let account = state.email.create(input).await?;
    Ok((StatusCode::CREATED, Json(account)).into_response())
}

pub(super) async fn delete_email_account(
    State(state): State<Arc<AppState>>,
    Path(account_id): Path<String>,
) -> AppResult<Json<Value>> {
    state.email.delete(&account_id).await?;
    Ok(Json(json!({ "ok": true })))
}

pub(super) async fn test_email_account(
    State(state): State<Arc<AppState>>,
    Path(account_id): Path<String>,
) -> AppResult<Json<Value>> {
    Ok(Json(state.email.test(&account_id).await?))
}

pub(super) async fn list_email_messages(
    State(state): State<Arc<AppState>>,
    Path(account_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Vec<Value>>> {
    let limit = query
        .get("limit")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(DEFAULT_LIST_LIMIT);
    Ok(Json(state.email.messages(&account_id, limit).await?))
}

pub(super) async fn get_email_message(
    State(state): State<Arc<AppState>>,
    Path((account_id, uid)): Path<(String, String)>,
) -> AppResult<Json<Value>> {
    Ok(Json(state.email.message(&account_id, &uid).await?))
}

pub(super) async fn delete_email_message(
    State(state): State<Arc<AppState>>,
    Path((account_id, uid)): Path<(String, String)>,
) -> AppResult<Json<Value>> {
    Ok(Json(state.email.delete_message(&account_id, &uid).await?))
}

pub(super) async fn send_email(
    State(state): State<Arc<AppState>>,
    Path(account_id): Path<String>,
    Json(input): Json<SendInput>,
) -> AppResult<Json<Value>> {
    Ok(Json(state.email.send(&account_id, input).await?))
}
