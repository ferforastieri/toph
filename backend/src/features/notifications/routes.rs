use super::*;

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

#[derive(Deserialize)]
pub(super) struct BotNotificationRequest {
    #[serde(rename = "notificationId", default)]
    notification_id: String,
    #[serde(rename = "projectId")]
    project_id: String,
    #[serde(rename = "botId")]
    bot_id: String,
    #[serde(rename = "botName", default)]
    bot_name: String,
    #[serde(rename = "botRole", default)]
    bot_role: String,
    #[serde(rename = "sessionId", default)]
    session_id: String,
    #[serde(rename = "chatId", default)]
    chat_id: String,
    #[serde(rename = "tabId", default)]
    tab_id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    body: String,
}

pub(super) async fn notify_bot(
    State(state): State<Arc<AppState>>,
    Extension(_context): Extension<AuthContext>,
    Json(input): Json<BotNotificationRequest>,
) -> AppResult<Json<Value>> {
    let project_id = input.project_id.trim();
    let bot_id = input.bot_id.trim();
    if project_id.is_empty() || bot_id.is_empty() {
        return Err(AppError::BadRequest(
            "projectId and botId are required".into(),
        ));
    }
    let project = state.store.project(project_id).await?;

    let bot_name = input.bot_name.trim();
    let title = if bot_name.is_empty() {
        let fallback = input.title.trim();
        if fallback.is_empty() {
            "Bot"
        } else {
            fallback
        }
    } else {
        bot_name
    };
    let raw_body = input.body.trim();
    let body = if raw_body.is_empty() {
        "O bot terminou de responder."
    } else {
        raw_body
    };
    let title: String = title.chars().take(120).collect();
    let body: String = body.chars().take(500).collect();
    let display_title = format!("{title} · {}", project.name);
    let notification_id = if input.notification_id.trim().is_empty() {
        new_id()
    } else {
        input.notification_id.trim().chars().take(100).collect()
    };
    let bot_role = input.bot_role.trim();
    let session_id = input.session_id.trim();
    let chat_id = input.chat_id.trim();
    let tab_id = if input.tab_id.trim().is_empty() {
        format!("bots:{project_id}")
    } else {
        input.tab_id.trim().to_string()
    };

    let event = NotificationEvent {
        event_type: "ai.done".into(),
        title: display_title.clone(),
        body: body.clone(),
        created_at: chrono::Utc::now().timestamp_millis(),
        notification_id: Some(notification_id.clone()),
        project_id: Some(project_id.to_string()),
        project_name: Some(project.name.clone()),
        chat_id: (!chat_id.is_empty()).then(|| chat_id.to_string()),
        bot_id: Some(bot_id.to_string()),
        bot_name: Some(title.clone()),
        bot_role: (!bot_role.is_empty()).then(|| bot_role.to_string()),
        session_id: (!session_id.is_empty()).then(|| session_id.to_string()),
        tab_id: Some(tab_id.clone()),
    };
    let _ = state.notifications.send(event);

    if state.push.enabled() {
        let message = PushMessage {
            title: display_title,
            body: body.clone(),
            data: vec![
                ("projectId".into(), project_id.to_string()),
                ("projectName".into(), project.name),
                ("chatId".into(), chat_id.to_string()),
                ("botId".into(), bot_id.to_string()),
                ("botName".into(), title),
                ("botRole".into(), bot_role.to_string()),
                ("sessionId".into(), session_id.to_string()),
                ("tabId".into(), tab_id),
                ("notificationId".into(), notification_id),
            ],
        };
        let push = state.push.clone();
        tokio::spawn(async move { push.notify(&message).await });
    }

    Ok(Json(json!({ "status": "sent" })))
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
