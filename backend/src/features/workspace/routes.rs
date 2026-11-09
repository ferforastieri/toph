use super::*;

pub(super) async fn tree(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Vec<crate::model::FileEntry>>> {
    let project = state.store.project(&project_id).await?;
    Ok(Json(state.workspace.list(
        FsPath::new(&project.root),
        query.get("path").map(String::as_str).unwrap_or(""),
    )?))
}

pub(super) async fn files(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    let files = state.workspace.files(
        FsPath::new(&project.root),
        query.get("q").map(String::as_str).unwrap_or(""),
        80,
    )?;
    Ok(Json(json!({ "files": files })))
}

pub(super) async fn read_file(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<crate::model::FileContent>> {
    let project = state.store.project(&project_id).await?;
    Ok(Json(state.workspace.read(
        FsPath::new(&project.root),
        query.get("path").map(String::as_str).unwrap_or(""),
    )?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WriteFileRequest {
    path: String,
    content: String,
    #[serde(default)]
    base_hash: String,
}

pub(super) async fn write_file(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<WriteFileRequest>,
) -> AppResult<Json<crate::model::FileContent>> {
    let project = state.store.project(&project_id).await?;
    let file = state.workspace.write(
        FsPath::new(&project.root),
        &input.path,
        &input.content,
        &input.base_hash,
    )?;
    state.events.publish(&project_id, "files", Some(input.path));
    Ok(Json(file))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct NewPathRequest {
    path: String,
}

pub(super) async fn make_dir(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<NewPathRequest>,
) -> AppResult<Response> {
    let project = state.store.project(&project_id).await?;
    state
        .workspace
        .create_dir(FsPath::new(&project.root), &input.path)?;
    state.events.publish(&project_id, "files", Some(input.path));
    Ok((StatusCode::CREATED, Json(json!({ "ok": true }))).into_response())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UploadFileRequest {
    path: String,
    data: String,
}

pub(super) async fn upload_file(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<UploadFileRequest>,
) -> AppResult<Response> {
    let project = state.store.project(&project_id).await?;
    let data = base64::engine::general_purpose::STANDARD
        .decode(input.data.as_bytes())
        .map_err(|_| AppError::BadRequest("invalid base64 file".into()))?;
    if data.len() > 32 * 1024 * 1024 {
        return Err(AppError::TooLarge);
    }
    let size = state
        .workspace
        .write_bytes(FsPath::new(&project.root), &input.path, &data)?;
    state.events.publish(&project_id, "files", Some(input.path));
    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "size": size })),
    )
        .into_response())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MovePathRequest {
    from: String,
    to: String,
}

pub(super) async fn move_path(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<MovePathRequest>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    state
        .workspace
        .move_path(FsPath::new(&project.root), &input.from, &input.to)?;
    state.events.publish(&project_id, "files", Some(input.to));
    Ok(Json(json!({ "ok": true })))
}

pub(super) async fn delete_path(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    let path = query.get("path").map(String::as_str).unwrap_or("");
    state.workspace.delete(FsPath::new(&project.root), path)?;
    state
        .events
        .publish(&project_id, "files", Some(path.to_string()));
    Ok(Json(json!({ "ok": true })))
}

pub(super) async fn raw_file(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Response> {
    let project = state.store.project(&project_id).await?;
    let path = query.get("path").map(String::as_str).unwrap_or("");
    let data = state
        .workspace
        .read_bytes(FsPath::new(&project.root), path)?;
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    Ok(Response::builder()
        .header(header::CONTENT_TYPE, mime.as_ref())
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(data))
        .map_err(|error| AppError::Internal(error.into()))?)
}

pub(super) async fn git_history(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    let path = query.get("path").map(String::as_str).unwrap_or("");
    let history = state
        .workspace
        .git_history(FsPath::new(&project.root), path)
        .await?;
    Ok(Json(json!({ "history": history })))
}

#[derive(Deserialize)]
pub(super) struct SearchRequest {
    query: String,
    limit: Option<usize>,
}

pub(super) async fn search(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<SearchRequest>,
) -> AppResult<Json<Vec<crate::model::SearchMatch>>> {
    let project = state.store.project(&project_id).await?;
    Ok(Json(
        state
            .workspace
            .search(
                FsPath::new(&project.root),
                &input.query,
                input.limit.unwrap_or(100),
            )
            .await?,
    ))
}

pub(super) async fn git_status(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    let status = state.workspace.git_status(FsPath::new(&project.root)).await;
    Ok(Json(json!({ "status": status })))
}

pub(super) async fn git_branches(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> AppResult<Json<crate::model::GitBranches>> {
    let project = state.store.project(&project_id).await?;
    Ok(Json(
        state
            .workspace
            .git_branches(FsPath::new(&project.root))
            .await?,
    ))
}

#[derive(Deserialize)]
pub(super) struct GitPathsRequest {
    paths: Vec<String>,
}

#[derive(Deserialize)]
pub(super) struct NameRequest {
    name: String,
}

pub(super) async fn git_stage(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<GitPathsRequest>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    state
        .workspace
        .git_stage(FsPath::new(&project.root), &input.paths)
        .await?;
    state.events.publish(&project_id, "git", None);
    Ok(Json(json!({ "ok": true })))
}

pub(super) async fn git_unstage(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<GitPathsRequest>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    state
        .workspace
        .git_unstage(FsPath::new(&project.root), &input.paths)
        .await?;
    state.events.publish(&project_id, "git", None);
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub(super) struct CommitRequest {
    message: String,
}

pub(super) async fn git_commit(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<CommitRequest>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    let output = state
        .workspace
        .git_commit(FsPath::new(&project.root), &input.message)
        .await?;
    state.events.publish(&project_id, "git", None);
    Ok(Json(json!({ "output": output })))
}

pub(super) async fn git_diff(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Value>> {
    let path = query
        .get("path")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("path is required".into()))?;
    let staged = query.get("staged").map(String::as_str) == Some("true");
    let project = state.store.project(&project_id).await?;
    let diff = state
        .workspace
        .git_diff(FsPath::new(&project.root), path, staged)
        .await?;
    Ok(Json(json!({ "diff": diff })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GitDiscardRequest {
    paths: Vec<String>,
    #[serde(default)]
    staged: bool,
}

pub(super) async fn git_discard(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<GitDiscardRequest>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    state
        .workspace
        .git_discard(FsPath::new(&project.root), &input.paths, input.staged)
        .await?;
    state.publish_git(&project_id, None);
    Ok(Json(json!({ "ok": true })))
}

pub(super) async fn git_checkout(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<NameRequest>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    state
        .workspace
        .git_checkout(FsPath::new(&project.root), &input.name)
        .await?;
    state.publish_git(&project_id, None);
    Ok(Json(json!({ "ok": true })))
}

pub(super) async fn git_delete_branches(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    let deleted = state
        .workspace
        .git_delete_other_branches(FsPath::new(&project.root))
        .await?;
    state.events.publish(&project_id, "git", None);
    Ok(Json(json!({ "deleted": deleted })))
}

pub(super) async fn git_create_branch(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<NameRequest>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    let name = state
        .workspace
        .git_create_branch(FsPath::new(&project.root), &input.name)
        .await?;
    state.events.publish(&project_id, "git", Some(name.clone()));
    Ok(Json(json!({ "name": name })))
}

pub(super) async fn git_file_versions(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Value>> {
    let path = query
        .get("path")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("path is required".into()))?;
    let staged = query.get("staged").map(String::as_str) == Some("true");
    let project = state.store.project(&project_id).await?;
    let (original, modified) = state
        .workspace
        .git_file_versions(FsPath::new(&project.root), path, staged)
        .await?;
    Ok(Json(json!({ "original": original, "modified": modified })))
}

pub(super) async fn git_blame(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Value>> {
    let path = query
        .get("path")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("path is required".into()))?;
    let project = state.store.project(&project_id).await?;
    let lines = state
        .workspace
        .git_blame(FsPath::new(&project.root), path)
        .await?;
    Ok(Json(json!({ "lines": lines })))
}

pub(super) async fn list_repos(
    State(state): State<Arc<AppState>>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Value>> {
    let workspace = state.workspace.clone();
    let search = query.get("q").cloned().unwrap_or_default();
    // Walking the workspace is synchronous; keep it off the async runtime so a
    // large repository tree cannot stall the rest of the API.
    let repos = tokio::task::spawn_blocking(move || workspace.find_repos(&search, 500))
        .await
        .map_err(|error| crate::errors::internal(error.to_string()))?;
    Ok(Json(json!({ "repos": repos })))
}

pub(super) async fn list_workspace_roots(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(
        json!({ "roots": state.workspace.roots().iter().map(|path| path.to_string_lossy().to_string()).collect::<Vec<_>>() }),
    )
}

#[derive(Deserialize)]
pub(super) struct WorkspaceRootRequest {
    path: String,
}

pub(super) async fn add_workspace_root(
    State(state): State<Arc<AppState>>,
    Json(input): Json<WorkspaceRootRequest>,
) -> AppResult<Json<Value>> {
    state
        .workspace
        .add_root(PathBuf::from(&input.path).as_path())?;
    persist_workspace_roots(&state).await?;
    Ok(list_workspace_roots(State(state)).await)
}

pub(super) async fn remove_workspace_root(
    State(state): State<Arc<AppState>>,
    Query(query): Query<HashMap<String, String>>,
) -> AppResult<Json<Value>> {
    let path = query
        .get("path")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("path is required".into()))?;
    state.workspace.remove_root(PathBuf::from(path).as_path())?;
    persist_workspace_roots(&state).await?;
    Ok(list_workspace_roots(State(state)).await)
}

pub(super) async fn persist_workspace_roots(state: &AppState) -> AppResult<()> {
    let roots: Vec<String> = state
        .workspace
        .roots()
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect();
    state
        .store
        .set_setting("workspace_roots", &serde_json::to_string(&roots)?)
        .await
}
