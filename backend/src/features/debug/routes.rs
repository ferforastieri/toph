use super::*;

pub(super) async fn get_debug_config(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> AppResult<Json<Value>> {
    let key = format!("debug:{project_id}");
    match state.store.setting(&key).await {
        Ok(raw) => Ok(Json(
            serde_json::from_str(&raw).unwrap_or_else(|_| json!({})),
        )),
        Err(_) => Ok(Json(json!({}))),
    }
}

pub(super) async fn save_debug_config(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(value): Json<Value>,
) -> AppResult<Json<Value>> {
    let raw = value.to_string();
    if raw.len() > 256 * 1024 {
        return Err(crate::errors::bad_request("debug config is too large"));
    }
    state
        .store
        .set_setting(&format!("debug:{project_id}"), &raw)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

pub(super) async fn start_debug(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<DebugStartInput>,
) -> AppResult<Json<crate::debug::DebugSessionInfo>> {
    let project = state.store.project(&project_id).await?;
    let session = state
        .debug
        .start(&project_id, FsPath::new(&project.root), input)
        .await?;
    Ok(Json(session.info()))
}

pub(super) async fn get_debug_session(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> Json<Value> {
    match state.debug.get(&project_id) {
        Some(session) => Json(json!({ "session": session.info() })),
        None => Json(json!({ "session": null })),
    }
}

pub(super) async fn stop_debug(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> Json<Value> {
    state.debug.stop(&project_id).await;
    Json(json!({ "ok": true }))
}

pub(super) async fn release_debug(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> Json<Value> {
    if let Some(session) = state.debug.get(&project_id) {
        session.resume().await;
    }
    Json(json!({ "ok": true }))
}

pub(super) async fn debug_ws(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    ws: WebSocketUpgrade,
) -> Response {
    let Some(session) = state.debug.get(&project_id) else {
        return AppError::NotFound.into_response();
    };
    session
        .clients
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    ws.on_upgrade(move |socket| async move {
        if session.language == "node" {
            crate::debug::proxy_node(session.clone(), socket).await;
        } else {
            crate::debug::proxy_python(session.clone(), socket).await;
        }
        session
            .clients
            .fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
        session.client_disconnected();
    })
}

#[derive(Debug, Deserialize)]
pub(super) struct DebugEvalInput {
    code: String,
}

pub(super) async fn debug_eval(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<DebugEvalInput>,
) -> AppResult<Json<Value>> {
    if input.code.len() > 20_000 {
        return Err(crate::errors::bad_request("code is too large"));
    }
    let project = state.store.project(&project_id).await?;
    let script = format!(
        "const __toph_result = (0, eval)({}); if (__toph_result !== undefined) console.log(__toph_result);",
        serde_json::to_string(&input.code).map_err(|error| crate::errors::internal(error.to_string()))?
    );
    let command = tokio::process::Command::new("node")
        .arg("-e")
        .arg(script)
        .current_dir(&project.root)
        .kill_on_drop(true)
        .output();
    let output = tokio::time::timeout(Duration::from_secs(10), command)
        .await
        .map_err(|_| crate::errors::bad_request("evaluation timed out"))??;
    Ok(Json(json!({
        "stdout": String::from_utf8_lossy(&output.stdout),
        "stderr": String::from_utf8_lossy(&output.stderr),
        "exitCode": output.status.code(),
    })))
}
