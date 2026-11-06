use serde_json::json;
use toph_server::{
    features::integrations::mcp::{Server, Service},
    store::Store,
};

#[cfg(unix)]
#[tokio::test]
async fn stdio_mcp_is_initialized_once_reused_and_released() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("store.db")).await.unwrap();
    let service = Service::new(store, &dir.path().join("key")).unwrap();
    let script = r#"import sys,json,os
for line in sys.stdin:
    r=json.loads(line)
    if 'id' not in r: continue
    result={'protocolVersion':'2025-03-26','capabilities':{},'serverInfo':{'name':'test','version':'1'}} if r['method']=='initialize' else {'tools':[], 'pid':os.getpid(), 'token':os.environ.get('FIXTURE_TOKEN','')}
    print(json.dumps({'jsonrpc':'2.0','id':r['id'],'result':result}),flush=True)
"#;
    service
        .save(Server {
            id: String::new(),
            name: "fixture".into(),
            transport: "stdio".into(),
            url: String::new(),
            token: String::new(),
            env: std::collections::HashMap::from([(
                "FIXTURE_TOKEN".into(),
                "fixture-value".into(),
            )]),
            command: vec!["python3".into(), "-u".into(), "-c".into(), script.into()],
        })
        .await
        .unwrap();
    let listed = service.list().await.unwrap();
    let id = listed[0]["id"].as_str().unwrap();
    let first = service
        .call(dir.path(), id, "tools/list", json!({}))
        .await
        .unwrap();
    assert_eq!(first["token"], "fixture-value");
    let second = service
        .call(dir.path(), id, "tools/list", json!({}))
        .await
        .unwrap();
    assert_eq!(first["pid"], second["pid"]);
    let tested = service.test(id).await.unwrap();
    assert_eq!(tested["tools"], 0);
    let pid = first["pid"].as_i64().unwrap() as i32;
    service.stop().await;
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        while unsafe { libc::kill(pid, 0) } == 0 {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("MCP child survived connection shutdown");
}

#[tokio::test]
async fn streamable_http_reuses_the_negotiated_session() {
    use axum::{
        extract::State,
        http::{HeaderMap, StatusCode},
        response::{IntoResponse, Response},
        routing::post,
        Json, Router,
    };
    use serde_json::Value;
    use std::sync::{Arc, Mutex};
    type Calls = Arc<Mutex<Vec<(Value, HeaderMap)>>>;
    async fn handler(
        State(calls): State<Calls>,
        headers: HeaderMap,
        Json(body): Json<Value>,
    ) -> Response {
        calls.lock().unwrap().push((body.clone(), headers));
        if body["method"] == "notifications/initialized" {
            return StatusCode::ACCEPTED.into_response();
        }
        let result = if body["method"] == "initialize" {
            json!({"protocolVersion":"2025-03-26","capabilities":{},"serverInfo":{"name":"fixture","version":"1"}})
        } else {
            json!({"tools":[]})
        };
        (
            [("Mcp-Session-Id", "fixture-session")],
            Json(json!({"jsonrpc":"2.0","id":body["id"],"result":result})),
        )
            .into_response()
    }
    let calls: Calls = Arc::new(Mutex::new(vec![]));
    let app = Router::new()
        .route("/mcp", post(handler))
        .with_state(calls.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/mcp", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("db")).await.unwrap();
    let service = Service::new(store, &dir.path().join("key")).unwrap();
    service
        .save(Server {
            id: String::new(),
            name: "remote".into(),
            transport: "http".into(),
            url,
            command: vec![],
            token: "private-token".into(),
            env: std::collections::HashMap::new(),
        })
        .await
        .unwrap();
    let listed = service.list().await.unwrap();
    assert!(!listed.to_string().contains("private-token"));
    let id = listed[0]["id"].as_str().unwrap();
    service
        .call(dir.path(), id, "tools/list", json!({}))
        .await
        .unwrap();
    service
        .call(dir.path(), id, "tools/list", json!({}))
        .await
        .unwrap();
    let calls = calls.lock().unwrap();
    assert_eq!(calls.len(), 4);
    assert_eq!(calls[0].0["method"], "initialize");
    assert_eq!(calls[3].1["mcp-session-id"], "fixture-session");
    assert_eq!(calls[3].1["authorization"], "Bearer private-token");
    drop(calls);
    service.stop().await;
    task.abort();
}
