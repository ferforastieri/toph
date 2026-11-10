use super::*;

#[derive(Debug, Deserialize, Default)]
pub(super) struct CreateTerminalInput {
    #[serde(default)]
    shell: Option<String>,
}

pub(super) async fn create_terminal(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
    Json(input): Json<CreateTerminalInput>,
) -> AppResult<Response> {
    let project = state.store.project(&project_id).await?;
    let session = state.terminals.create(
        &project_id,
        FsPath::new(&project.root),
        input.shell.as_deref(),
    )?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": session.id, "projectId": project_id, "shell": session.shell })),
    )
        .into_response())
}

pub(super) async fn list_terminals(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> Json<Value> {
    Json(json!({ "terminals": state.terminals.list_project(&project_id) }))
}

pub(super) async fn terminal_shells() -> Json<Value> {
    Json(json!({ "shells": crate::terminal::available_shells() }))
}

pub(super) async fn close_terminal(
    State(state): State<Arc<AppState>>,
    Path(terminal_id): Path<String>,
) -> AppResult<Json<Value>> {
    let closed = state.terminals.close_session(&terminal_id);
    Ok(Json(json!({ "ok": true, "closed": closed })))
}

pub(super) async fn close_terminals(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> Json<Value> {
    let closed = state.terminals.close_project(&project_id);
    Json(json!({ "ok": true, "closed": closed }))
}

pub(super) async fn close_project(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<String>,
) -> AppResult<Json<Value>> {
    state.store.project(&project_id).await?;
    state.agents.cancel_project(None, &project_id, None).await?;
    let terminals = state.terminals.close_project(&project_id);
    let had_debug = state.debug.get(&project_id).is_some();
    state.debug.close_project(&project_id).await;
    // Closing a project ends its own terminals (their process groups are killed
    // on close) and its agent runs. It must not sweep the filesystem by working
    // directory: that killed processes from nested projects, from other open
    // projects and from tools the user was running outside Toph.
    Ok(Json(json!({
        "ok": true,
        "terminals": terminals,
        "debug": had_debug,
        "processes": [],
        "failed": [],
    })))
}

pub(super) async fn terminal_ws(
    State(state): State<Arc<AppState>>,
    Path(terminal_id): Path<String>,
    ws: WebSocketUpgrade,
) -> Response {
    let Some(session) = state.terminals.get(&terminal_id) else {
        return AppError::NotFound.into_response();
    };
    ws.on_upgrade(move |socket| terminal_socket(socket, session))
}

pub(super) async fn terminal_socket(
    mut socket: WebSocket,
    session: Arc<crate::terminal::TerminalSession>,
) {
    let Ok((initial, mut output, closed)) = session.subscribe() else {
        return;
    };
    if !initial.is_empty() && socket.send(Message::Binary(initial.into())).await.is_err() {
        return;
    }
    let mut heartbeat = tokio::time::interval(Duration::from_secs(2));
    let mut last_client = tokio::time::Instant::now();
    loop {
        tokio::select! {
            incoming = socket.recv() => {
                last_client = tokio::time::Instant::now();
                match incoming {
                    Some(Ok(Message::Binary(data))) => {
                        if session.write(&data).is_err() { break; }
                    }
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(value) = serde_json::from_str::<Value>(&text) {
                            match value.get("type").and_then(Value::as_str) {
                                Some("resize") => {
                                    let cols = value.get("cols").and_then(Value::as_u64).unwrap_or(0) as u16;
                                    let rows = value.get("rows").and_then(Value::as_u64).unwrap_or(0) as u16;
                                    let _ = session.resize(cols, rows);
                                }
                                // Liveness probe from the browser: a socket that
                                // goes silent (backgrounded tab, network switch)
                                // is detected client-side once pongs stop.
                                Some("ping") => {
                                    if socket.send(Message::Text(r#"{"type":"pong"}"#.into())).await.is_err() {
                                        break;
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
            data = output.recv() => {
                match data {
                    Ok(data) => {
                        if socket.send(Message::Binary(data.into())).await.is_err() { break; }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            _ = heartbeat.tick() => {
                if closed.load(std::sync::atomic::Ordering::SeqCst)
                    || last_client.elapsed() > Duration::from_secs(90)
                {
                    break;
                }
            }
        }
    }
}
