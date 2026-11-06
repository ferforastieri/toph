use super::*;

pub(super) async fn get_ai_config(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<crate::ai::PublicConfig>> {
    Ok(Json(state.ai.public().await?))
}

pub(super) async fn save_ai_config(
    State(state): State<Arc<AppState>>,
    Json(input): Json<crate::ai::AiConfigInput>,
) -> AppResult<Json<crate::ai::PublicConfig>> {
    let config = state.ai.save(input).await?;
    Ok(Json(config))
}

pub(super) async fn test_ai(State(state): State<Arc<AppState>>) -> AppResult<Json<Value>> {
    state.ai.test().await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub(super) struct ChatRequest {
    messages: Vec<AiMessage>,
    #[serde(default)]
    model: String,
    #[serde(default)]
    effort: String,
    #[serde(default)]
    yolo: bool,
    #[serde(default, rename = "projectId")]
    project_id: String,
    #[serde(default)]
    tools: Vec<String>,
}

pub(super) async fn chat_ai(
    State(state): State<Arc<AppState>>,
    Json(input): Json<ChatRequest>,
) -> AppResult<Json<Value>> {
    let _ = input.yolo;
    let image = if input.project_id.trim().is_empty() {
        None
    } else {
        let project = state.store.project(input.project_id.trim()).await?;
        Some(crate::ai::ImageTool {
            project_id: project.id,
            project_root: std::path::PathBuf::from(project.root),
        })
    };
    let text = state
        .ai
        .chat(
            input.messages,
            (!input.model.is_empty()).then_some(input.model.as_str()),
            (!input.effort.is_empty()).then_some(input.effort.as_str()),
            image,
            input.tools,
        )
        .await?;
    state.emit_ai_response();
    Ok(Json(json!({ "text": text })))
}

pub(super) async fn complete_ai(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CompleteInput>,
) -> AppResult<Json<Value>> {
    if input.prefix.len() > 12000 || input.suffix.len() > 4000 {
        return Err(AppError::TooLarge);
    }
    let completion = state.ai.complete(input).await?;
    Ok(Json(json!({ "completion": completion })))
}

pub(super) async fn ai_models(State(state): State<Arc<AppState>>) -> AppResult<Json<Value>> {
    Ok(Json(json!({ "models": state.ai.models().await? })))
}
