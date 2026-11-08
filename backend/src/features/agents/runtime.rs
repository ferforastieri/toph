use super::{
    activity, cli, context, event,
    gateway::Gateway,
    models::*,
    repository::Repository,
    tools::{self, Tools},
};
use crate::{
    ai::{AiConfig, AiService},
    crypto::new_id,
    errors::{bad_request, AppError, AppResult},
    events::EventHub,
    store::Store,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use sqlx::Row;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, RwLock},
    time::{Duration, Instant},
};
use tokio::sync::{broadcast, oneshot};
use tokio_util::sync::CancellationToken;

type CompletionHandler = Arc<dyn Fn(CompletionNotice) + Send + Sync>;

#[derive(Clone, Debug)]
pub struct CompletionNotice {
    pub project_id: String,
    pub chat_id: String,
    pub session_id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub agent_role: String,
    pub text: String,
}

struct Inner {
    repo: Repository,
    tools: Tools,
    ai: AiService,
    events: broadcast::Sender<AgentEvent>,
    workspace_events: EventHub,
    runs: Mutex<HashMap<String, CancellationToken>>,
    approvals: Mutex<HashMap<String, oneshot::Sender<Value>>>,
    drafts: Mutex<HashMap<String, Value>>,
    on_complete: RwLock<Option<CompletionHandler>>,
}

#[derive(Clone)]
pub struct Runtime {
    inner: Arc<Inner>,
}

impl Runtime {
    pub async fn new(store: Store, tools: Tools, workspace_events: EventHub) -> AppResult<Self> {
        let repo = Repository(store);
        repo.recover().await?;
        repo.backfill_events().await?;
        let (events, _) = broadcast::channel(256);
        Ok(Self {
            inner: Arc::new(Inner {
                ai: tools.ai.clone(),
                repo,
                tools,
                events,
                workspace_events,
                runs: Mutex::new(HashMap::new()),
                approvals: Mutex::new(HashMap::new()),
                drafts: Mutex::new(HashMap::new()),
                on_complete: RwLock::new(None),
            }),
        })
    }

    pub fn repository(&self) -> &Repository {
        &self.inner.repo
    }

    pub fn tools(&self) -> &Tools {
        &self.inner.tools
    }

    pub fn subscribe(&self) -> broadcast::Receiver<AgentEvent> {
        self.inner.events.subscribe()
    }

    pub fn set_on_complete(&self, handler: impl Fn(CompletionNotice) + Send + Sync + 'static) {
        *self.inner.on_complete.write().unwrap() = Some(Arc::new(handler));
    }

    pub fn shutdown(&self) {
        for token in self.inner.runs.lock().unwrap().values() {
            token.cancel();
        }
        self.inner.approvals.lock().unwrap().clear();
        self.inner.tools.mcp.stop_now();
    }

    pub async fn maintain(&self) {
        self.inner.tools.mcp.maintain().await;
    }

    fn event(&self, ctx: &RunContext, kind: &str, data: Value) {
        let _ = self.inner.events.send(AgentEvent {
            user_id: ctx.user_id,
            project_id: ctx.project_id.clone(),
            chat_id: ctx.run.chat_id.clone(),
            kind: kind.into(),
            data,
        });
    }

    pub async fn snapshot(
        &self,
        user: i64,
        project: &str,
        chat: &str,
        before: Option<i64>,
    ) -> AppResult<Value> {
        let mut value = self
            .inner
            .repo
            .snapshot(user, project, chat, before)
            .await?;
        let drafts = self
            .inner
            .drafts
            .lock()
            .unwrap()
            .values()
            .filter(|value| {
                value["userId"] == user && value["projectId"] == project && value["chatId"] == chat
            })
            .cloned()
            .collect::<Vec<_>>();
        value["drafts"] = json!(drafts);
        Ok(value)
    }

    pub async fn start(&self, user: i64, project: &str, input: RunInput) -> AppResult<Run> {
        if let Some(run) = self
            .inner
            .repo
            .request_run(user, project, &input.request_id)
            .await?
        {
            return Ok(run);
        }
        if input.request_id.is_empty()
            || input.request_id.len() > 128
            || input.chat_id.is_empty()
            || input.chat_description.len() > 8_000
            || input.text.len() > 64 * 1024
            || input.agents.is_empty()
            || input.agents.len() > 16
            || input.attachments.len() > 6
        {
            return Err(bad_request("Invalid agent request"));
        }
        if input.text.trim().is_empty() && input.attachments.is_empty() {
            return Err(bad_request("Message is empty"));
        }
        if input.attachments.iter().map(|a| a.uri.len()).sum::<usize>() > 12 * 1024 * 1024 {
            return Err(AppError::TooLarge);
        }
        let mut ids = std::collections::HashSet::new();
        let mut handles = std::collections::HashSet::new();
        for agent in &input.agents {
            if agent.id.is_empty()
                || agent.chat_id != input.chat_id
                || !ids.insert(&agent.id)
                || !handles.insert(&agent.handle)
                || agent.prompt.len() + agent.description.len() + agent.personality.len() > 12_000
                || !matches!(agent.permission_mode.as_str(), "yolo" | "ask" | "deny")
                || !matches!(agent.agent_mode.as_str(), "build" | "plan")
            {
                return Err(bad_request("Invalid agent configuration"));
            }
        }
        let mut agent = input
            .agents
            .iter()
            .find(|agent| agent.id == input.agent_id)
            .cloned()
            .ok_or_else(|| bad_request("Unknown agent"))?;
        agent.model = self.inner.ai.migrate_agent_model(&agent.model).await?;
        let config = self.inner.ai.resolve(&agent.model).await?;
        let mut roster = input.agents;
        if let Some(selected) = roster.iter_mut().find(|item| item.id == agent.id) {
            *selected = agent.clone();
        }
        let project_row = self.inner.repo.0.project(project).await?;
        let root = self
            .inner
            .tools
            .workspace
            .validate_root(std::path::Path::new(&project_row.root))?;
        self.inner.repo.profiles(user, project, &roster).await?;
        let session = self
            .inner
            .repo
            .session(user, project, &agent, input.session_id.as_deref())
            .await?;
        // Reserve admission before any run is committed; never queue without a bound.
        let token = CancellationToken::new();
        let admission = new_id();
        {
            let mut runs = self.inner.runs.lock().unwrap();
            if runs.len() >= 16 {
                return Err(AppError::RateLimited);
            }
            runs.insert(admission.clone(), token.clone());
        }
        let created = self
            .inner
            .repo
            .create_run(user, project, &session, &input.request_id, None, &agent)
            .await;
        self.inner.runs.lock().unwrap().remove(&admission);
        let run = match created {
            Ok(run) => run,
            Err(AppError::Conflict) => {
                if let Some(run) = self
                    .inner
                    .repo
                    .request_run(user, project, &input.request_id)
                    .await?
                {
                    return Ok(run);
                }
                return Err(AppError::Conflict);
            }
            Err(error) => return Err(error),
        };
        self.inner
            .runs
            .lock()
            .unwrap()
            .insert(run.id.clone(), token.clone());
        let ctx = RunContext {
            run: run.clone(),
            user_id: user,
            project_id: project.into(),
            root,
            agent,
            roster,
            chat_description: input.chat_description,
            depth: 0,
            request: input.text.clone(),
        };
        let runtime = self.clone();
        tokio::spawn(async move {
            let preparation = runtime.prepare(&ctx, &input.text, &input.attachments).await;
            drop(input.attachments);
            drop(input.text);
            // A run ends when it finishes or when the user cancels it. There is
            // no wall-clock cap: long browser sessions and refactors are legit.
            let result = match preparation {
                Ok(()) => runtime.execute_cli(&ctx, &config, &token).await,
                Err(error) => Err(error),
            };
            runtime.finish(&ctx, result, token.is_cancelled()).await;
        });
        Ok(run)
    }

    async fn prepare(
        &self,
        ctx: &RunContext,
        text: &str,
        attachments: &[Attachment],
    ) -> AppResult<()> {
        self.inner.repo.import_local_history(ctx).await?;
        self.inner.repo.repair(ctx).await?;
        let mut parts = vec![json!({"type":"text","text":text})];
        let mut bytes = 0;
        for attachment in attachments {
            let encoded = attachment
                .uri
                .split_once(";base64,")
                .map(|(_, value)| value)
                .ok_or_else(|| bad_request("Attachments must be base64 data URIs"))?;
            let data = STANDARD
                .decode(encoded)
                .map_err(|error| bad_request(error.to_string()))?;
            bytes += data.len();
            if bytes > 8 * 1024 * 1024 {
                return Err(AppError::TooLarge);
            }
            let image = matches!(
                attachment.mime.as_str(),
                "image/png" | "image/jpeg" | "image/webp" | "image/gif"
            );
            if !image && (data.contains(&0) || std::str::from_utf8(&data).is_err()) {
                return Err(bad_request(
                    "This attachment format is not supported; use UTF-8 text or PNG/JPEG/WebP/GIF",
                ));
            }
            let id = self
                .inner
                .tools
                .artifact(
                    ctx,
                    &attachment.name,
                    if image {
                        &attachment.mime
                    } else {
                        "text/plain"
                    },
                    &data,
                )
                .await?;
            if image {
                parts
                    .push(json!({"type":"image_url","image_url":{"url":format!("artifact:{id}")}}));
            } else {
                parts.push(json!({"type":"text","text":format!("Anexo {}: artifact {id}. Use read_artifact para consultar.",attachment.name)}));
            }
        }
        let id = new_id();
        let body = if parts.len() == 1 {
            json!({"role":"user","content":text})
        } else {
            json!({"role":"user","content":parts})
        };
        let display = json!({"id":id,"chatId":ctx.run.chat_id,"tophId":ctx.agent.id,"sessionId":ctx.run.session_id,"model":ctx.agent.model,"agentMode":ctx.agent.agent_mode,"role":if ctx.depth==0{"user"}else{"system"},"content":if ctx.depth==0{text.to_owned()}else{format!("Tarefa para @{}: {}",ctx.agent.handle,text)},"status":"complete","createdAt":now()});
        let seq = self
            .inner
            .repo
            .message(ctx, &id, body, display.clone())
            .await?;
        let mut display = display;
        display["seq"] = json!(seq);
        self.event(ctx, "message", display);
        Ok(())
    }

    pub async fn cancel(&self, user: i64, project: &str, id: &str) -> AppResult<()> {
        self.inner.repo.get_run(user, project, id).await?;
        if let Some(token) = self.inner.runs.lock().unwrap().get(id) {
            token.cancel();
        }
        Ok(())
    }

    pub async fn cancel_project(
        &self,
        user: Option<i64>,
        project: &str,
        agent: Option<&str>,
    ) -> AppResult<()> {
        let ids:Vec<String>=sqlx::query_scalar("SELECT id FROM agent_runs WHERE project_id=? AND (? IS NULL OR user_id=?) AND (? IS NULL OR agent_id=?) AND state IN ('queued','running','waiting')")
            .bind(project).bind(user).bind(user).bind(agent).bind(agent).fetch_all(self.inner.repo.0.pool()).await?;
        let runs = self.inner.runs.lock().unwrap();
        for id in ids {
            if let Some(token) = runs.get(&id) {
                token.cancel();
            }
        }
        Ok(())
    }

    pub async fn approve(&self, user: i64, project: &str, id: &str, value: Value) -> AppResult<()> {
        let count:i64=sqlx::query_scalar("SELECT count(*) FROM agent_tool_calls t JOIN agent_runs r ON r.id=t.run_id WHERE t.id=? AND r.user_id=? AND r.project_id=? AND t.state='waiting'")
            .bind(id).bind(user).bind(project).fetch_one(self.inner.repo.0.pool()).await?;
        if count == 0 {
            return Err(AppError::NotFound);
        }
        let sender = self
            .inner
            .approvals
            .lock()
            .unwrap()
            .remove(id)
            .ok_or(AppError::Conflict)?;
        sender.send(value).map_err(|_| AppError::Conflict)
    }

    async fn finish(&self, ctx: &RunContext, result: AppResult<String>, cancelled: bool) {
        let (state, error, answer) = match result {
            Ok(text) => ("completed", String::new(), text),
            Err(error) => (
                if cancelled { "cancelled" } else { "failed" },
                error.to_string(),
                String::new(),
            ),
        };
        if let Err(error) = self.inner.repo.state(&ctx.run.id, state, &error).await {
            tracing::error!(%error, "persist agent completion");
        }
        if state != "completed" {
            let _=sqlx::query("UPDATE agent_runs SET state='interrupted',error='Parent execution ended',finished_at=? WHERE parent_id=? AND state IN ('queued','running','waiting')").bind(now()).bind(&ctx.run.id).execute(self.inner.repo.0.pool()).await;
        }
        let children: Vec<String> =
            sqlx::query_scalar("SELECT id FROM agent_runs WHERE parent_id=?")
                .bind(&ctx.run.id)
                .fetch_all(self.inner.repo.0.pool())
                .await
                .unwrap_or_default();
        for id in children {
            if let Some(token) = self.inner.runs.lock().unwrap().remove(&id) {
                token.cancel();
            }
            self.inner.drafts.lock().unwrap().remove(&id);
            if let Ok(run) = self
                .inner
                .repo
                .get_run(ctx.user_id, &ctx.project_id, &id)
                .await
            {
                self.event(ctx, "run", json!(run));
            }
        }
        let pending:Vec<String>=sqlx::query_scalar("SELECT t.id FROM agent_tool_calls t JOIN agent_runs r ON r.id=t.run_id WHERE (r.id=? OR r.parent_id=?) AND t.state IN ('pending','running','waiting')").bind(&ctx.run.id).bind(&ctx.run.id).fetch_all(self.inner.repo.0.pool()).await.unwrap_or_default();
        for id in pending {
            self.inner.approvals.lock().unwrap().remove(&id);
        }
        let _=sqlx::query("UPDATE agent_tool_calls SET state='interrupted' WHERE run_id IN (SELECT id FROM agent_runs WHERE id=? OR parent_id=?) AND state IN ('pending','running','waiting')").bind(&ctx.run.id).bind(&ctx.run.id).execute(self.inner.repo.0.pool()).await;
        let _=sqlx::query("UPDATE agent_model_calls SET finish='interrupted' WHERE run_id IN (SELECT id FROM agent_runs WHERE id=? OR parent_id=?) AND finish='pending'").bind(&ctx.run.id).bind(&ctx.run.id).execute(self.inner.repo.0.pool()).await;
        self.inner.runs.lock().unwrap().remove(&ctx.run.id);
        self.inner.drafts.lock().unwrap().remove(&ctx.run.id);
        if !error.is_empty() {
            let id = new_id();
            let message = json!({"id":id,"chatId":ctx.run.chat_id,"tophId":ctx.agent.id,"sessionId":ctx.run.session_id,"role":"error","content":error,"status":"error","createdAt":now()});
            // Display failures separately; they are not model-authored answers.
            self.event(ctx, "error", message);
        }
        self.event(ctx,"run",json!({"id":ctx.run.id,"chatId":ctx.run.chat_id,"sessionId":ctx.run.session_id,"agentId":ctx.agent.id,"state":state,"error":error,"parentId":ctx.run.parent_id,"createdAt":ctx.run.created_at,"finishedAt":now()}));
        let terminal_kind = if state == "completed" {
            event::kind::RUN_COMPLETED
        } else {
            event::kind::RUN_FAILED
        };
        let _ = self
            .inner
            .repo
            .append_event(
                ctx,
                terminal_kind,
                json!({"state": state, "error": error, "answer": answer.clone()}),
            )
            .await;
        if state == "completed" && ctx.depth == 0 {
            if let Some(handler) = self.inner.on_complete.read().unwrap().as_ref() {
                handler(CompletionNotice {
                    project_id: ctx.project_id.clone(),
                    chat_id: ctx.run.chat_id.clone(),
                    session_id: ctx.run.session_id.clone(),
                    agent_id: ctx.agent.id.clone(),
                    agent_name: ctx.agent.name.clone(),
                    agent_role: ctx.agent.role.clone(),
                    text: answer,
                });
            }
        }
    }

    /// Runs one turn on an external CLI. The CLI owns the agent loop; Toph owns
    /// the context, the gateway tools and the approvals.
    async fn execute_cli(
        &self,
        ctx: &RunContext,
        config: &AiConfig,
        cancel: &CancellationToken,
    ) -> AppResult<String> {
        self.inner.repo.state(&ctx.run.id, "running", "").await?;
        self.event(ctx,"run",json!({"id":ctx.run.id,"chatId":ctx.run.chat_id,"sessionId":ctx.run.session_id,"agentId":ctx.agent.id,"state":"running","error":"","parentId":ctx.run.parent_id,"createdAt":ctx.run.created_at}));
        let mut system = self.build_system(ctx, config).await?;
        let gateway_tools = tools::gateway_definitions(&ctx.agent);
        let available = gateway_tools
            .iter()
            .filter_map(|tool| tool["name"].as_str())
            .map(|name| format!("`toph_{name}`"))
            .collect::<Vec<_>>()
            .join(", ");
        system.push_str(&format!(
            "\n\n## Ferramentas\n\
Você está rodando via OpenCode. As ferramentas embutidas da CLI estão desligadas. \
Suas únicas ferramentas são as do gateway Toph: {available}. \
Use-as para ler, editar e rodar comandos. Não diga que usou uma ferramenta que não chamou. \
Trabalhe no projeto atual. Para concluir uma alteração, rode os testes ou o build com `toph_shell` e mostre o resultado."
        ));
        let model = cli::opencode_model(&ctx.agent, config);
        let (gateway_url, gateway_task) =
            Gateway::start(self.clone(), ctx.clone(), gateway_tools, cancel.clone()).await?;
        let prompt = self.cli_transcript(ctx).await?;
        let work = std::env::temp_dir().join(format!("toph-cli-{}", ctx.run.id));
        let _ = tokio::fs::remove_dir_all(&work).await;
        tokio::fs::create_dir_all(&work).await?;
        let mid = format!("{}-engine", ctx.run.id);
        let display = json!({"id":mid,"userId":ctx.user_id,"projectId":ctx.project_id,"chatId":ctx.run.chat_id,"tophId":ctx.agent.id,"sessionId":ctx.run.session_id,"model":model,"agentMode":ctx.agent.agent_mode,"role":"assistant","content":"","status":"running","createdAt":now()});
        self.inner
            .drafts
            .lock()
            .unwrap()
            .insert(ctx.run.id.clone(), display.clone());
        self.event(ctx, "message", display.clone());
        let runtime = self.clone();
        let live_ctx = ctx.clone();
        let mut draft = display.clone();
        let mut full = String::new();
        let mut last_event = Instant::now();
        let started = Instant::now();
        let result = {
            let mut on_text = |chunk: &str| {
                let offset = full.encode_utf16().count();
                full.push_str(chunk);
                if let Value::String(content) = &mut draft["content"] {
                    content.push_str(chunk);
                }
                if last_event.elapsed() >= Duration::from_millis(80) {
                    runtime
                        .inner
                        .drafts
                        .lock()
                        .unwrap()
                        .insert(live_ctx.run.id.clone(), draft.clone());
                    runtime.event(
                        &live_ctx,
                        "delta",
                        json!({"id":draft["id"],"offset":offset,"text":chunk}),
                    );
                    last_event = Instant::now();
                }
            };
            cli::run_opencode(
                &model,
                &system,
                &prompt,
                &gateway_url,
                &work,
                cancel,
                &mut on_text,
            )
            .await
        };
        gateway_task.abort();
        let _ = tokio::fs::remove_dir_all(&work).await;
        self.inner.drafts.lock().unwrap().remove(&ctx.run.id);
        let (text, usage) = result?;
        if text.trim().is_empty() {
            return Err(bad_request("O OpenCode terminou sem resposta."));
        }
        let mut done = display;
        done["content"] = json!(text);
        done["status"] = json!("complete");
        let seq = self
            .inner
            .repo
            .message(
                ctx,
                &mid,
                json!({"role":"assistant","content":text}),
                done.clone(),
            )
            .await?;
        done["seq"] = json!(seq);
        self.event(ctx, "message", done);
        let _ = sqlx::query(
            "INSERT INTO agent_model_calls(id,run_id,kind,provider,model,input_tokens,output_tokens,cached_tokens,reasoning_tokens,estimated_input,duration_ms,finish,created_at) VALUES(?,?,?,?,?,?,?,?,0,0,?,'stop',?)",
        )
        .bind(new_id())
        .bind(&ctx.run.id)
        .bind("engine")
        .bind("opencode")
        .bind(&model)
        .bind(usage.input)
        .bind(usage.output)
        .bind(usage.cached)
        .bind(started.elapsed().as_millis() as i64)
        .bind(now())
        .execute(self.inner.repo.0.pool())
        .await;
        Ok(text)
    }

    /// Compact transcript for the CLI. Tool output already went through the
    /// gateway; replaying it would only burn context. The model can search the
    /// full history with `toph_search_history`.
    async fn cli_transcript(&self, ctx: &RunContext) -> AppResult<String> {
        let rows = sqlx::query(
            "SELECT role,content_text FROM agent_messages WHERE session_id=? AND role IN ('user','assistant') AND content_text<>'' AND id NOT LIKE 'import-%' ORDER BY seq DESC LIMIT 12",
        )
        .bind(&ctx.run.session_id)
        .fetch_all(self.inner.repo.0.pool())
        .await?;
        let mut blocks = rows
            .into_iter()
            .rev()
            .map(|row| {
                let role: String = row.get("role");
                let text: String = row.get("content_text");
                let text = text.chars().take(2_500).collect::<String>();
                format!("[{role}]\n{text}")
            })
            .collect::<Vec<_>>();
        if blocks.is_empty() {
            blocks.push(format!("[user]\n{}", ctx.request));
        }
        blocks.push(
            "Responda à última mensagem do usuário. Use as ferramentas toph_* para ler, editar e rodar comandos; não use ferramentas embutidas da CLI. Se precisar de contexto antigo, use toph_search_history em vez de adivinhar.".into(),
        );
        Ok(blocks.join("\n\n"))
    }

    async fn build_system(&self, ctx: &RunContext, config: &AiConfig) -> AppResult<String> {
        let mut extra = config.system_prompt.clone();
        if !ctx.chat_description.is_empty() {
            extra.push_str("\nContexto compartilhado do chat:\n");
            extra.push_str(&ctx.chat_description);
        }
        if !ctx.agent.skills.is_empty() {
            let selected = super::skills::enabled(&ctx.root, &ctx.agent.skills);
            if !selected.is_empty() {
                extra.push_str(
                    "\nSkills habilitadas (use toph_read_skill antes de agir no domínio delas):\n",
                );
                for skill in selected {
                    extra.push_str(&format!("- {}: {}\n", skill.id, skill.description));
                }
            }
        }
        match self.inner.tools.workspace.read(&ctx.root, "AGENTS.md") {
            Ok(file) => {
                if file.content.len() > 12000 {
                    return Err(bad_request("AGENTS.md exceeds the instruction budget"));
                }
                extra.push_str("\nProject instructions:\n");
                extra.push_str(&file.content);
            }
            Err(AppError::NotFound) => {}
            Err(AppError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        Ok(context::instructions(
            &ctx.agent,
            &ctx.roster,
            &ctx.root.display().to_string(),
            &extra,
            &config.model,
            &config.connection_name(),
            &config.provider,
        ))
    }

    /// Executes one tool call coming from the external CLI through the local
    /// MCP gateway. It uses the same approvals and tool implementations as the
    /// rest of the app.
    pub(crate) async fn gateway_call(
        &self,
        ctx: &RunContext,
        call_id: &str,
        name: &str,
        args: Value,
        cancel: &CancellationToken,
    ) -> AppResult<Value> {
        let tid = new_id();
        let call_id = if call_id.trim().is_empty() {
            tid.clone()
        } else {
            call_id.to_string()
        };
        let label = activity::tool_activity(name, &args);
        let tool_display = json!({"id":tid,"chatId":ctx.run.chat_id,"tophId":ctx.agent.id,"sessionId":ctx.run.session_id,"role":"tool","title":name,"activity":label,"phase":"engine","content":args.to_string(),"status":"running","createdAt":now()});
        sqlx::query("INSERT INTO agent_tool_calls(id,run_id,call_id,name,arguments,state,created_at) VALUES(?,?,?,?,?,'pending',?)")
            .bind(&tid).bind(&ctx.run.id).bind(&call_id).bind(name).bind(args.to_string()).bind(now()).execute(self.inner.repo.0.pool()).await?;
        self.event(ctx, "message", tool_display.clone());
        let allowed = if tools::needs_permission(name) && ctx.agent.permission_mode == "ask" {
            self.permission(ctx, &tid, name, &args, cancel).await?
        } else {
            true
        };
        sqlx::query("UPDATE agent_tool_calls SET state='running' WHERE id=?")
            .bind(&tid)
            .execute(self.inner.repo.0.pool())
            .await?;
        let result = if !allowed {
            Err(bad_request("Tool rejected by the user"))
        } else {
            tokio::select! {
                _=cancel.cancelled()=>Err(bad_request("Execution cancelled")),
                result=self.inner.tools.execute(ctx,name,&args)=>result,
            }
        };
        let failed = result.is_err();
        let result = match result {
            Ok(value) => value,
            Err(error) => json!({"error":error.to_string()}),
        };
        if !failed
            && matches!(
                name,
                "write_file" | "edit_file" | "delete_file" | "generate_image"
            )
        {
            self.inner
                .repo
                .append_event(
                    ctx,
                    event::kind::EDIT_APPLIED,
                    json!({
                        "path": args["path"]
                            .as_str()
                            .or_else(|| args["filename"].as_str())
                            .unwrap_or(""),
                        "tool": name,
                    }),
                )
                .await?;
        }
        if !failed && tools::mutating(name) {
            self.inner
                .workspace_events
                .publish(&ctx.project_id, "files", None);
        }
        sqlx::query("UPDATE agent_tool_calls SET state=?,result=? WHERE id=?")
            .bind(if failed { "failed" } else { "completed" })
            .bind(result.to_string())
            .bind(&tid)
            .execute(self.inner.repo.0.pool())
            .await?;
        let mut display = tool_display;
        display["content"] = json!(result.to_string());
        display["detail"] = json!(json!({"input":args,"output":result}).to_string());
        display["status"] = json!(if failed { "error" } else { "complete" });
        let seq = self
            .inner
            .repo
            .message(
                ctx,
                &tid,
                json!({"role":"tool","name":name,"content":result.to_string()}),
                display.clone(),
            )
            .await?;
        display["seq"] = json!(seq);
        self.event(ctx, "message", display);
        Ok(result)
    }

    async fn permission(
        &self,
        ctx: &RunContext,
        id: &str,
        name: &str,
        args: &Value,
        cancel: &CancellationToken,
    ) -> AppResult<bool> {
        let (sender, receiver) = oneshot::channel();
        self.inner
            .approvals
            .lock()
            .unwrap()
            .insert(id.into(), sender);
        sqlx::query("UPDATE agent_tool_calls SET state='waiting' WHERE id=?")
            .bind(id)
            .execute(self.inner.repo.0.pool())
            .await?;
        self.inner.repo.state(&ctx.run.id, "waiting", "").await?;
        self.event(ctx,"approval",json!({"id":id,"runId":ctx.run.id,"agentId":ctx.agent.id,"name":name,"arguments":args.to_string()}));
        let result = tokio::select! {_=cancel.cancelled()=>Err(bad_request("Execution cancelled")),result=receiver=>result.map_err(|_|bad_request("Approval cancelled"))};
        self.inner.approvals.lock().unwrap().remove(id);
        self.inner.repo.state(&ctx.run.id, "running", "").await?;
        self.event(ctx, "approval.resolved", json!({"id":id}));
        Ok(result?["approved"].as_bool() == Some(true))
    }
}
