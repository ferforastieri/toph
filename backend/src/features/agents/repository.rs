use super::{context::estimate, models::*};
use crate::{
    crypto::new_id,
    errors::{AppError, AppResult},
    store::Store,
};
use serde_json::{json, Value};
use sqlx::Row;

#[derive(Clone)]
pub struct Repository(pub Store);

impl Repository {
    pub async fn import_local_history(&self, ctx: &RunContext) -> AppResult<()> {
        if ctx.depth != 0 {
            return Ok(());
        }
        let mut tx = self.0.pool().begin().await?;
        let sessions: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM agent_sessions WHERE user_id=? AND project_id=? AND agent_id=?",
        )
        .bind(ctx.user_id)
        .bind(&ctx.project_id)
        .bind(&ctx.agent.id)
        .fetch_one(&mut *tx)
        .await?;
        let messages: i64 =
            sqlx::query_scalar("SELECT count(*) FROM agent_messages WHERE session_id=?")
                .bind(&ctx.run.session_id)
                .fetch_one(&mut *tx)
                .await?;
        if sessions == 1 && messages == 0 {
            sqlx::query("INSERT INTO agent_messages(id,session_id,role,body,display,content_text,estimated_tokens,created_at) SELECT ? || message_id,?,role,json_object('role',role,'content',json_extract(payload,'$.content')),json_set(payload,'$.id',? || message_id,'$.sessionId',?,'$.status','complete'),json_extract(payload,'$.content'),length(CAST(json_extract(payload,'$.content') AS BLOB))/3+32,created_at FROM bot_messages WHERE user_id=? AND project_id=? AND channel=? AND mode='chat' AND (role='user' OR (role='assistant' AND bot_id=?)) AND coalesce(json_extract(payload,'$.pending'),0)=0 ORDER BY created_at,message_id")
                .bind(format!("import-{}-",ctx.run.session_id)).bind(&ctx.run.session_id).bind(format!("import-{}-",ctx.run.session_id)).bind(&ctx.run.session_id)
                .bind(ctx.user_id).bind(&ctx.project_id).bind(&ctx.run.chat_id).bind(&ctx.agent.id).execute(&mut *tx).await?;
            let seq: Option<i64> =
                sqlx::query_scalar("SELECT max(seq) FROM agent_messages WHERE session_id=?")
                    .bind(&ctx.run.session_id)
                    .fetch_one(&mut *tx)
                    .await?;
            if let Some(seq) = seq {
                sqlx::query("INSERT INTO agent_checkpoints VALUES(?,?,?,?,?,?)").bind(new_id()).bind(&ctx.run.session_id).bind(seq)
                    .bind("A transcrição anterior foi importada e está disponível em search_history. Recupere fatos, decisões e restrições relevantes quando o pedido depender do histórico anterior; ele não foi reenviado integralmente.").bind(90i64).bind(now()).execute(&mut *tx).await?;
            }
        }
        tx.commit().await?;
        Ok(())
    }
    pub async fn recover(&self) -> AppResult<()> {
        sqlx::query("UPDATE agent_runs SET state='interrupted',error='Server stopped during execution; inspect tool effects before retrying',finished_at=? WHERE state IN ('queued','running','waiting')")
            .bind(now()).execute(self.0.pool()).await?;
        sqlx::query("UPDATE agent_tool_calls SET state='interrupted' WHERE state IN ('running','waiting','pending')").execute(self.0.pool()).await?;
        sqlx::query("UPDATE agent_model_calls SET finish='interrupted' WHERE finish='pending'")
            .execute(self.0.pool())
            .await?;
        Ok(())
    }

    pub async fn profiles(&self, user: i64, project: &str, agents: &[AgentSpec]) -> AppResult<()> {
        let mut tx = self.0.pool().begin().await?;
        for a in agents {
            let rows=sqlx::query("INSERT INTO agent_profiles(id,user_id,project_id,chat_id,config) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config,chat_id=excluded.chat_id WHERE agent_profiles.user_id=excluded.user_id AND agent_profiles.project_id=excluded.project_id")
                .bind(&a.id).bind(user).bind(project).bind(&a.chat_id).bind(serde_json::to_string(a)?).execute(&mut *tx).await?.rows_affected();
            if rows == 0 {
                return Err(AppError::Forbidden);
            }
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn session(
        &self,
        user: i64,
        project: &str,
        agent: &AgentSpec,
        selected: Option<&str>,
    ) -> AppResult<Session> {
        if let Some(id) = selected {
            return sqlx::query_as("SELECT id,chat_id,agent_id,title,archived,created_at,updated_at FROM agent_sessions WHERE id=? AND user_id=? AND project_id=? AND agent_id=? AND chat_id=?")
                .bind(id).bind(user).bind(project).bind(&agent.id).bind(&agent.chat_id).fetch_optional(self.0.pool()).await?.ok_or(AppError::NotFound);
        }
        sqlx::query("INSERT OR IGNORE INTO agent_sessions(id,user_id,project_id,chat_id,agent_id,title,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
            .bind(new_id()).bind(user).bind(project).bind(&agent.chat_id).bind(&agent.id).bind(&agent.name).bind(now()).bind(now()).execute(self.0.pool()).await?;
        sqlx::query_as("SELECT id,chat_id,agent_id,title,archived,created_at,updated_at FROM agent_sessions WHERE user_id=? AND project_id=? AND agent_id=? AND archived=0")
            .bind(user).bind(project).bind(&agent.id).fetch_one(self.0.pool()).await.map_err(Into::into)
    }

    pub async fn sessions(&self, user: i64, project: &str, agent: &str) -> AppResult<Vec<Session>> {
        Ok(sqlx::query_as("SELECT id,chat_id,agent_id,title,archived,created_at,updated_at FROM agent_sessions WHERE user_id=? AND project_id=? AND agent_id=? ORDER BY updated_at DESC LIMIT 100")
            .bind(user).bind(project).bind(agent).fetch_all(self.0.pool()).await?)
    }

    pub async fn switch_session(
        &self,
        user: i64,
        project: &str,
        agent: &str,
        selected: Option<&str>,
    ) -> AppResult<()> {
        let mut tx = self.0.pool().begin().await?;
        let active:i64=sqlx::query_scalar("SELECT count(*) FROM agent_runs WHERE user_id=? AND project_id=? AND agent_id=? AND state IN ('queued','running','waiting')")
            .bind(user).bind(project).bind(agent).fetch_one(&mut *tx).await?;
        if active > 0 {
            return Err(AppError::Conflict);
        }
        if let Some(id) = selected {
            let count:i64=sqlx::query_scalar("SELECT count(*) FROM agent_sessions WHERE id=? AND user_id=? AND project_id=? AND agent_id=?")
                .bind(id).bind(user).bind(project).bind(agent).fetch_one(&mut *tx).await?;
            if count != 1 {
                return Err(AppError::NotFound);
            }
        }
        sqlx::query(
            "UPDATE agent_sessions SET archived=1 WHERE user_id=? AND project_id=? AND agent_id=?",
        )
        .bind(user)
        .bind(project)
        .bind(agent)
        .execute(&mut *tx)
        .await?;
        if let Some(id) = selected {
            sqlx::query("UPDATE agent_sessions SET archived=0,updated_at=? WHERE id=?")
                .bind(now())
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn request_run(
        &self,
        user: i64,
        project: &str,
        request: &str,
    ) -> AppResult<Option<Run>> {
        Ok(sqlx::query_as("SELECT id,session_id,parent_id,chat_id,agent_id,state,error,created_at,finished_at FROM agent_runs WHERE user_id=? AND project_id=? AND request_id=?")
            .bind(user).bind(project).bind(request).fetch_optional(self.0.pool()).await?)
    }
    pub async fn get_run(&self, user: i64, project: &str, id: &str) -> AppResult<Run> {
        sqlx::query_as("SELECT id,session_id,parent_id,chat_id,agent_id,state,error,created_at,finished_at FROM agent_runs WHERE user_id=? AND project_id=? AND id=?")
            .bind(user).bind(project).bind(id).fetch_optional(self.0.pool()).await?.ok_or(AppError::NotFound)
    }
    pub async fn create_run(
        &self,
        user: i64,
        project: &str,
        session: &Session,
        request: &str,
        parent: Option<&str>,
        agent: &AgentSpec,
    ) -> AppResult<Run> {
        let run = Run {
            id: new_id(),
            session_id: session.id.clone(),
            parent_id: parent.map(str::to_string),
            chat_id: session.chat_id.clone(),
            agent_id: agent.id.clone(),
            state: "queued".into(),
            error: String::new(),
            created_at: now(),
            finished_at: None,
        };
        sqlx::query("INSERT INTO agent_runs(id,session_id,parent_id,user_id,project_id,chat_id,agent_id,request_id,state,config,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
            .bind(&run.id).bind(&run.session_id).bind(parent).bind(user).bind(project).bind(&run.chat_id).bind(&run.agent_id).bind(request).bind(&run.state).bind(serde_json::to_string(agent)?).bind(run.created_at)
            .execute(self.0.pool()).await.map_err(|e| if e.as_database_error().is_some_and(|e|e.is_unique_violation()){AppError::Conflict}else{e.into()})?;
        Ok(run)
    }
    pub async fn state(&self, id: &str, state: &str, error: &str) -> AppResult<()> {
        let done = matches!(state, "completed" | "failed" | "cancelled" | "interrupted");
        sqlx::query("UPDATE agent_runs SET state=?,error=?,finished_at=? WHERE id=?")
            .bind(state)
            .bind(error)
            .bind(if done { Some(now()) } else { None })
            .bind(id)
            .execute(self.0.pool())
            .await?;
        Ok(())
    }

    pub async fn message(
        &self,
        ctx: &RunContext,
        id: &str,
        body: Value,
        display: Value,
    ) -> AppResult<()> {
        let text = body["content"]
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| body["content"].to_string());
        let mut tx = self.0.pool().begin().await?;
        sqlx::query("INSERT INTO agent_messages(id,session_id,run_id,role,body,display,content_text,estimated_tokens,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
            .bind(id).bind(&ctx.run.session_id).bind(&ctx.run.id).bind(body["role"].as_str().unwrap_or("assistant"))
            .bind(body.to_string()).bind(display.to_string()).bind(text).bind(estimate(&body) as i64).bind(now()).execute(&mut *tx).await?;
        // Keep the existing chat transcript as an archive, in the same transaction.
        sqlx::query("INSERT INTO bot_messages(user_id,project_id,message_id,mode,channel,role,bot_id,created_at,payload,updated_at) VALUES(?,?,?,'chat',?,?,?,?,?,?) ON CONFLICT(user_id,project_id,mode,channel,message_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at")
            .bind(ctx.user_id).bind(&ctx.project_id).bind(id).bind(&ctx.run.chat_id).bind(display["role"].as_str().unwrap_or("assistant"))
            .bind(&ctx.agent.id).bind(now()).bind(display.to_string()).bind(chrono::Utc::now().to_rfc3339()).execute(&mut *tx).await?;
        sqlx::query("UPDATE agent_sessions SET updated_at=? WHERE id=?")
            .bind(now())
            .bind(&ctx.run.session_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn context(&self, session: &str, after: i64) -> AppResult<Vec<ContextMessage>> {
        let rows=sqlx::query("SELECT seq,body,estimated_tokens FROM agent_messages WHERE session_id=? AND seq>? ORDER BY seq LIMIT 512")
            .bind(session).bind(after).fetch_all(self.0.pool()).await?;
        rows.into_iter()
            .map(|r| {
                Ok(ContextMessage {
                    seq: r.get("seq"),
                    body: serde_json::from_str(r.get::<&str, _>("body"))?,
                    tokens: r.get::<i64, _>("estimated_tokens") as usize,
                })
            })
            .collect()
    }
    pub async fn checkpoint(&self, session: &str) -> AppResult<(i64, String)> {
        Ok(sqlx::query_as("SELECT through_seq,summary FROM agent_checkpoints WHERE session_id=? ORDER BY through_seq DESC LIMIT 1").bind(session).fetch_optional(self.0.pool()).await?.unwrap_or((0,String::new())))
    }
    pub async fn save_checkpoint(&self, session: &str, seq: i64, summary: &str) -> AppResult<()> {
        sqlx::query("INSERT INTO agent_checkpoints VALUES(?,?,?,?,?,?)")
            .bind(new_id())
            .bind(session)
            .bind(seq)
            .bind(summary)
            .bind(estimate(&json!(summary)) as i64)
            .bind(now())
            .execute(self.0.pool())
            .await?;
        Ok(())
    }

    pub async fn snapshot(
        &self,
        user: i64,
        project: &str,
        chat: &str,
        before: Option<i64>,
    ) -> AppResult<Value> {
        let rows=sqlx::query("SELECT m.seq,m.display FROM agent_messages m JOIN agent_sessions s ON s.id=m.session_id WHERE s.user_id=? AND s.project_id=? AND s.chat_id=? AND s.archived=0 AND (? IS NULL OR m.seq<?) ORDER BY m.seq DESC LIMIT 161")
            .bind(user).bind(project).bind(chat).bind(before).bind(before).fetch_all(self.0.pool()).await?;
        let more = rows.len() > 160;
        let mut items = Vec::new();
        let mut cursor = None;
        for row in rows.into_iter().take(160) {
            let seq: i64 = row.get("seq");
            let mut v: Value = serde_json::from_str(row.get::<&str, _>("display"))?;
            v["seq"] = json!(seq);
            cursor = Some(seq);
            items.push(v);
        }
        items.reverse();
        let runs:Vec<Run>=sqlx::query_as("SELECT id,session_id,parent_id,chat_id,agent_id,state,error,created_at,finished_at FROM agent_runs WHERE user_id=? AND project_id=? AND chat_id=? ORDER BY created_at DESC LIMIT 32")
            .bind(user).bind(project).bind(chat).fetch_all(self.0.pool()).await?;
        let approvals=sqlx::query("SELECT t.id,t.name,t.arguments,r.id AS run_id,r.agent_id,r.session_id FROM agent_tool_calls t JOIN agent_runs r ON r.id=t.run_id WHERE r.user_id=? AND r.project_id=? AND r.chat_id=? AND t.state='waiting'")
            .bind(user).bind(project).bind(chat).fetch_all(self.0.pool()).await?.iter().map(|r|json!({"id":r.get::<String,_>("id"),"name":r.get::<String,_>("name"),"arguments":r.get::<String,_>("arguments"),"runId":r.get::<String,_>("run_id"),"agentId":r.get::<String,_>("agent_id")})).collect::<Vec<_>>();
        Ok(
            json!({"messages":items,"hasMore":more,"cursor":cursor,"runs":runs,"approvals":approvals}),
        )
    }

    pub async fn usage(&self, user: i64, project: &str, chat: Option<&str>) -> AppResult<Value> {
        let rows = sqlx::query("SELECT r.agent_id,coalesce(sum(c.input_tokens),0) AS input,coalesce(sum(c.output_tokens),0) AS output,coalesce(sum(c.cached_tokens),0) AS cached,count(*) AS calls FROM agent_model_calls c JOIN agent_runs r ON r.id=c.run_id WHERE r.user_id=? AND r.project_id=? AND (? IS NULL OR r.chat_id=?) AND c.finish<>'pending' GROUP BY r.agent_id")
            .bind(user).bind(project).bind(chat).bind(chat).fetch_all(self.0.pool()).await?;
        let by_agent = rows.iter().map(|r| json!({"agentId":r.get::<String,_>("agent_id"),"inputTokens":r.get::<i64,_>("input"),"outputTokens":r.get::<i64,_>("output"),"cachedTokens":r.get::<i64,_>("cached"),"calls":r.get::<i64,_>("calls")})).collect::<Vec<_>>();
        let last: Option<(i64,String)> = sqlx::query_as("SELECT c.estimated_input,r.agent_id FROM agent_model_calls c JOIN agent_runs r ON r.id=c.run_id WHERE r.user_id=? AND r.project_id=? AND (? IS NULL OR r.chat_id=?) AND c.kind='turn' ORDER BY c.created_at DESC LIMIT 1")
            .bind(user).bind(project).bind(chat).bind(chat).fetch_optional(self.0.pool()).await?;
        let total = |column: &str| rows.iter().map(|r| r.get::<i64, _>(column)).sum::<i64>();
        Ok(
            json!({"inputTokens":total("input"),"outputTokens":total("output"),"cachedTokens":total("cached"),"calls":total("calls"),"byAgent":by_agent,"contextTokens":last.as_ref().map(|v|v.0).unwrap_or(0),"contextAgentId":last.map(|v|v.1),"contextBudget":super::context::INPUT_BUDGET}),
        )
    }

    pub async fn repair(&self, ctx: &RunContext) -> AppResult<()> {
        let (through, _) = self.checkpoint(&ctx.run.session_id).await?;
        let rows = self.context(&ctx.run.session_id, through).await?;
        let mut pending = std::collections::BTreeMap::new();
        for row in rows {
            if let Some(calls) = row.body["tool_calls"].as_array() {
                for c in calls {
                    if let Some(id) = c["id"].as_str() {
                        pending.insert(
                            id.to_string(),
                            c["function"]["name"].as_str().unwrap_or("").to_string(),
                        );
                    }
                }
            }
            if let Some(id) = row.body["tool_call_id"].as_str() {
                pending.remove(id);
            }
        }
        for (id, name) in pending {
            let mid = new_id();
            let text="Execution was interrupted. Effects may already exist; inspect state before retrying.";
            self.message(ctx,&mid,json!({"role":"tool","tool_call_id":id,"name":name,"content":text}),json!({"id":mid,"chatId":ctx.run.chat_id,"tophId":ctx.agent.id,"sessionId":ctx.run.session_id,"role":"tool","title":name,"content":text,"status":"error","createdAt":now()})).await?;
        }
        Ok(())
    }
}
