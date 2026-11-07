use serde_json::json;
use toph_server::features::agents::{models::AgentSpec, repository::Repository};
use toph_server::{ai::AiService, store::Store};

#[tokio::test]
async fn usage_is_scoped_to_the_chat_and_keeps_each_toph_separate() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("db")).await.unwrap();
    let user = store
        .create_user("owner", "unused-fixture-hash")
        .await
        .unwrap();
    let project = store.create_project(serde_json::from_value(json!({"id":"project","name":"Project","root":dir.path().display().to_string(),"color":"#FFB547","createdAt":"","updatedAt":""})).unwrap()).await.unwrap();
    let repo = Repository(store.clone());
    for (id, chat, input, output, context) in [
        ("first", "chat-one", 100i64, 20i64, 3000i64),
        ("second", "chat-two", 9000, 1000, 10000),
    ] {
        let agent: AgentSpec =
            serde_json::from_value(json!({"id":id,"chatId":chat,"name":id,"handle":id})).unwrap();
        repo.profiles(user.id, &project.id, &[agent.clone()])
            .await
            .unwrap();
        let session = repo
            .session(user.id, &project.id, &agent, None)
            .await
            .unwrap();
        let run = repo
            .create_run(user.id, &project.id, &session, id, None, &agent)
            .await
            .unwrap();
        sqlx::query("INSERT INTO agent_model_calls VALUES(?,?,'turn','custom','model',?,?,0,0,?,1,'stop',1)")
            .bind(id).bind(run.id).bind(input).bind(output).bind(context).execute(store.pool()).await.unwrap();
    }
    let one = repo
        .usage(user.id, &project.id, Some("chat-one"))
        .await
        .unwrap();
    assert_eq!(one["inputTokens"], 100);
    assert_eq!(one["outputTokens"], 20);
    assert_eq!(one["calls"], 1);
    assert_eq!(one["contextTokens"], 3000);
    assert_eq!(one["byAgent"].as_array().unwrap().len(), 1);
    assert_eq!(one["byAgent"][0]["agentId"], "first");
    let two = repo
        .usage(user.id, &project.id, Some("chat-two"))
        .await
        .unwrap();
    assert_eq!(two["inputTokens"], 9000);
    assert_eq!(two["byAgent"][0]["agentId"], "second");
    assert_eq!(
        repo.usage(user.id, &project.id, None).await.unwrap()["calls"],
        2
    );
}

#[tokio::test]
async fn old_layout_model_ids_migrate_to_their_own_connections_idempotently() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("db")).await.unwrap();
    let ai = AiService::new(store, &dir.path().join("key")).unwrap();
    ai.save(serde_json::from_value(json!({"provider":"custom","baseUrl":"https://opencode.ai/inference/go/openai/v1","apiKey":"fixture","model":"deepseek-v4.1-flash","maxTokens":4096,"temperature":0,"autocomplete":false,"systemPrompt":"","imageProviders":[]})).unwrap()).await.unwrap();
    ai.save_connection(serde_json::from_value(json!({"label":"OpenAI","provider":"openai","baseUrl":"https://api.openai.com/v1","apiKey":"fixture"})).unwrap()).await.unwrap();
    let connection = ai.connections().await.unwrap().remove(0);
    let mut layout = json!({"chats":{"tophs":[
        {"name":"Toph","model":"openai/gpt-6-astra","agentMode":"plan","personality":"Careful"},
        {"name":"Beto","model":"opencode-go/deepseek-v4.1-flash","agentMode":"build","personality":"Direct"}
    ]}});
    ai.migrate_layout_models(&mut layout).await.unwrap();
    assert_eq!(
        layout["chats"]["tophs"][0]["model"],
        format!("{}::gpt-6-astra", connection.id)
    );
    assert_eq!(
        layout["chats"]["tophs"][1]["model"],
        "default::deepseek-v4.1-flash"
    );
    assert_eq!(layout["chats"]["tophs"][0]["agentMode"], "plan");
    assert_eq!(layout["chats"]["tophs"][1]["personality"], "Direct");
    let canonical = layout.clone();
    ai.migrate_layout_models(&mut layout).await.unwrap();
    assert_eq!(layout, canonical);
    let openai = ai
        .resolve(layout["chats"]["tophs"][0]["model"].as_str().unwrap())
        .await
        .unwrap();
    assert_eq!(openai.provider, "openai");
    assert_eq!(openai.model, "gpt-6-astra");
}
