use super::*;

pub(super) async fn get_layout(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Extension(context): Extension<AuthContext>,
) -> AppResult<Response> {
    let layout = state
        .store
        .workspace_layout(context.user.id, &project_id)
        .await?;
    Ok((
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        layout,
    )
        .into_response())
}

pub(super) async fn save_layout(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Extension(context): Extension<AuthContext>,
    Json(layout): Json<Value>,
) -> AppResult<Json<Value>> {
    state
        .store
        .save_workspace_layout(context.user.id, &project_id, &layout.to_string())
        .await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WorkspaceMessagesQuery {
    mode: Option<String>,
    channel: Option<String>,
    scope: Option<String>,
    before_at: Option<i64>,
    before_channel: Option<String>,
    before_id: Option<String>,
    bot_id: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub(super) struct WorkspaceMessagesInput {
    messages: Vec<Value>,
    replace: Option<WorkspaceMessagesReplace>,
}

#[derive(Debug, Deserialize)]
pub(super) struct WorkspaceMessagesReplace {
    mode: String,
    channel: String,
}

pub(super) async fn get_workspace_messages(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Extension(context): Extension<AuthContext>,
    Query(query): Query<WorkspaceMessagesQuery>,
) -> AppResult<Json<Value>> {
    let mode = query
        .mode
        .as_deref()
        .filter(|mode| matches!(*mode, "chat"))
        .ok_or_else(|| AppError::BadRequest("mode must be chat".into()))?;
    let scope = query.scope.as_deref().unwrap_or("all");
    if !matches!(scope, "all" | "conversation" | "activity") {
        return Err(AppError::BadRequest(
            "scope must be all, conversation or activity".into(),
        ));
    }
    let before = match (query.before_at, query.before_channel, query.before_id) {
        (Some(created_at), Some(channel), Some(id)) if !id.is_empty() => {
            Some(WorkspaceMessageCursor {
                created_at,
                channel,
                id,
            })
        }
        (None, None, None) => None,
        _ => {
            return Err(AppError::BadRequest(
                "beforeAt, beforeChannel and beforeId must be provided together".into(),
            ))
        }
    };
    let page = state
        .store
        .workspace_messages(
            context.user.id,
            &project_id,
            mode,
            query.channel.as_deref(),
            scope,
            before.as_ref(),
            query.limit.unwrap_or(500),
        )
        .await?;
    Ok(Json(json!({
        "items": page.items,
        "hasMore": page.has_more,
        "nextCursor": page.next_cursor.map(|cursor| json!({
            "createdAt": cursor.created_at,
            "channel": cursor.channel,
            "id": cursor.id,
        })),
    })))
}

const INLINE_IMAGE_PREFIX: &str = "data:image/";

/// Moves base64 images embedded in a message out of the payload and into the
/// project, replacing them with a short project-relative path. This keeps
/// messages small in the database and in the browser, and makes the image load
/// from `/api/projects/{id}/raw` instead of a data URI.
pub(super) fn replace_inline_images(
    text: &str,
    workspace: &WorkspaceService,
    root: &FsPath,
) -> AppResult<String> {
    if !text.contains(INLINE_IMAGE_PREFIX) {
        return Ok(text.to_string());
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find(INLINE_IMAGE_PREFIX) {
        out.push_str(&rest[..start]);
        let candidate = &rest[start..];
        let Some(semicolon) = candidate.find(';') else {
            out.push_str(candidate);
            return Ok(out);
        };
        let mime = &candidate[INLINE_IMAGE_PREFIX.len()..semicolon];
        let Some(marker) = candidate[semicolon..].find("base64,") else {
            out.push_str(candidate);
            return Ok(out);
        };
        let data_start = semicolon + marker + "base64,".len();
        let data = &candidate[data_start..];
        let end = data
            .find(|ch: char| {
                !(ch.is_ascii_alphanumeric() || matches!(ch, '+' | '/' | '=' | '\r' | '\n'))
            })
            .unwrap_or(data.len());
        let encoded: String = data[..end]
            .chars()
            .filter(|ch| !matches!(ch, '\r' | '\n'))
            .collect();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded.as_bytes())
            .unwrap_or_default();
        if bytes.is_empty() || bytes.len() > 16 * 1024 * 1024 {
            out.push_str(&candidate[..data_start]);
            rest = data;
            continue;
        }
        let ext = mime
            .split('/')
            .nth(1)
            .unwrap_or("png")
            .split('+')
            .next()
            .unwrap_or("png");
        let ext = if ext == "jpeg" { "jpg" } else { ext };
        let hash = crate::crypto::sha256_hex(&bytes);
        let relative = format!("toph-generated/chat-{}.{}", &hash[..24], ext);
        if !root.join(&relative).exists() {
            workspace.write_bytes(root, &relative, &bytes)?;
        }
        out.push_str(&relative);
        rest = &data[end..];
    }
    out.push_str(rest);
    Ok(out)
}

pub(super) fn externalize_message_images(
    value: &mut Value,
    workspace: &WorkspaceService,
    root: &FsPath,
) -> AppResult<()> {
    match value {
        Value::String(text) => {
            if text.contains(INLINE_IMAGE_PREFIX) {
                *text = replace_inline_images(text, workspace, root)?;
            }
        }
        Value::Array(items) => {
            for item in items {
                externalize_message_images(item, workspace, root)?;
            }
        }
        Value::Object(map) => {
            for item in map.values_mut() {
                externalize_message_images(item, workspace, root)?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub(super) async fn migrate_inline_images(state: Arc<AppState>) {
    let Ok(rows) = state.store.inline_image_messages().await else {
        return;
    };
    let mut migrated = 0usize;
    for (user_id, project_id, channel, message_id, payload) in rows {
        let Ok(project) = state.store.project(&project_id).await else {
            continue;
        };
        let root = PathBuf::from(project.root);
        let Ok(mut value) = serde_json::from_str::<Value>(&payload) else {
            continue;
        };
        if externalize_message_images(&mut value, &state.workspace, &root).is_err() {
            continue;
        }
        let Ok(next) = serde_json::to_string(&value) else {
            continue;
        };
        if next != payload
            && state
                .store
                .update_message_payload(user_id, &project_id, &channel, &message_id, &next)
                .await
                .is_ok()
        {
            migrated += 1;
        }
    }
    if migrated > 0 {
        tracing::info!(migrated, "moved inline images from chat messages to files");
    }
}

pub(super) async fn save_workspace_messages(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Extension(context): Extension<AuthContext>,
    Json(input): Json<WorkspaceMessagesInput>,
) -> AppResult<Json<Value>> {
    let project = state.store.project(&project_id).await?;
    let root = PathBuf::from(&project.root);
    let mut messages = input.messages;
    for message in &mut messages {
        externalize_message_images(message, &state.workspace, &root)?;
    }
    if let Some(replace) = input.replace {
        if replace.mode != "chat" || replace.channel.is_empty() {
            return Err(AppError::BadRequest(
                "replace requires mode chat and a chatId".into(),
            ));
        }
        state
            .store
            .replace_workspace_messages(
                context.user.id,
                &project_id,
                &replace.mode,
                &replace.channel,
                messages,
            )
            .await?;
    } else {
        state
            .store
            .save_workspace_messages(context.user.id, &project_id, messages)
            .await?;
    }
    Ok(Json(json!({ "ok": true })))
}

pub(super) async fn delete_workspace_messages(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Extension(context): Extension<AuthContext>,
    Query(query): Query<WorkspaceMessagesQuery>,
) -> AppResult<Json<Value>> {
    if query.mode.is_none() && query.channel.is_none() && query.bot_id.is_none() {
        return Err(AppError::BadRequest(
            "mode, channel or botId is required".into(),
        ));
    }
    if query
        .mode
        .as_deref()
        .is_some_and(|mode| !matches!(mode, "chat"))
    {
        return Err(AppError::BadRequest("mode must be chat".into()));
    }
    let deleted = state
        .store
        .delete_workspace_messages(
            context.user.id,
            &project_id,
            query.mode.as_deref(),
            query.channel.as_deref(),
            query.bot_id.as_deref(),
        )
        .await?;
    Ok(Json(json!({ "ok": true, "deleted": deleted })))
}
