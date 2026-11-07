use axum::{
    extract::State,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::Duration,
};
use toph_server::{config::Config, server::EmbeddedServer, store::Store};

enum Reply {
    Answer(&'static str),
    Tool(&'static str, Value),
    EmptyLength,
    Error,
    Wait(Arc<tokio::sync::Notify>),
}
#[derive(Clone)]
struct Mock {
    replies: Arc<Mutex<VecDeque<Reply>>>,
    requests: Arc<Mutex<Vec<Value>>>,
    plan_kind: &'static str,
}
const PLAN_CONVERSATION: &str =
    "{\"kind\":\"conversation\",\"goal\":\"Responder\",\"acceptance\":[],\"steps\":[]}";
const PLAN_INVESTIGATION: &str = "{\"kind\":\"investigation\",\"goal\":\"Investigar\",\"acceptance\":[\"evidência concreta\"],\"steps\":[\"usar ferramentas\"]}";
const PLAN_CHANGE: &str = "{\"kind\":\"change\",\"goal\":\"Alterar\",\"acceptance\":[\"alteração verificada\"],\"steps\":[\"editar\",\"verificar\"]}";
async fn model(State(mock): State<Mock>, Json(body): Json<Value>) -> Response {
    let first = body["messages"][0]["content"].as_str().unwrap_or("");
    let planner = first.starts_with("You are the planning component");
    let summary = first.starts_with("Summarize this history");
    if !planner {
        mock.requests.lock().unwrap().push(body.clone());
    }
    let reply = if planner {
        Some(Reply::Answer(match mock.plan_kind {
            "investigation" => PLAN_INVESTIGATION,
            "change" => PLAN_CHANGE,
            _ => PLAN_CONVERSATION,
        }))
    } else if summary {
        Some(Reply::Answer("Objetivo preservado. Arquivos: input.txt. Decisão: manter SQLite. Consulte search_history para fontes."))
    } else {
        mock.replies.lock().unwrap().pop_front()
    };
    let (delta, finish, completion, reasoning) = match reply {
        Some(Reply::Answer(text)) => (json!({"content":text}), "stop", 20, 0),
        Some(Reply::Tool(name, args)) => (
            json!({"tool_calls":[{"index":0,"id":format!("call-{}",mock.requests.lock().unwrap().len()),"type":"function","function":{"name":name,"arguments":args.to_string()}}]}),
            "tool_calls",
            20,
            0,
        ),
        Some(Reply::EmptyLength) => (json!({"content":""}), "length", 4096, 4096),
        Some(Reply::Wait(gate)) => {
            gate.notified().await;
            (json!({"content":"Finished"}), "stop", 20, 0)
        }
        _ => return (StatusCode::SERVICE_UNAVAILABLE, "explicit provider failure").into_response(),
    };
    let first = json!({"choices":[{"delta":delta,"finish_reason":finish}],"usage":{"prompt_tokens":100,"completion_tokens":completion,"completion_tokens_details":{"reasoning_tokens":reasoning},"prompt_tokens_details":{"cached_tokens":40}}});
    (
        [(header::CONTENT_TYPE, "text/event-stream")],
        format!("data: {first}\n\ndata: [DONE]\n\n"),
    )
        .into_response()
}

struct Fixture {
    dir: tempfile::TempDir,
    server: Option<EmbeddedServer>,
    model_task: tokio::task::JoinHandle<()>,
    client: reqwest::Client,
    base: String,
    project: String,
    csrf: String,
    mock: Mock,
    store: Store,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        if let Some(server) = self.server.take() {
            server.shutdown();
        }
        self.model_task.abort();
    }
}
impl Fixture {
    async fn new(replies: Vec<Reply>) -> Self {
        Self::new_with_plan(replies, "investigation").await
    }

    async fn new_with_plan(replies: Vec<Reply>, plan_kind: &'static str) -> Self {
        let dir = tempfile::tempdir().unwrap();
        let workspace = dir.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::write(
            workspace.join("input.txt"),
            "Olá, runtime nativo.\nSQLite é a decisão do projeto.\n",
        )
        .unwrap();
        let mock = Mock {
            replies: Arc::new(Mutex::new(replies.into())),
            requests: Arc::new(Mutex::new(vec![])),
            plan_kind,
        };
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let model_url = format!("http://{}", listener.local_addr().unwrap());
        let app = Router::new()
            .route("/v1/chat/completions", post(model))
            .with_state(mock.clone());
        let model_task = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let mut config = Config::local(
            dir.path().join("data"),
            workspace,
            "secret".into(),
            "127.0.0.1:0".into(),
        );
        config.firebase_file = None;
        let server = toph_server::start_embedded(config).await.unwrap();
        let base = format!("http://{}", server.addr);
        let client = reqwest::Client::builder()
            .cookie_store(true)
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap();
        let login: Value = client
            .post(format!("{base}/api/auth/login"))
            .json(&json!({"username":"admin","password":"secret","kind":"web"}))
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
            .json()
            .await
            .unwrap();
        let csrf = login["csrfToken"].as_str().unwrap().to_owned();
        let projects: Value = client
            .get(format!("{base}/api/projects"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let project = projects[0]["id"].as_str().unwrap().to_owned();
        let response=client.put(format!("{base}/api/ai/config")).header("X-Toph-CSRF",&csrf).json(&json!({"provider":"custom","baseUrl":model_url,"apiKey":"fixture-key","model":"fixture-model","autocompleteModel":"","maxTokens":4096,"temperature":0,"autocomplete":false,"systemPrompt":"","imageProviders":[]})).send().await.unwrap();
        assert!(
            response.status().is_success(),
            "{}",
            response.text().await.unwrap()
        );
        let store = Store::open(&dir.path().join("data/toph.db")).await.unwrap();
        Self {
            dir,
            server: Some(server),
            model_task,
            client,
            base,
            project,
            csrf,
            mock,
            store,
        }
    }
    fn agent(id: &str, permission: &str) -> Value {
        json!({"id":id,"chatId":"chat","name":id,"handle":id,"prompt":"Execute the task accurately.","model":"default::fixture-model","agentMode":"build","permissionMode":permission,"tools":["delegate"],"coordinator":id=="toph"})
    }
    async fn start(&self, request: &str, agents: Vec<Value>, text: &str) -> Value {
        self.post("/runs",json!({"requestId":request,"chatId":"chat","agentId":"toph","agents":agents,"text":text})).await
    }
    async fn post(&self, path: &str, body: Value) -> Value {
        let response = self
            .client
            .post(format!(
                "{}/api/projects/{}/agent{path}",
                self.base, self.project
            ))
            .header("X-Toph-CSRF", &self.csrf)
            .json(&body)
            .send()
            .await
            .unwrap();
        let status = response.status();
        let text = response.text().await.unwrap();
        assert!(status.is_success(), "{status}: {text}");
        serde_json::from_str(&text).unwrap()
    }
    async fn snapshot(&self) -> Value {
        self.client
            .get(format!(
                "{}/api/projects/{}/agent/snapshot?chatId=chat",
                self.base, self.project
            ))
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
            .json()
            .await
            .unwrap()
    }
    async fn wait(&self, id: &str, state: &str) -> Value {
        tokio::time::timeout(Duration::from_secs(15), async {
            loop {
                let snapshot = self.snapshot().await;
                let run = snapshot["runs"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|r| r["id"] == id)
                    .cloned();
                if let Some(run) = run {
                    if run["state"] == state {
                        return snapshot;
                    }
                    if ["failed", "cancelled", "interrupted"]
                        .contains(&run["state"].as_str().unwrap_or(""))
                    {
                        panic!("Unexpected run state: {run}");
                    }
                }
                tokio::time::sleep(Duration::from_millis(15)).await;
            }
        })
        .await
        .expect("run did not reach the expected state")
    }
}

#[tokio::test]
async fn native_run_uses_tools_persists_usage_and_is_idempotent() {
    let fixture = Fixture::new(vec![
        Reply::Tool(
            "read_file",
            json!({"path":"input.txt","offset":1,"limit":2}),
        ),
        Reply::Answer("Li o arquivo e confirmei SQLite."),
    ])
    .await;
    let agents = vec![Fixture::agent("toph", "yolo")];
    let run = fixture
        .start("request-1", agents.clone(), "Leia input.txt")
        .await;
    // Closing an event consumer does not own/cancel the server-side run.
    let stream = fixture
        .client
        .get(format!(
            "{}/api/projects/{}/agent/events",
            fixture.base, fixture.project
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(stream.headers()[header::CONTENT_TYPE], "text/event-stream");
    drop(stream);
    let snapshot = fixture.wait(run["id"].as_str().unwrap(), "completed").await;
    assert!(snapshot["messages"]
        .as_array()
        .unwrap()
        .iter()
        .any(|m| m["role"] == "tool" && m["content"].as_str().unwrap().contains("SQLite")));
    let duplicate = fixture.start("request-1", agents, "Leia input.txt").await;
    assert_eq!(duplicate["id"], run["id"]);
    let requests = fixture.mock.requests.lock().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(
        requests[1]["messages"].as_array().unwrap().last().unwrap()["role"],
        "tool"
    );
    drop(requests);
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM agent_model_calls WHERE (finish='stop' OR finish='tool_calls') AND kind<>'plan'",
    )
    .fetch_one(fixture.store.pool())
    .await
    .unwrap();
    assert_eq!(count, 2);
    let tokens: i64 = sqlx::query_scalar(
        "SELECT sum(input_tokens+output_tokens) FROM agent_model_calls WHERE kind<>'plan'",
    )
    .fetch_one(fixture.store.pool())
    .await
    .unwrap();
    assert_eq!(tokens, 240);
}

#[tokio::test]
async fn approval_rejection_prevents_file_mutation() {
    let fixture = Fixture::new(vec![
        Reply::Tool(
            "write_file",
            json!({"path":"created.txt","content":"should not exist"}),
        ),
        Reply::Answer("A alteração foi recusada."),
    ])
    .await;
    let run = fixture
        .start(
            "approval",
            vec![Fixture::agent("toph", "ask")],
            "Crie um arquivo",
        )
        .await;
    let waiting = fixture.wait(run["id"].as_str().unwrap(), "waiting").await;
    let id = waiting["approvals"][0]["id"].as_str().unwrap();
    fixture
        .post(&format!("/approvals/{id}"), json!({"approved":false}))
        .await;
    fixture.wait(run["id"].as_str().unwrap(), "completed").await;
    assert!(!fixture.dir.path().join("workspace/created.txt").exists());
}

#[tokio::test]
async fn provider_errors_do_not_switch_models_or_retry() {
    let fixture = Fixture::new(vec![Reply::Error]).await;
    let run = fixture
        .start("failure", vec![Fixture::agent("toph", "yolo")], "Responda")
        .await;
    let snapshot = fixture.wait(run["id"].as_str().unwrap(), "failed").await;
    assert!(snapshot["runs"][0]["error"]
        .as_str()
        .unwrap()
        .contains("503"));
    let calls = fixture.mock.requests.lock().unwrap();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0]["model"], "fixture-model");
}

#[tokio::test]
async fn cancellation_releases_a_pending_model_request() {
    let fixture = Fixture::new(vec![Reply::Wait(Arc::new(tokio::sync::Notify::new()))]).await;
    let run = fixture
        .start("cancel", vec![Fixture::agent("toph", "yolo")], "Espere")
        .await;
    let id = run["id"].as_str().unwrap();
    fixture.wait(id, "running").await;
    tokio::time::timeout(Duration::from_secs(5), async {
        while fixture.mock.requests.lock().unwrap().is_empty() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    fixture.post(&format!("/runs/{id}/cancel"), json!({})).await;
    fixture.wait(id, "cancelled").await;
    let active: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM agent_runs WHERE state IN ('queued','running','waiting')",
    )
    .fetch_one(fixture.store.pool())
    .await
    .unwrap();
    assert_eq!(active, 0);
}

#[tokio::test]
async fn compaction_preserves_original_history_and_records_its_cost() {
    let fixture = Fixture::new(vec![
        Reply::Tool("read_file", json!({"path":"input.txt","offset":1})),
        Reply::Answer("Primeiro turno."),
        Reply::Tool("read_file", json!({"path":"input.txt","offset":1})),
        Reply::Answer("Segundo turno."),
    ])
    .await;
    let agents = vec![Fixture::agent("toph", "yolo")];
    let first = fixture
        .start("first", agents.clone(), "Leia input.txt")
        .await;
    fixture
        .wait(first["id"].as_str().unwrap(), "completed")
        .await;
    let session = first["sessionId"].as_str().unwrap();
    for index in 0..160 {
        let text = format!("Decisão {index}: {}", "a".repeat(3000));
        let id = format!("history-{index}");
        let role = if index % 2 == 0 { "user" } else { "assistant" };
        sqlx::query("INSERT INTO agent_messages(id,session_id,role,body,display,content_text,estimated_tokens,created_at) VALUES(?,?,?,?,?,?,?,?)")
            .bind(&id).bind(session).bind(role).bind(json!({"role":role,"content":text}).to_string()).bind(json!({"id":id,"chatId":"chat","role":role,"content":text,"createdAt":index}).to_string()).bind(&text).bind(1000i64).bind(index).execute(fixture.store.pool()).await.unwrap();
        sqlx::query("INSERT INTO agent_events(id,session_id,run_id,kind,payload,created_at) VALUES(?,?,?,?,?,?)")
            .bind(format!("event-{id}")).bind(session).bind(first["id"].as_str().unwrap()).bind(if role == "user" { "user_task" } else { "assistant" })
            .bind(json!({"body":{"role":role,"content":text},"display":{"role":role,"content":text}}).to_string())
            .bind(index).execute(fixture.store.pool()).await.unwrap();
    }
    let second = fixture
        .start("second", agents, "Continue sem perder as decisões")
        .await;
    fixture
        .wait(second["id"].as_str().unwrap(), "completed")
        .await;
    let original: i64 =
        sqlx::query_scalar("SELECT count(*) FROM agent_messages WHERE id LIKE 'history-%'")
            .fetch_one(fixture.store.pool())
            .await
            .unwrap();
    assert_eq!(original, 160);
    let condensations: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM agent_events WHERE session_id=? AND kind='condensation'",
    )
    .bind(session)
    .fetch_one(fixture.store.pool())
    .await
    .unwrap();
    assert!(condensations > 0);
    let requests = fixture.mock.requests.lock().unwrap();
    let last = requests.last().unwrap();
    assert!(last["messages"].to_string().len() < 400_000);
}

#[tokio::test]
async fn delegation_has_its_own_run_and_only_the_task_context() {
    let fixture = Fixture::new(vec![
        Reply::Tool(
            "delegate",
            json!({"agent":"reviewer","task":"Revise input.txt"}),
        ),
        Reply::Tool("read_file", json!({"path":"input.txt","offset":1})),
        Reply::Answer("Revisão concluída."),
        Reply::Answer("Consolidação concluída."),
    ])
    .await;
    let run = fixture
        .start(
            "team",
            vec![
                Fixture::agent("toph", "yolo"),
                Fixture::agent("reviewer", "yolo"),
            ],
            "Delegue a revisão. Informação sem relação: UNIQUE_PARENT_ONLY_MARKER",
        )
        .await;
    fixture.wait(run["id"].as_str().unwrap(), "completed").await;
    let children: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM agent_runs WHERE parent_id=? AND state='completed'",
    )
    .bind(run["id"].as_str().unwrap())
    .fetch_one(fixture.store.pool())
    .await
    .unwrap();
    assert_eq!(children, 1);
    let requests = fixture.mock.requests.lock().unwrap();
    assert_eq!(requests.len(), 4);
    assert!(!requests[1]["messages"]
        .to_string()
        .contains("UNIQUE_PARENT_ONLY_MARKER"));
    assert!(!requests[1]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .any(|t| t["function"]["name"] == "delegate"));
}

#[tokio::test]
async fn imported_local_history_is_searchable_without_replaying_it() {
    let fixture = Fixture::new(vec![
        Reply::Tool("search_history", json!({"query":"Safira"})),
        Reply::Answer("O projeto Safira usa SQLite."),
    ])
    .await;
    let user = fixture.store.user_by_username("admin").await.unwrap();
    fixture.store.save_workspace_messages(user.id,&fixture.project,vec![json!({"id":"old-message","chatId":"chat","role":"user","content":"Decisão do projeto Safira: usar SQLite.","createdAt":1})]).await.unwrap();
    let run = fixture
        .start(
            "import",
            vec![Fixture::agent("toph", "yolo")],
            "Recupere a decisão sobre Safira",
        )
        .await;
    let snapshot = fixture.wait(run["id"].as_str().unwrap(), "completed").await;
    assert!(snapshot["messages"]
        .as_array()
        .unwrap()
        .iter()
        .any(|m| m["content"]
            .as_str()
            .unwrap_or("")
            .contains("Decisão do projeto Safira")));
    let requests = fixture.mock.requests.lock().unwrap();
    assert!(!requests[0]["messages"]
        .to_string()
        .contains("Decisão do projeto Safira: usar SQLite"));
    assert!(requests[1]["messages"].to_string().contains("SQLite"));
}

#[cfg(unix)]
#[tokio::test]
async fn shell_timeout_kills_background_process_group() {
    let dir = tempfile::tempdir().unwrap();
    let result =
        toph_server::features::agents::tools::shell(dir.path(), "sleep 10 & wait", Some(30)).await;
    assert!(result.unwrap_err().to_string().contains("timed out"));
}

#[tokio::test]
async fn plan_mode_rejects_mutating_calls_even_if_the_model_requests_them() {
    let fixture = Fixture::new(vec![Reply::Tool(
        "write_file",
        json!({"path":"not-allowed.txt","content":"no"}),
    )])
    .await;
    let mut agent = Fixture::agent("toph", "yolo");
    agent["agentMode"] = json!("plan");
    let run = fixture
        .start("plan", vec![agent], "Planeje a alteração")
        .await;
    fixture.wait(run["id"].as_str().unwrap(), "failed").await;
    assert!(!fixture
        .dir
        .path()
        .join("workspace/not-allowed.txt")
        .exists());
}

#[tokio::test]
async fn interrupted_tool_calls_are_repaired_without_reexecution() {
    let fixture = Fixture::new(vec![
        Reply::Tool("read_file", json!({"path":"input.txt","offset":1})),
        Reply::Answer("Primeira resposta"),
        Reply::Tool("read_file", json!({"path":"input.txt","offset":1})),
        Reply::Answer("Retomado sem repetir efeitos"),
    ])
    .await;
    let agents = vec![Fixture::agent("toph", "yolo")];
    let run = fixture
        .start("before-crash", agents.clone(), "Leia input.txt")
        .await;
    let id = run["id"].as_str().unwrap();
    fixture.wait(id, "completed").await;
    let body = json!({"role":"assistant","tool_calls":[{"id":"unknown-effect","type":"function","function":{"name":"write_file","arguments":"{\"path\":\"never-replayed.txt\",\"content\":\"no\"}"}}]});
    sqlx::query("INSERT INTO agent_messages(id,session_id,run_id,role,body,display,content_text,estimated_tokens,created_at) VALUES('interrupted-message',?,?,'assistant',?,'{}','',100,?)")
        .bind(run["sessionId"].as_str().unwrap()).bind(id).bind(body.to_string()).bind(chrono::Utc::now().timestamp_millis()).execute(fixture.store.pool()).await.unwrap();
    sqlx::query("INSERT INTO agent_events(id,session_id,run_id,kind,payload,created_at) VALUES('interrupted-event',?,?,'assistant',?,?)")
        .bind(run["sessionId"].as_str().unwrap()).bind(id).bind(json!({"body":body,"display":{}}).to_string()).bind(chrono::Utc::now().timestamp_millis()).execute(fixture.store.pool()).await.unwrap();
    sqlx::query("UPDATE agent_runs SET state='running' WHERE id=?")
        .bind(id)
        .execute(fixture.store.pool())
        .await
        .unwrap();
    toph_server::features::agents::repository::Repository(fixture.store.clone())
        .recover()
        .await
        .unwrap();
    let resumed = fixture
        .start("after-crash", agents, "Inspecione e continue")
        .await;
    fixture
        .wait(resumed["id"].as_str().unwrap(), "completed")
        .await;
    assert!(!fixture
        .dir
        .path()
        .join("workspace/never-replayed.txt")
        .exists());
    let requests = fixture.mock.requests.lock().unwrap();
    assert_eq!(requests.len(), 4);
    assert!(requests
        .iter()
        .any(|request| request["messages"].to_string().contains("unknown-effect")));
}

#[tokio::test]
async fn generic_greeting_is_rejected_and_the_task_continues() {
    let fixture = Fixture::new_with_plan(
        vec![
            Reply::Answer("Oi! 👋 Tô aqui. Em que posso ajudar?"),
            Reply::Tool("read_file", json!({"path":"input.txt","offset":1})),
            Reply::Answer("A investigação confirmou o conteúdo de input.txt."),
        ],
        "investigation",
    )
    .await;
    let agents = vec![Fixture::agent("toph", "yolo")];
    let run = fixture
        .start(
            "generic-answer",
            agents,
            "Leia input.txt e confirme o conteúdo.",
        )
        .await;
    let snapshot = fixture.wait(run["id"].as_str().unwrap(), "completed").await;
    let messages = snapshot["messages"].as_array().unwrap();
    assert!(messages.iter().any(|message| message["role"] == "assistant"
        && message["content"]
            .as_str()
            .is_some_and(|content| content.contains("A investigação confirmou"))));
    assert!(
        !messages.iter().any(|message| message["role"] == "assistant"
            && message["content"]
                .as_str()
                .is_some_and(|content| content.contains("Em que posso ajudar")))
    );

    let requests = fixture.mock.requests.lock().unwrap();
    assert_eq!(requests.len(), 3);
    let reminder = requests[1]["messages"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|message| message["content"].as_str())
        .find(|content| content.contains("Completion Gate"))
        .expect("the runtime must return concrete completion blockers");
    assert!(reminder.contains("investigação") || reminder.contains("ferramenta"));
}

#[tokio::test]
async fn greeting_answers_with_the_current_model_without_tools_or_history_replay() {
    let fixture = Fixture::new(vec![Reply::Answer("Olá! Em que posso ajudar?")]).await;
    let agents = vec![Fixture::agent("toph", "yolo")];
    let run = fixture.start("greeting", agents, "Olá").await;
    let snapshot = fixture.wait(run["id"].as_str().unwrap(), "completed").await;
    assert!(snapshot["messages"]
        .as_array()
        .unwrap()
        .iter()
        .any(|message| message["role"] == "assistant"
            && message["content"] == "Olá! Em que posso ajudar?"));
    let requests = fixture.mock.requests.lock().unwrap();
    assert_eq!(requests.len(), 1);
    assert!(requests[0].get("tools").is_none());
    let messages = requests[0]["messages"].as_array().unwrap();
    assert_eq!(messages.len(), 2);
    let system = messages[0]["content"].as_str().unwrap();
    assert!(system.contains("fixture-model"));
    assert!(system.contains("127.0.0.1"));
    assert!(system.contains("Não retome"));
}

#[tokio::test]
async fn long_runs_are_not_cut_at_a_fixed_step_count() {
    let mut replies = (0..26)
        .map(|index| Reply::Tool("shell", json!({"command": format!("echo step-{index}")})))
        .collect::<Vec<_>>();
    replies.push(Reply::Answer("Todos os passos concluídos."));
    let fixture = Fixture::new(replies).await;
    let run = fixture
        .start(
            "long-run",
            vec![Fixture::agent("toph", "yolo")],
            "Execute os passos",
        )
        .await;
    let snapshot = fixture.wait(run["id"].as_str().unwrap(), "completed").await;
    assert!(snapshot["runs"][0]["error"]
        .as_str()
        .unwrap_or("")
        .is_empty());
    assert!(fixture.mock.requests.lock().unwrap().len() >= 27);
}

#[tokio::test]
async fn empty_reasoning_only_answer_retries_with_more_output() {
    let fixture = Fixture::new(vec![
        Reply::EmptyLength,
        Reply::Tool("read_file", json!({"path":"input.txt","offset":1})),
        Reply::Answer("Resposta final."),
    ])
    .await;
    let run = fixture
        .start(
            "empty-retry",
            vec![Fixture::agent("toph", "yolo")],
            "Responda",
        )
        .await;
    let snapshot = fixture.wait(run["id"].as_str().unwrap(), "completed").await;
    assert!(snapshot["messages"]
        .as_array()
        .unwrap()
        .iter()
        .any(|message| message["content"] == "Resposta final."));
    let requests = fixture.mock.requests.lock().unwrap();
    assert_eq!(requests.len(), 3);
    assert!(
        requests[1]["max_tokens"].as_i64().unwrap() > requests[0]["max_tokens"].as_i64().unwrap()
    );
}

#[tokio::test]
async fn change_tasks_require_edit_and_verification_before_completion() {
    let fixture = Fixture::new_with_plan(
        vec![
            Reply::Answer("Concluído."),
            Reply::Tool("write_file", json!({"path":"created.txt","content":"ok"})),
            Reply::Tool("verify", json!({"commands":["true"]})),
            Reply::Answer("Implementei e verifiquei a alteração."),
        ],
        "change",
    )
    .await;
    let run = fixture
        .start(
            "change-gate",
            vec![Fixture::agent("toph", "yolo")],
            "Crie o arquivo created.txt",
        )
        .await;
    let snapshot = fixture.wait(run["id"].as_str().unwrap(), "completed").await;
    assert!(fixture.dir.path().join("workspace/created.txt").exists());
    assert!(snapshot["messages"]
        .as_array()
        .unwrap()
        .iter()
        .any(|m| m["content"]
            .as_str()
            .is_some_and(|content| content.contains("Implementei e verifiquei"))));
    let rejections: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM agent_events WHERE run_id=? AND kind='completion_rejected'",
    )
    .bind(run["id"].as_str().unwrap())
    .fetch_one(fixture.store.pool())
    .await
    .unwrap();
    assert!(rejections > 0);
}
