use axum::{extract::State, http::header, routing::post, Json, Router};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use toph_server::{
    ai::{AiConfig, AiService},
    store::Store,
};

#[derive(Clone)]
struct Wire {
    seen: Arc<Mutex<Vec<Value>>>,
    body: String,
    content_type: &'static str,
}
async fn endpoint(
    State(wire): State<Wire>,
    Json(body): Json<Value>,
) -> ([(header::HeaderName, &'static str); 1], String) {
    wire.seen.lock().unwrap().push(body);
    ([(header::CONTENT_TYPE, wire.content_type)], wire.body)
}
fn config(provider: &str, url: String) -> AiConfig {
    AiConfig {
        provider: provider.into(),
        base_url: url,
        api_key: "fixture".into(),
        api_key_enc: String::new(),
        model: "chosen-model".into(),
        autocomplete_model: String::new(),
        max_tokens: 1024,
        weekly_token_limit: 0,
        temperature: 0.0,
        autocomplete: false,
        system_prompt: String::new(),
        image_providers: vec![],
    }
}

#[tokio::test]
async fn anthropic_preserves_tool_pairs_and_cache_usage() {
    let events = vec![
        json!({"type":"message_start","message":{"usage":{"input_tokens":10,"cache_read_input_tokens":40}}}),
        json!({"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool-one","name":"search","input":{}}}),
        json!({"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"query\":\"rust\"}"}}),
        json!({"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":7}}),
        json!({"type":"message_stop"}),
    ];
    let wire = Wire {
        seen: Arc::new(Mutex::new(vec![])),
        body: events
            .iter()
            .map(|e| format!("data: {e}\n\n"))
            .collect::<String>(),
        content_type: "text/event-stream",
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let app = Router::new()
        .route("/v1/messages", post(endpoint))
        .with_state(wire.clone());
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("db")).await.unwrap();
    let ai = AiService::new(store, &dir.path().join("key")).unwrap();
    let messages = vec![
        json!({"role":"system","content":"Stable instructions"}),
        json!({"role":"user","content":"Read"}),
        json!({"role":"assistant","tool_calls":[{"id":"before","function":{"name":"read_file","arguments":"{\"path\":\"main.rs\"}"}}]}),
        json!({"role":"tool","tool_call_id":"before","content":"file content"}),
    ];
    let tools = vec![
        json!({"type":"function","function":{"name":"search","description":"Search","parameters":{"type":"object","properties":{"query":{"type":"string"}}}}}),
    ];
    let turn = ai
        .turn(&config("anthropic", url), &messages, &tools, None, |_| {})
        .await
        .unwrap();
    assert_eq!(turn.calls[0].id, "tool-one");
    assert_eq!(turn.calls[0].arguments, "{\"query\":\"rust\"}");
    assert_eq!(turn.usage.input, 50);
    assert_eq!(turn.usage.cached, 40);
    let requests = wire.seen.lock().unwrap();
    let body = &requests[0];
    assert_eq!(body["system"][0]["cache_control"]["type"], "ephemeral");
    assert_eq!(body["messages"][2]["content"][0]["tool_use_id"], "before");
    assert_eq!(body["tools"][0]["input_schema"]["type"], "object");
    drop(requests);
    task.abort();
}

#[tokio::test]
async fn ollama_uses_ndjson_and_native_tool_arguments() {
    let wire = Wire {
        seen: Arc::new(Mutex::new(vec![])),
        body: format!(
            "{}\n{}\n",
            json!({"message":{"role":"assistant","content":"Olá"},"done":false}),
            json!({"message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","prompt_eval_count":12,"eval_count":3})
        ),
        content_type: "application/x-ndjson",
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let app = Router::new()
        .route("/api/chat", post(endpoint))
        .with_state(wire.clone());
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("db")).await.unwrap();
    let ai = AiService::new(store, &dir.path().join("key")).unwrap();
    let messages = vec![
        json!({"role":"user","content":"Oi"}),
        json!({"role":"assistant","tool_calls":[{"id":"call","function":{"name":"read_file","arguments":"{\"path\":\"main.rs\"}"}}]}),
        json!({"role":"tool","name":"read_file","tool_call_id":"call","content":"source"}),
    ];
    let turn = ai
        .turn(&config("ollama", url), &messages, &[], None, |_| {})
        .await
        .unwrap();
    assert_eq!(turn.text, "Olá");
    assert_eq!(turn.usage.input, 12);
    assert_eq!(turn.usage.output, 3);
    let requests = wire.seen.lock().unwrap();
    assert_eq!(
        requests[0]["messages"][1]["tool_calls"][0]["function"]["arguments"]["path"],
        "main.rs"
    );
    assert_eq!(requests[0]["messages"][2]["tool_name"], "read_file");
    drop(requests);
    task.abort();
}
