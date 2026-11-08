use std::net::SocketAddr;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use super::{models::RunContext, runtime::Runtime};

/// One gateway per run. The CLI receives a secret URL and is the only process
/// that knows it; the gateway refuses any tool that is not in this run's list.
#[derive(Clone)]
pub struct Gateway {
    runtime: Runtime,
    ctx: RunContext,
    token: String,
    tools: Vec<Value>,
    cancel: CancellationToken,
}

impl Gateway {
    pub async fn start(
        runtime: Runtime,
        ctx: RunContext,
        tools: Vec<Value>,
        cancel: CancellationToken,
    ) -> crate::errors::AppResult<(String, JoinHandle<()>)> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
        let port = listener.local_addr()?.port();
        let token = crate::crypto::new_id();
        let state = Self {
            runtime,
            ctx,
            token: token.clone(),
            tools,
            cancel,
        };
        let app = Router::new()
            .route("/mcp/{token}", post(handle))
            .with_state(state);
        let handle = tokio::spawn(async move {
            if let Err(error) = axum::serve(
                listener,
                app.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
            {
                tracing::warn!(%error, "agent gateway stopped");
            }
        });
        Ok((format!("http://127.0.0.1:{port}/mcp/{token}"), handle))
    }

    fn tool_allowed(&self, name: &str) -> bool {
        self.tools
            .iter()
            .any(|tool| tool["name"].as_str() == Some(name))
    }
}

async fn handle(
    State(state): State<Gateway>,
    Path(token): Path<String>,
    Json(body): Json<Value>,
) -> Response {
    if token != state.token {
        return StatusCode::NOT_FOUND.into_response();
    }
    let method = body["method"].as_str().unwrap_or("");
    tracing::debug!(method, "agent gateway request");
    let id = body.get("id").cloned().unwrap_or(Value::Null);
    let reply =
        |result: Value| Json(json!({"jsonrpc":"2.0","id":id,"result":result})).into_response();
    match body["method"].as_str().unwrap_or("") {
        "initialize" => {
            let protocol = body
                .pointer("/params/protocolVersion")
                .and_then(Value::as_str)
                .unwrap_or("2025-03-26");
            reply(json!({
                "protocolVersion": protocol,
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "toph", "version": env!("CARGO_PKG_VERSION") },
                "instructions": "Ferramentas do Toph. As ferramentas embutidas da CLI estão desligadas; use apenas estas."
            }))
        }
        "notifications/initialized" => StatusCode::ACCEPTED.into_response(),
        "ping" => reply(json!({})),
        "tools/list" => {
            let names = state
                .tools
                .iter()
                .filter_map(|tool| tool["name"].as_str())
                .collect::<Vec<_>>();
            tracing::debug!(?names, "gateway tools/list");
            reply(json!({ "tools": state.tools }))
        }
        "tools/call" => {
            let name = body
                .pointer("/params/name")
                .and_then(Value::as_str)
                .unwrap_or("");
            tracing::debug!(name, "gateway tools/call");
            if !state.tool_allowed(name) {
                return Json(json!({
                    "jsonrpc":"2.0","id":id,
                    "error": { "code": -32601, "message": format!("Ferramenta não permitida: {name}") }
                }))
                .into_response();
            }
            let args = body
                .pointer("/params/arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            let call_id = body
                .pointer("/params/_meta/toolCallId")
                .or_else(|| body.pointer("/params/toolCallId"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            match state
                .runtime
                .gateway_call(&state.ctx, &call_id, name, args, &state.cancel)
                .await
            {
                Ok(result) => reply(json!({
                    "content": [{ "type": "text", "text": result.to_string() }],
                    "isError": false
                })),
                Err(error) => reply(json!({
                    "content": [{ "type": "text", "text": error.to_string() }],
                    "isError": true
                })),
            }
        }
        other => Json(json!({
            "jsonrpc":"2.0","id":id,
            "error": { "code": -32601, "message": format!("Método não suportado: {other}") }
        }))
        .into_response(),
    }
}
