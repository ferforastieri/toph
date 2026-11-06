use super::*;

pub(super) async fn update_status(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<UpdateStatus>> {
    Ok(Json(state.update.status().await?))
}

pub(super) async fn start_update(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<UpdateStart>> {
    Ok(Json(state.update.start().await?))
}
