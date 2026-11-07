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
        label: String::new(),
        provider: provider.into(),
        base_url: url,
        api_key: "fixture".into(),
        api_key_enc: String::new(),
        model: "chosen-model".into(),
        autocomplete_model: String::new(),
        max_tokens: 1024,
        temperature: 0.0,
        autocomplete: false,
        system_prompt: String::new(),
        image_providers: vec![],
        connection_label: String::new(),
    }
}

#[tokio::test]
async fn openai_responses_supports_reasoning_tools_and_stateless_continuation() {
    let output = json!([
        {"type":"reasoning","id":"rs_fixture","summary":[],"encrypted_content":"opaque-state"},
        {"type":"function_call","id":"fc_fixture","call_id":"call_fixture","name":"read_file","arguments":"{\"path\":\"main.rs\"}","status":"completed"}
    ]);
    let wire = Wire {
        seen: Arc::new(Mutex::new(vec![])),
        content_type: "text/event-stream",
        body: format!(
            "data: {}\n\n",
            json!({"type":"response.completed","response":{"status":"completed","output":output,"usage":{"input_tokens":100,"output_tokens":20,"input_tokens_details":{"cached_tokens":40},"output_tokens_details":{"reasoning_tokens":10}}}})
        ),
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let app = Router::new()
        .route("/v1/responses", post(endpoint))
        .with_state(wire.clone());
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("db")).await.unwrap();
    let ai = AiService::new(store, &dir.path().join("key")).unwrap();
    let config = config("openai", url);
    let tools = vec![
        json!({"type":"function","function":{"name":"read_file","description":"Read","parameters":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}}}),
    ];
    let first = ai
        .turn(
            &config,
            &[json!({"role":"user","content":"Read main.rs"})],
            &tools,
            Some("high"),
            |_| {},
        )
        .await
        .unwrap();
    assert_eq!(first.calls[0].id, "call_fixture");
    assert_eq!(first.usage.reasoning, 10);
    assert_eq!(first.usage.cached, 40);
    let messages = vec![
        json!({"role":"user","content":"Read main.rs"}),
        json!({"role":"assistant","content":"","response_model":"chosen-model","response_items":first.response_items}),
        json!({"role":"tool","tool_call_id":"call_fixture","content":"fn main() {}"}),
    ];
    ai.turn(&config, &messages, &tools, Some("high"), |_| {})
        .await
        .unwrap();
    let requests = wire.seen.lock().unwrap();
    assert_eq!(requests[0]["reasoning"]["effort"], "high");
    assert_eq!(requests[0]["tools"][0]["strict"], false);
    assert_eq!(requests[0]["store"], false);
    assert!(requests[1]["input"]
        .as_array()
        .unwrap()
        .iter()
        .any(|item| item["encrypted_content"] == "opaque-state"));
    assert!(requests[1]["input"]
        .as_array()
        .unwrap()
        .iter()
        .any(|item| item["type"] == "function_call_output" && item["call_id"] == "call_fixture"));
    drop(requests);
    task.abort();
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

#[tokio::test]
async fn output_limit_keeps_the_partial_result_instead_of_failing() {
    let wire = Wire {
        seen: Arc::new(Mutex::new(vec![])),
        content_type: "text/event-stream",
        body: concat!(
            "data: {\"id\":\"fixture\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"partial answer\"},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"fixture\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"length\"}],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":1024}}\n\n",
            "data: [DONE]\n\n"
        ).into(),
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let app = Router::new()
        .route("/v1/chat/completions", post(endpoint))
        .with_state(wire.clone());
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("db")).await.unwrap();
    let ai = AiService::new(store, &dir.path().join("key")).unwrap();
    let config = config("custom", url);
    let turn = ai
        .turn(
            &config,
            &[json!({"role":"user","content":"Answer briefly"})],
            &[],
            None,
            |_| {},
        )
        .await
        .unwrap();
    assert_eq!(turn.finish, "length");
    assert_eq!(turn.text, "partial answer");
    task.abort();
}
