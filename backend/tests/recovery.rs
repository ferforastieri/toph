use serde_json::json;
use toph_server::features::agents::{models::AgentSpec, repository::Repository};
use toph_server::store::Store;

#[tokio::test]
async fn recover_returns_active_runs_with_prompt_and_tracks_resume_attempts() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("db")).await.unwrap();
    let user = store
        .create_user("owner", "unused-fixture-hash")
        .await
        .unwrap();
    let project = store
        .create_project(
            serde_json::from_value(json!({
                "id":"project",
                "name":"Project",
                "root":dir.path().display().to_string(),
                "color":"#FFB547",
                "createdAt":"",
                "updatedAt":""
            }))
            .unwrap(),
        )
        .await
        .unwrap();
    let repo = Repository(store.clone());
    let agent: AgentSpec =
        serde_json::from_value(json!({"id":"toph","chatId":"chat","name":"Toph","handle":"toph"}))
            .unwrap();
    repo.profiles(user.id, &project.id, &[agent.clone()])
        .await
        .unwrap();
    let session = repo
        .session(user.id, &project.id, &agent, None)
        .await
        .unwrap();
    let run = repo
        .create_run(user.id, &project.id, &session, "request", None, &agent)
        .await
        .unwrap();
    sqlx::query("INSERT INTO agent_messages(id,session_id,run_id,role,body,display,content_text,estimated_tokens,created_at) VALUES('m1',?,?,'user','{}','{}','Implemente o login',1,1)")
        .bind(&run.session_id)
        .bind(&run.id)
        .execute(store.pool())
        .await
        .unwrap();

    let recovered = repo.recover().await.unwrap();
    assert_eq!(recovered.len(), 1);
    assert_eq!(recovered[0].run.id, run.id);
    assert_eq!(recovered[0].user_id, user.id);
    assert_eq!(recovered[0].project_id, project.id);
    assert_eq!(recovered[0].prompt, "Implemente o login");
    assert_eq!(recovered[0].attempts, 0);
    let stored: AgentSpec = serde_json::from_str(&recovered[0].config).unwrap();
    assert_eq!(stored.id, "toph");
    assert_eq!(stored.chat_id, "chat");

    let (state, finished): (String, Option<i64>) =
        sqlx::query_as("SELECT state,finished_at FROM agent_runs WHERE id=?")
            .bind(&run.id)
            .fetch_one(store.pool())
            .await
            .unwrap();
    assert_eq!(state, "interrupted");
    assert!(finished.is_some());

    repo.record_recovery(&run.id).await.unwrap();
    let attempts: i64 =
        sqlx::query_scalar("SELECT attempts FROM agent_run_recoveries WHERE run_id=?")
            .bind(&run.id)
            .fetch_one(store.pool())
            .await
            .unwrap();
    assert_eq!(attempts, 1);

    repo.requeue(&run.id, "").await.unwrap();
    let (state, finished): (String, Option<i64>) =
        sqlx::query_as("SELECT state,finished_at FROM agent_runs WHERE id=?")
            .bind(&run.id)
            .fetch_one(store.pool())
            .await
            .unwrap();
    assert_eq!(state, "queued");
    assert!(finished.is_none());

    repo.clear_recovery(&run.id).await.unwrap();
    let rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM agent_run_recoveries WHERE run_id=?")
        .bind(&run.id)
        .fetch_one(store.pool())
        .await
        .unwrap();
    assert_eq!(rows, 0);
}
