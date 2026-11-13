use super::*;
use crate::features::notifications::repository::StoredNotification;

pub(super) async fn list_notifications(
    State(state): State<Arc<AppState>>,
    Extension(context): Extension<AuthContext>,
) -> AppResult<Json<Vec<StoredNotification>>> {
    Ok(Json(
        state.store.list_notifications(context.user.id, 200).await?,
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MarkNotificationsRequest {
    #[serde(default)]
    ids: Vec<String>,
    #[serde(default)]
    chat_id: String,
    #[serde(default)]
    project_id: String,
    #[serde(default)]
    all: bool,
}

pub(super) async fn mark_notifications_read(
    State(state): State<Arc<AppState>>,
    Extension(context): Extension<AuthContext>,
    Json(input): Json<MarkNotificationsRequest>,
) -> AppResult<Json<Value>> {
    let user = context.user.id;
    if input.all {
        state.store.mark_all_notifications_read(user).await?;
    } else if !input.chat_id.trim().is_empty() {
        state
            .store
            .mark_chat_notifications_read(user, input.chat_id.trim())
            .await?;
    } else if !input.project_id.trim().is_empty() {
        state
            .store
            .mark_project_notifications_read(user, input.project_id.trim())
            .await?;
    } else if !input.ids.is_empty() {
        state
            .store
            .mark_notifications_read(user, &input.ids)
            .await?;
    }
    Ok(Json(json!({ "ok": true })))
}

pub(super) async fn clear_notifications(
    State(state): State<Arc<AppState>>,
    Extension(context): Extension<AuthContext>,
) -> AppResult<Json<Value>> {
    state.store.clear_notifications(context.user.id).await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub(super) struct PushTokenRequest {
    token: String,
    #[serde(default)]
    platform: String,
}

pub(super) async fn register_push_token(
    State(state): State<Arc<AppState>>,
    Json(input): Json<PushTokenRequest>,
) -> AppResult<Json<Value>> {
    let token = input.token.trim();
    if token.is_empty() {
        return Err(AppError::BadRequest("token is required".into()));
    }
    let platform = if input.platform.trim().is_empty() {
        "android"
    } else {
        input.platform.trim()
    };
    state.push.register(token, platform).await?;
    Ok(Json(json!({ "status": "registered" })))
}

pub(super) async fn notification_stream(
    State(state): State<Arc<AppState>>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let mut receiver = state.notifications.subscribe();
    let stream = async_stream::stream! {
        yield Ok(Event::default().event("ready").data("{}"));
        let mut heartbeat = tokio::time::interval(Duration::from_secs(25));
        loop {
            tokio::select! {
                event = receiver.recv() => {
                    match event {
                        Ok(event) => {
                            yield Ok(Event::default().event("ai.done").json_data(event).unwrap_or_else(|_| Event::default().data("{}")));
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => break,
                    }
                }
                _ = heartbeat.tick() => {
                    yield Ok(Event::default().comment("keep-alive"));
                }
            }
        }
    };
    Sse::new(stream).keep_alive(KeepAlive::default())
}
