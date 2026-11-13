use super::*;
use crate::features::agents::models::RunInput;

pub(super) async fn engine_list() -> Json<Value> {
    Json(json!(crate::features::agents::engines::list()))
}

pub(super) async fn test_engine(Path(id): Path<String>) -> AppResult<Json<Value>> {
    Ok(Json(crate::features::agents::engines::test(&id).await?))
}

pub(super) async fn install_engine(Path(id): Path<String>) -> AppResult<Json<Value>> {
    Ok(Json(crate::features::agents::engines::install(&id).await?))
}

pub(super) async fn update_engine(Path(id): Path<String>) -> AppResult<Json<Value>> {
    Ok(Json(crate::features::agents::engines::update(&id).await?))
}

pub(super) async fn engine_limits(Path(id): Path<String>) -> AppResult<Json<Value>> {
    Ok(Json(crate::features::agents::engines::limits(&id).await?))
}

pub(super) async fn start_agent(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Extension(auth): Extension<AuthContext>,
    Json(input): Json<RunInput>,
) -> AppResult<Json<Value>> {
    Ok(Json(json!(
        state.agents.start(auth.user.id, &project, input).await?
    )))
}
pub(super) async fn agent_active_runs(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Extension(auth): Extension<AuthContext>,
) -> AppResult<Json<Value>> {
    state.store.project(&project).await?;
    Ok(Json(json!(
        state.agents.active_runs(auth.user.id, &project).await?
    )))
}
pub(super) async fn cancel_agent(
    State(state): State<Arc<AppState>>,
    Path((project, run)): Path<(String, String)>,
    Extension(auth): Extension<AuthContext>,
) -> AppResult<Json<Value>> {
    state.agents.cancel(auth.user.id, &project, &run).await?;
    Ok(Json(json!({"ok":true})))
}
pub(super) async fn cancel_project_agents(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Extension(auth): Extension<AuthContext>,
    Json(input): Json<Value>,
) -> AppResult<Json<Value>> {
    state
        .agents
        .cancel_project(Some(auth.user.id), &project, input["agentId"].as_str())
        .await?;
    Ok(Json(json!({"ok":true})))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SnapshotQuery {
    chat_id: String,
    before: Option<i64>,
}
pub(super) async fn agent_snapshot(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Extension(auth): Extension<AuthContext>,
    Query(query): Query<SnapshotQuery>,
) -> AppResult<Json<Value>> {
    Ok(Json(
        state
            .agents
            .snapshot(auth.user.id, &project, &query.chat_id, query.before)
            .await?,
    ))
}
#[derive(Deserialize)]
pub(super) struct SearchQuery {
    q: String,
}
pub(super) async fn agent_search(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Extension(auth): Extension<AuthContext>,
    Query(query): Query<SearchQuery>,
) -> AppResult<Json<Value>> {
    state.store.project(&project).await?;
    let text = query.q.trim();
    if text.is_empty() || text.chars().count() > 200 {
        return Ok(Json(json!([])));
    }
    Ok(Json(json!(
        state
            .agents
            .repository()
            .search_messages(auth.user.id, &project, text, 30)
            .await?
    )))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SessionQuery {
    agent_id: String,
    chat_id: String,
}
pub(super) async fn agent_sessions(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Extension(auth): Extension<AuthContext>,
    Query(query): Query<SessionQuery>,
) -> AppResult<Json<Value>> {
    Ok(Json(json!(
        state
            .agents
            .repository()
            .sessions(auth.user.id, &project, &query.agent_id, &query.chat_id)
            .await?
    )))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SessionSwitch {
    agent_id: String,
    session_id: Option<String>,
    chat_id: String,
}
pub(super) async fn switch_agent_session(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Extension(auth): Extension<AuthContext>,
    Json(input): Json<SessionSwitch>,
) -> AppResult<Json<Value>> {
    state
        .agents
        .repository()
        .switch_session(
            auth.user.id,
            &project,
            &input.agent_id,
            &input.chat_id,
            input.session_id.as_deref(),
        )
        .await?;
    Ok(Json(json!({"ok":true})))
}
pub(super) async fn delete_chat(
    State(state): State<Arc<AppState>>,
    Path((project, chat)): Path<(String, String)>,
    Extension(auth): Extension<AuthContext>,
) -> AppResult<Json<Value>> {
    state.store.project(&project).await?;
    state
        .agents
        .delete_chat(auth.user.id, &project, &chat)
        .await?;
    Ok(Json(json!({"ok":true})))
}
pub(super) async fn delete_toph(
    State(state): State<Arc<AppState>>,
    Path((project, toph)): Path<(String, String)>,
    Extension(auth): Extension<AuthContext>,
) -> AppResult<Json<Value>> {
    state.store.project(&project).await?;
    state
        .agents
        .delete_toph(auth.user.id, &project, &toph)
        .await?;
    Ok(Json(json!({"ok":true})))
}

pub(super) async fn approve_agent(
    State(state): State<Arc<AppState>>,
    Path((project, call)): Path<(String, String)>,
    Extension(auth): Extension<AuthContext>,
    Json(input): Json<Value>,
) -> AppResult<Json<Value>> {
    state
        .agents
        .approve(auth.user.id, &project, &call, input)
        .await?;
    Ok(Json(json!({"ok":true})))
}
pub(super) async fn agent_usage(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Extension(auth): Extension<AuthContext>,
    Query(query): Query<UsageQuery>,
) -> AppResult<Json<Value>> {
    Ok(Json(
        state
            .agents
            .repository()
            .usage(auth.user.id, &project, query.chat_id.as_deref())
            .await?,
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UsageQuery {
    chat_id: Option<String>,
}
pub(super) async fn agent_artifact(
    State(state): State<Arc<AppState>>,
    Path((project, id)): Path<(String, String)>,
    Extension(auth): Extension<AuthContext>,
) -> AppResult<Response> {
    let (mime, data) = state
        .agents
        .tools()
        .artifact_bytes(auth.user.id, &project, &id)
        .await?;
    Ok((
        [
            (header::CONTENT_TYPE, mime),
            (header::CACHE_CONTROL, "private, no-store".into()),
        ],
        data,
    )
        .into_response())
}
pub(super) async fn agent_events(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Extension(auth): Extension<AuthContext>,
) -> AppResult<impl IntoResponse> {
    state.store.project(&project).await?;
    let mut receiver = state.agents.subscribe();
    let stream = async_stream::stream! {
        yield Ok::<_,std::convert::Infallible>(Event::default().event("resync").data("{}"));
        loop{match receiver.recv().await{
            Ok(event) if event.user_id==auth.user.id&&event.project_id==project=>{
                if let Ok(event)=Event::default().event("agent").json_data(event){yield Ok(event);}
            },
            Ok(_)=>{},
            Err(broadcast::error::RecvError::Lagged(_))=>yield Ok(Event::default().event("resync").data("{}")),
            Err(broadcast::error::RecvError::Closed)=>break,
        }}
    };
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}
pub(super) async fn ai_connections(State(state): State<Arc<AppState>>) -> AppResult<Json<Value>> {
    Ok(Json(state.ai.public_connections().await?))
}
pub(super) async fn save_ai_connection(
    State(state): State<Arc<AppState>>,
    Json(input): Json<crate::features::providers::connections::ConnectionInput>,
) -> AppResult<Json<Value>> {
    state.ai.save_connection(input).await?;
    Ok(Json(json!({"ok":true})))
}
pub(super) async fn delete_ai_connection(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<Value>> {
    state.ai.delete_connection(&id).await?;
    Ok(Json(json!({"ok":true})))
}
pub(super) async fn mcp_servers(State(state): State<Arc<AppState>>) -> AppResult<Json<Value>> {
    Ok(Json(state.mcp.list().await?))
}
pub(super) async fn skills_list(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Extension(_auth): Extension<AuthContext>,
) -> AppResult<Json<Value>> {
    state.store.project(&project).await?;
    Ok(Json(json!(state.agents.skills().list(&project).await?)))
}
pub(super) async fn save_skill(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Extension(_auth): Extension<AuthContext>,
    Json(input): Json<crate::features::agents::skill_service::ManagedSkillInput>,
) -> AppResult<Json<Value>> {
    state.store.project(&project).await?;
    Ok(Json(json!(
        state.agents.skills().save(&project, input).await?
    )))
}
#[derive(Deserialize)]
pub(super) struct SkillDecision {
    approve: bool,
}
pub(super) async fn decide_skill(
    State(state): State<Arc<AppState>>,
    Path((project, skill)): Path<(String, String)>,
    Extension(_auth): Extension<AuthContext>,
    Json(input): Json<SkillDecision>,
) -> AppResult<Json<Value>> {
    state.store.project(&project).await?;
    Ok(Json(json!(
        state
            .agents
            .skills()
            .decide(&project, &skill, input.approve)
            .await?
    )))
}
#[derive(Deserialize)]
pub(super) struct SkillArchive {
    archived: bool,
}
pub(super) async fn archive_skill(
    State(state): State<Arc<AppState>>,
    Path((project, skill)): Path<(String, String)>,
    Extension(_auth): Extension<AuthContext>,
    Json(input): Json<SkillArchive>,
) -> AppResult<Json<Value>> {
    state.store.project(&project).await?;
    Ok(Json(json!(
        state
            .agents
            .skills()
            .archive(&project, &skill, input.archived)
            .await?
    )))
}
pub(super) async fn remove_skill(
    State(state): State<Arc<AppState>>,
    Path((project, skill)): Path<(String, String)>,
    Extension(_auth): Extension<AuthContext>,
) -> AppResult<Json<Value>> {
    state.store.project(&project).await?;
    state.agents.skills().remove(&project, &skill).await?;
    Ok(Json(json!({"ok":true})))
}
pub(super) async fn skill_versions(
    State(state): State<Arc<AppState>>,
    Path((project, skill)): Path<(String, String)>,
    Extension(_auth): Extension<AuthContext>,
) -> AppResult<Json<Value>> {
    state.store.project(&project).await?;
    Ok(Json(json!(
        state.agents.skills().versions(&project, &skill).await?
    )))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SkillRestore {
    version_id: i64,
}
pub(super) async fn restore_skill(
    State(state): State<Arc<AppState>>,
    Path((project, skill)): Path<(String, String)>,
    Extension(_auth): Extension<AuthContext>,
    Json(input): Json<SkillRestore>,
) -> AppResult<Json<Value>> {
    state.store.project(&project).await?;
    Ok(Json(json!(
        state
            .agents
            .skills()
            .restore(&project, &skill, input.version_id)
            .await?
    )))
}
pub(super) async fn local_skills(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Extension(_auth): Extension<AuthContext>,
) -> AppResult<Json<Value>> {
    let root = state.store.project(&project).await?.root;
    Ok(Json(json!(crate::features::agents::skills::local(
        std::path::Path::new(&root)
    ))))
}
pub(super) async fn suggested_skills(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Extension(_auth): Extension<AuthContext>,
) -> AppResult<Json<Value>> {
    state.store.project(&project).await?;
    Ok(Json(json!(
        crate::features::agents::skill_catalog::suggested_skills()
    )))
}
#[derive(Deserialize)]
pub(super) struct SkillLink {
    source: String,
    #[serde(default)]
    agents: Vec<String>,
}
pub(super) async fn link_skill(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Extension(_auth): Extension<AuthContext>,
    Json(input): Json<SkillLink>,
) -> AppResult<Json<Value>> {
    let root = state.store.project(&project).await?.root;
    Ok(Json(json!(
        state
            .agents
            .skills()
            .link(
                &project,
                std::path::Path::new(&root),
                &input.source,
                input.agents
            )
            .await?
    )))
}
pub(super) async fn save_mcp_server(
    State(state): State<Arc<AppState>>,
    Json(input): Json<crate::features::integrations::mcp::Server>,
) -> AppResult<Json<Value>> {
    let server = state.mcp.save(input).await?;
    Ok(Json(json!({"ok":true,"id":server.id})))
}
pub(super) async fn test_mcp_server(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<Value>> {
    Ok(Json(state.mcp.test(&id).await?))
}
pub(super) async fn delete_mcp_server(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<Value>> {
    state.mcp.delete(&id).await?;
    Ok(Json(json!({"ok":true})))
}
