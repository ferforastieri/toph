use super::{
    activity, cli, event,
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
use futures_util::future::BoxFuture;
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

/// One earlier answer from the same group turn. Group members run in sequence
/// so the next Toph can see the work that already exists; this is the minimal
/// handoff, not a rebuilt conversation history.
#[derive(Clone, Debug)]
struct PeerReply {
    handle: String,
    text: String,
    failed: bool,
}

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
    skills: super::skill_service::Service,
    ai: AiService,
    events: broadcast::Sender<AgentEvent>,
    workspace_events: EventHub,
    runs: Mutex<HashMap<String, CancellationToken>>,
    approvals: Mutex<HashMap<String, oneshot::Sender<Value>>>,
    drafts: Mutex<HashMap<String, Value>>,
    sessions: Mutex<super::session_manager::Sessions>,
    on_complete: RwLock<Option<CompletionHandler>>,
}

#[derive(Clone)]
pub struct Runtime {
    inner: Arc<Inner>,
}

fn mentioned_agents(text: &str, roster: &[AgentSpec], exclude: &str) -> Vec<AgentSpec> {
    let mut found: Vec<AgentSpec> = Vec::new();
    for word in text.split_whitespace() {
        if !word.starts_with('@') {
            continue;
        }
        let handle = word
            .trim_start_matches('@')
            .trim_end_matches(|c: char| !c.is_alphanumeric() && c != '-' && c != '_');
        if let Some(agent) = roster
            .iter()
            .find(|agent| agent.id != exclude && agent.handle.eq_ignore_ascii_case(handle))
        {
            if !found.iter().any(|seen| seen.id == agent.id) {
                found.push(agent.clone());
            }
        }
    }
    found
}

const MAX_ROUTED: usize = 2;
const MAX_MENTIONS: usize = 3;

#[derive(Clone, Debug, Default)]
struct RouteChoice {
    handles: Vec<String>,
    everyone: bool,
    reason: String,
}

/// The router replies with JSON; models sometimes wrap it in a fence.
fn parse_route(text: &str) -> Option<RouteChoice> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    let value = serde_json::from_str::<Value>(&text[start..=end]).ok()?;
    let handles = value
        .get("handles")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(|handle| {
                    handle
                        .trim()
                        .trim_start_matches('@')
                        .trim_matches(|c: char| !c.is_alphanumeric() && c != '-' && c != '_')
                        .to_lowercase()
                })
                .filter(|handle| !handle.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let everyone = value.get("todos").and_then(Value::as_bool).unwrap_or(false)
        || value
            .get("everyone")
            .and_then(Value::as_bool)
            .unwrap_or(false);
    let reason = value
        .get("reason")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .chars()
        .take(120)
        .collect();
    Some(RouteChoice {
        handles,
        everyone,
        reason,
    })
}

/// The handoff screen replies with JSON; models sometimes wrap it in a fence.
fn parse_handles(text: &str) -> Vec<String> {
    let Some(start) = text.find('{') else {
        return Vec::new();
    };
    let Some(end) = text.rfind('}') else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&text[start..=end]) else {
        return Vec::new();
    };
    value
        .get("handles")
        .and_then(Value::as_array)
        .map(|handles| {
            handles
                .iter()
                .filter_map(Value::as_str)
                .map(|handle| {
                    handle
                        .trim()
                        .trim_start_matches('@')
                        .trim_matches(|c: char| !c.is_alphanumeric() && c != '-' && c != '_')
                        .to_lowercase()
                })
                .filter(|handle| !handle.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

impl Runtime {
    pub async fn new(store: Store, tools: Tools, workspace_events: EventHub) -> AppResult<Self> {
        let skills = super::skill_service::Service::new(store.clone());
        let repo = Repository(store);
        repo.recover().await?;
        repo.backfill_events().await?;
        let (events, _) = broadcast::channel(256);
        let runtime = Self {
            inner: Arc::new(Inner {
                ai: tools.ai.clone(),
                repo,
                tools,
                skills,
                events,
                workspace_events,
                runs: Mutex::new(HashMap::new()),
                approvals: Mutex::new(HashMap::new()),
                drafts: Mutex::new(HashMap::new()),
                sessions: Mutex::new(super::session_manager::Sessions::default()),
                on_complete: RwLock::new(None),
            }),
        };
        // Profiles written before managed skills had a per-agent list of
        // project skill ids. Turn each one into a real managed skill so the
        // old toggle keeps working and appears on the Skills screen.
        runtime.migrate_legacy_skills().await?;
        Ok(runtime)
    }

    async fn migrate_legacy_skills(&self) -> AppResult<()> {
        let rows = sqlx::query("SELECT id, project_id, config FROM agent_profiles")
            .fetch_all(self.inner.repo.0.pool())
            .await?;
        for row in rows {
            let raw: String = row.get("config");
            let config: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
            let ids: Vec<String> = config
                .get("skills")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect()
                })
                .unwrap_or_default();
            if ids.is_empty() {
                continue;
            }
            let project_id: String = row.get("project_id");
            let agent_id: String = row.get("id");
            let Ok(project) = self.inner.repo.0.project(&project_id).await else {
                continue;
            };
            let root = std::path::Path::new(&project.root);
            for skill in super::skills::enabled(root, &ids) {
                let Ok(body) = super::skills::read(&self.inner.tools.workspace, root, &skill.id)
                else {
                    continue;
                };
                let source = if skill.is_builtin() {
                    None
                } else {
                    Some(root.join(&skill.path).display().to_string())
                };
                if let Err(error) = self
                    .inner
                    .skills
                    .ensure_legacy(
                        &project_id,
                        &agent_id,
                        &skill.name,
                        &skill.description,
                        &body,
                        source.as_deref(),
                    )
                    .await
                {
                    tracing::warn!(%error, project = %project_id, skill = %skill.name, "legacy skill migration failed");
                }
            }
        }
        Ok(())
    }

    pub fn repository(&self) -> &Repository {
        &self.inner.repo
    }

    pub fn tools(&self) -> &Tools {
        &self.inner.tools
    }

    pub fn skills(&self) -> super::skill_service::Service {
        self.inner.skills.clone()
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
        // A new message supersedes any run still active in this chat. Waiting
        // for the cancellation keeps the new user bubble after the previous
        // run's final output instead of above it.
        let active: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM agent_runs WHERE user_id=? AND project_id=? AND chat_id=? AND state IN ('queued','running','waiting')",
        )
        .bind(user)
        .bind(project)
        .bind(&input.chat_id)
        .fetch_all(self.inner.repo.0.pool())
        .await?;
        if !active.is_empty() {
            {
                let runs = self.inner.runs.lock().unwrap();
                for id in &active {
                    if let Some(token) = runs.get(id) {
                        token.cancel();
                    }
                }
            }
            for _ in 0..50 {
                let remaining: i64 = sqlx::query_scalar::<_, i64>(
                    "SELECT COUNT(*) FROM agent_runs WHERE user_id=? AND project_id=? AND chat_id=? AND state IN ('queued','running','waiting')",
                )
                .bind(user)
                .bind(project)
                .bind(&input.chat_id)
                .fetch_one(self.inner.repo.0.pool())
                .await?;
                if remaining == 0 {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
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
        let RunInput {
            request_id,
            chat_id,
            chat_description,
            text,
            agent_id,
            session_id,
            agents,
            attachments,
        } = input;
        let mut roster = agents;
        let (mut responders, routing_reason) = if agent_id.is_empty() || agent_id == "router" {
            self.route_agents(user, project, &chat_id, &roster, &text)
                .await?
        } else {
            (
                vec![roster
                    .iter()
                    .find(|agent| agent.id == agent_id)
                    .cloned()
                    .ok_or_else(|| bad_request("Unknown agent"))?],
                "menção explícita".to_string(),
            )
        };
        let silent = responders.is_empty();
        if silent {
            // The user message still belongs in the timeline. The first Toph
            // owns that visible bubble without being asked to answer it.
            responders.push(roster[0].clone());
        }
        // Resolve every responder's model before opening any session, so the
        // roster written to the database already carries the migrated models.
        for responder in &mut responders {
            responder.model = self.inner.ai.migrate_agent_model(&responder.model).await?;
            if let Some(selected) = roster.iter_mut().find(|item| item.id == responder.id) {
                *selected = responder.clone();
            }
        }
        let project_row = self.inner.repo.0.project(project).await?;
        let root = self
            .inner
            .tools
            .workspace
            .validate_root(std::path::Path::new(&project_row.root))?;
        self.inner.repo.profiles(user, project, &roster).await?;
        let routed_ids = responders
            .iter()
            .map(|agent| agent.id.clone())
            .collect::<Vec<_>>();

        let mut primary: Option<Run> = None;
        // Group members answer in sequence. Each one receives only the direct
        // answers produced for this same user message, so it can build on the
        // previous work without replaying a reconstructed conversation.
        let mut previous: Option<tokio::task::JoinHandle<Vec<PeerReply>>> = None;
        for (index, responder) in responders.into_iter().enumerate() {
            let primary_responder = index == 0;
            let config = match self.inner.ai.resolve(&responder.model).await {
                Ok(config) => config,
                Err(error) if !primary_responder => {
                    tracing::warn!(%error, agent = %responder.handle, "secondary responder has no usable model");
                    continue;
                }
                Err(error) => return Err(error),
            };
            let mut session = self
                .inner
                .repo
                .session(
                    user,
                    project,
                    &responder,
                    if primary_responder {
                        session_id.as_deref()
                    } else {
                        None
                    },
                )
                .await?;
            // Layouts created before the single-conversation migration kept
            // the active session under an old individual chat id. Moving it to
            // the current chat makes its history visible and keeps new runs there.
            if session.chat_id != responder.chat_id {
                sqlx::query(
                    "UPDATE agent_sessions SET chat_id=? WHERE id=? AND user_id=? AND project_id=?",
                )
                .bind(&responder.chat_id)
                .bind(&session.id)
                .bind(user)
                .bind(project)
                .execute(self.inner.repo.0.pool())
                .await?;
                session.chat_id = responder.chat_id.clone();
            }
            // Reserve admission before any run is committed; never queue without a bound.
            let token = CancellationToken::new();
            let admission = new_id();
            {
                let mut runs = self.inner.runs.lock().unwrap();
                if runs.len() >= 16 {
                    if primary_responder {
                        return Err(AppError::RateLimited);
                    }
                    break;
                }
                runs.insert(admission.clone(), token.clone());
            }
            let run_request_id = if primary_responder {
                request_id.clone()
            } else {
                format!("{}-{}", request_id, responder.id)
            };
            let created = self
                .inner
                .repo
                .create_run(user, project, &session, &run_request_id, None, &responder)
                .await;
            self.inner.runs.lock().unwrap().remove(&admission);
            let run = match created {
                Ok(run) => run,
                Err(AppError::Conflict) => {
                    if primary_responder {
                        if let Some(run) = self
                            .inner
                            .repo
                            .request_run(user, project, &request_id)
                            .await?
                        {
                            return Ok(run);
                        }
                        return Err(AppError::Conflict);
                    }
                    continue;
                }
                Err(error) => {
                    if primary_responder {
                        return Err(error);
                    }
                    tracing::warn!(%error, agent = %responder.handle, "secondary responder could not start");
                    continue;
                }
            };
            self.inner
                .runs
                .lock()
                .unwrap()
                .insert(run.id.clone(), token.clone());
            let skills = self.inner.skills.for_agent(project, &responder.id).await?;
            let ctx = RunContext {
                run: run.clone(),
                user_id: user,
                project_id: project.into(),
                root: root.clone(),
                agent: responder,
                roster: roster.clone(),
                skills,
                chat_description: chat_description.clone(),
                depth: 0,
                secondary: !primary_responder,
                routed: routed_ids.clone(),
                silent: silent && primary_responder,
                routing_reason: routing_reason.clone(),
                request: text.clone(),
            };
            let runtime = self.clone();
            let run_text = text.clone();
            let run_attachments = attachments.clone();
            let prior = previous.take();
            let handle = tokio::spawn(async move {
                let mut ctx = ctx;
                let mut answers = match prior {
                    Some(prior) => prior.await.unwrap_or_default(),
                    None => Vec::new(),
                };
                let replies = answers
                    .iter()
                    .filter(|reply| !reply.failed && !reply.text.trim().is_empty())
                    .collect::<Vec<_>>();
                if !replies.is_empty() {
                    let mut prompt = format!("Mensagem do usuário no grupo:\n{run_text}\n\n");
                    for reply in replies {
                        prompt.push_str(&format!(
                            "Resposta de @{} nesta mesma mensagem:\n{}\n\n",
                            reply.handle, reply.text
                        ));
                    }
                    prompt.push_str(
                        "Faça a sua parte na resposta ao usuário a partir daqui. Complemente ou revise o que já foi respondido; não repita o que já foi dito.",
                    );
                    ctx.request = prompt;
                }
                let preparation = runtime.prepare(&ctx, &run_text, &run_attachments).await;
                // A silent route stores the person's message and deliberately
                // starts no model turn.
                if ctx.silent {
                    let result = preparation.map(|_| String::new());
                    runtime.finish(&ctx, result, token.is_cancelled()).await;
                    return answers;
                }
                // A run ends when it finishes or when the user cancels it. There is
                // no wall-clock cap: long browser sessions and refactors are legit.
                let result = match preparation {
                    Ok(()) => {
                        runtime
                            .execute_cli(&ctx, &config, &token, &run_attachments)
                            .await
                    }
                    Err(error) => Err(error),
                };
                answers.push(PeerReply {
                    handle: ctx.agent.handle.clone(),
                    text: result
                        .as_ref()
                        .map(|text| text.chars().take(8_000).collect())
                        .unwrap_or_default(),
                    failed: result.is_err(),
                });
                if let Ok(text) = &result {
                    if !token.is_cancelled() {
                        runtime.auto_handoff(&ctx, text, &token).await;
                    }
                }
                runtime.finish(&ctx, result, token.is_cancelled()).await;
                answers
            });
            previous = Some(handle);
            if primary_responder {
                primary = Some(run);
            }
        }
        primary.ok_or_else(|| bad_request("No Toph could start this task"))
    }

    /// Chooses the Tophs that answer. An explicit @handle wins; otherwise the
    /// router returns a small JSON plan: zero to two handles, or everyone for
    /// a message addressed to the whole group. Nobody owns the group: the
    /// choice belongs to each message.
    async fn route_agents(
        &self,
        user: i64,
        project: &str,
        chat: &str,
        roster: &[AgentSpec],
        text: &str,
    ) -> AppResult<(Vec<AgentSpec>, String)> {
        if roster.is_empty() {
            return Err(bad_request("Nenhum Toph nesta conversa."));
        }
        let mentioned = mentioned_agents(text, roster, "");
        if !mentioned.is_empty() {
            return Ok((
                mentioned.into_iter().take(MAX_MENTIONS).collect(),
                "menção explícita".into(),
            ));
        }
        if roster.len() == 1 {
            return Ok((vec![roster[0].clone()], String::new()));
        }
        let team = roster
            .iter()
            .map(|agent| {
                let mut line = format!(
                    "@{} — {} — {}",
                    agent.handle,
                    agent.role,
                    agent.description.chars().take(180).collect::<String>()
                );
                if !agent.tools.is_empty() {
                    line.push_str(&format!(
                        " · ferramentas: {}",
                        agent
                            .tools
                            .iter()
                            .take(12)
                            .cloned()
                            .collect::<Vec<_>>()
                            .join(", ")
                    ));
                }
                if !agent.mcp_servers.is_empty() {
                    line.push_str(&format!(
                        " · MCPs: {}",
                        agent
                            .mcp_servers
                            .iter()
                            .take(12)
                            .cloned()
                            .collect::<Vec<_>>()
                            .join(", ")
                    ));
                }
                line
            })
            .collect::<Vec<_>>()
            .join("\n");
        let recent = self
            .inner
            .repo
            .recent_chat(user, project, chat, 8, None)
            .await
            .unwrap_or_default();
        let history = recent
            .iter()
            .map(|(role, toph_id, text)| {
                let name = if role == "user" {
                    "Usuário".to_string()
                } else {
                    roster
                        .iter()
                        .find(|agent| agent.id == *toph_id)
                        .map(|agent| agent.name.clone())
                        .unwrap_or_else(|| "Toph".into())
                };
                format!("[{name}] {text}")
            })
            .collect::<Vec<_>>()
            .join("\n");
        let messages = vec![
            crate::ai::Message {
                role: "system".into(),
                content: json!(r#"Você decide quais Tophs de um grupo devem responder à última mensagem do usuário. Responda SOMENTE com JSON, sem texto em volta, no formato {"handles": ["..."], "todos": false, "reason": "..."}:
- "handles": de 0 a 2 handles, só da lista de Tophs; prefira 1.
- "todos": true quando a mensagem é para o grupo todo (um cumprimento, "pessoal", uma pergunta para todos, uma apresentação): nesse caso todos os Tophs respondem.
- "reason": um motivo de até 12 palavras, em português.
Se a mensagem depender de uma ferramenta ou MCP, prefira quem tem acesso a ele; se ninguém tiver, escolha pelo papel. Um cumprimento nunca fica sem resposta. Deixe a lista vazia apenas quando ninguém precisa responder: um agradecimento, um recado, uma conversa já encerrada."#),
            },
            crate::ai::Message {
                role: "user".into(),
                content: json!(format!(
                    "Tophs do grupo:\n{team}\n\nConversa recente:\n{history}\n\nMensagem:\n{text}\n\nQuem responde?"
                )),
            },
        ];
        let answer = match tokio::time::timeout(
            Duration::from_secs(20),
            self.inner.ai.chat(messages, None, None, None, vec![]),
        )
        .await
        {
            Ok(Ok(answer)) => answer,
            _ => return Ok((vec![roster[0].clone()], String::new())),
        };
        let Some(choice) = parse_route(&answer) else {
            return Ok((vec![roster[0].clone()], String::new()));
        };
        let mut picked: Vec<AgentSpec> = if choice.everyone {
            roster.to_vec()
        } else {
            choice
                .handles
                .iter()
                .filter_map(|handle| {
                    roster.iter().find(|agent| {
                        agent.handle.eq_ignore_ascii_case(handle)
                            || agent.name.eq_ignore_ascii_case(handle)
                    })
                })
                .cloned()
                .collect()
        };
        let mut seen = std::collections::HashSet::new();
        picked.retain(|agent| seen.insert(agent.id.clone()));
        if !choice.everyone {
            picked.truncate(MAX_ROUTED);
        }
        tracing::info!(
            handles = ?picked.iter().map(|agent| agent.handle.as_str()).collect::<Vec<_>>(),
            reason = %choice.reason,
            "routed group message"
        );
        Ok((picked, choice.reason))
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
        let visible = ctx.depth == 0 && !ctx.secondary;
        let display = json!({"id":id,"chatId":ctx.run.chat_id,"tophId":ctx.agent.id,"sessionId":ctx.run.session_id,"runId":ctx.run.id,"model":ctx.agent.model,"agentMode":ctx.agent.agent_mode,"role":if ctx.depth==0{"user"}else{"system"},"content":if ctx.depth==0{text.to_owned()}else{format!("Tarefa para @{}: {}",ctx.agent.handle,text)},"status":"complete","createdAt":now(),"hidden":!visible});
        let seq = self
            .inner
            .repo
            .message(ctx, &id, body, display.clone())
            .await?;
        let mut display = display;
        display["seq"] = json!(seq);
        if visible {
            self.event(ctx, "message", display);
        }
        if ctx.depth == 0 && !ctx.secondary && (ctx.silent || ctx.routed.len() > 1) {
            let names = ctx
                .roster
                .iter()
                .filter(|agent| ctx.routed.iter().any(|id| id == &agent.id))
                .map(|agent| agent.name.clone())
                .collect::<Vec<_>>();
            let why = if ctx.routing_reason.is_empty() {
                String::new()
            } else {
                format!(" · {}", ctx.routing_reason)
            };
            let text = if ctx.silent {
                format!("Ninguém precisa responder{why}")
            } else {
                format!("Chamei {}{why}", names.join(" e "))
            };
            let note_id = new_id();
            let note = json!({"id":note_id,"chatId":ctx.run.chat_id,"tophId":ctx.agent.id,"sessionId":ctx.run.session_id,"runId":ctx.run.id,"role":"system","content":text,"status":"complete","createdAt":now()});
            let seq = self
                .inner
                .repo
                .message(
                    ctx,
                    &note_id,
                    json!({"role":"system","content":text}),
                    note.clone(),
                )
                .await?;
            let mut note = note;
            note["seq"] = json!(seq);
            self.event(ctx, "message", note);
        }
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

    /// Removes a task's runs, messages and sessions. The Tophs are global and
    /// stay in the project, so their profiles are not touched.
    /// The in-memory harness sessions for that chat are dropped too.
    pub async fn delete_chat(&self, user: i64, project: &str, chat: &str) -> AppResult<()> {
        let session_ids: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM agent_sessions WHERE user_id=? AND project_id=? AND chat_id=?",
        )
        .bind(user)
        .bind(project)
        .bind(chat)
        .fetch_all(self.inner.repo.0.pool())
        .await?;
        let active: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM agent_runs WHERE user_id=? AND project_id=? AND chat_id=? AND state IN ('queued','running','waiting')",
        )
        .bind(user)
        .bind(project)
        .bind(chat)
        .fetch_all(self.inner.repo.0.pool())
        .await?;
        {
            let runs = self.inner.runs.lock().unwrap();
            for id in &active {
                if let Some(token) = runs.get(id) {
                    token.cancel();
                }
            }
        }
        let mut tx = self.inner.repo.0.pool().begin().await?;
        for statement in [
            "DELETE FROM agent_tool_calls WHERE run_id IN (SELECT id FROM agent_runs WHERE user_id=? AND project_id=? AND chat_id=?)",
            "DELETE FROM agent_model_calls WHERE run_id IN (SELECT id FROM agent_runs WHERE user_id=? AND project_id=? AND chat_id=?)",
            "DELETE FROM agent_artifacts WHERE run_id IN (SELECT id FROM agent_runs WHERE user_id=? AND project_id=? AND chat_id=?)",
            "DELETE FROM agent_events WHERE session_id IN (SELECT id FROM agent_sessions WHERE user_id=? AND project_id=? AND chat_id=?)",
            "DELETE FROM agent_messages WHERE session_id IN (SELECT id FROM agent_sessions WHERE user_id=? AND project_id=? AND chat_id=?)",
            "DELETE FROM agent_checkpoints WHERE session_id IN (SELECT id FROM agent_sessions WHERE user_id=? AND project_id=? AND chat_id=?)",
            "DELETE FROM agent_session_state WHERE session_id IN (SELECT id FROM agent_sessions WHERE user_id=? AND project_id=? AND chat_id=?)",
            "DELETE FROM agent_runs WHERE user_id=? AND project_id=? AND chat_id=?",
            "DELETE FROM agent_sessions WHERE user_id=? AND project_id=? AND chat_id=?",
            "DELETE FROM bot_messages WHERE user_id=? AND project_id=? AND channel=?",
        ] {
            sqlx::query(statement)
                .bind(user)
                .bind(project)
                .bind(chat)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        self.inner
            .sessions
            .lock()
            .unwrap()
            .drop_where(|key| session_ids.iter().any(|id| id == key));
        for id in &session_ids {
            let _ = tokio::fs::remove_dir_all(super::cli::work_dir(id)).await;
        }
        Ok(())
    }

    /// Removes one Toph from one task: its runs, messages and harness sessions
    /// in that conversation. The Toph itself and its other tasks are untouched.
    pub async fn delete_chat_toph(
        &self,
        user: i64,
        project: &str,
        chat: &str,
        agent: &str,
    ) -> AppResult<()> {
        let session_ids: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM agent_sessions WHERE user_id=? AND project_id=? AND chat_id=? AND agent_id=?",
        )
        .bind(user).bind(project).bind(chat).bind(agent)
        .fetch_all(self.inner.repo.0.pool()).await?;
        let active: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM agent_runs WHERE user_id=? AND project_id=? AND chat_id=? AND agent_id=? AND state IN ('queued','running','waiting')",
        )
        .bind(user).bind(project).bind(chat).bind(agent)
        .fetch_all(self.inner.repo.0.pool()).await?;
        {
            let runs = self.inner.runs.lock().unwrap();
            for id in &active {
                if let Some(token) = runs.get(id) {
                    token.cancel();
                }
            }
        }
        let mut tx = self.inner.repo.0.pool().begin().await?;
        for statement in [
            "DELETE FROM agent_tool_calls WHERE run_id IN (SELECT id FROM agent_runs WHERE user_id=? AND project_id=? AND chat_id=? AND agent_id=?)",
            "DELETE FROM agent_model_calls WHERE run_id IN (SELECT id FROM agent_runs WHERE user_id=? AND project_id=? AND chat_id=? AND agent_id=?)",
            "DELETE FROM agent_artifacts WHERE run_id IN (SELECT id FROM agent_runs WHERE user_id=? AND project_id=? AND chat_id=? AND agent_id=?)",
            "DELETE FROM agent_events WHERE session_id IN (SELECT id FROM agent_sessions WHERE user_id=? AND project_id=? AND chat_id=? AND agent_id=?)",
            "DELETE FROM agent_messages WHERE session_id IN (SELECT id FROM agent_sessions WHERE user_id=? AND project_id=? AND chat_id=? AND agent_id=?)",
            "DELETE FROM agent_checkpoints WHERE session_id IN (SELECT id FROM agent_sessions WHERE user_id=? AND project_id=? AND chat_id=? AND agent_id=?)",
            "DELETE FROM agent_session_state WHERE session_id IN (SELECT id FROM agent_sessions WHERE user_id=? AND project_id=? AND chat_id=? AND agent_id=?)",
            "DELETE FROM agent_runs WHERE user_id=? AND project_id=? AND chat_id=? AND agent_id=?",
            "DELETE FROM agent_sessions WHERE user_id=? AND project_id=? AND chat_id=? AND agent_id=?",
        ] {
            sqlx::query(statement)
                .bind(user).bind(project).bind(chat).bind(agent)
                .execute(&mut *tx).await?;
        }
        tx.commit().await?;
        self.inner
            .sessions
            .lock()
            .unwrap()
            .drop_where(|key| session_ids.iter().any(|id| id == key));
        for id in &session_ids {
            let _ = tokio::fs::remove_dir_all(super::cli::work_dir(id)).await;
        }
        Ok(())
    }

    /// Removes a Toph from the project: every task's runs, messages and harness
    /// sessions, plus its profile. The UI asks for confirmation first.
    pub async fn delete_toph(&self, user: i64, project: &str, agent: &str) -> AppResult<()> {
        let session_ids: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM agent_sessions WHERE user_id=? AND project_id=? AND agent_id=?",
        )
        .bind(user)
        .bind(project)
        .bind(agent)
        .fetch_all(self.inner.repo.0.pool())
        .await?;
        let active: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM agent_runs WHERE user_id=? AND project_id=? AND agent_id=? AND state IN ('queued','running','waiting')",
        )
        .bind(user).bind(project).bind(agent)
        .fetch_all(self.inner.repo.0.pool()).await?;
        {
            let runs = self.inner.runs.lock().unwrap();
            for id in &active {
                if let Some(token) = runs.get(id) {
                    token.cancel();
                }
            }
        }
        let mut tx = self.inner.repo.0.pool().begin().await?;
        for statement in [
            "DELETE FROM agent_tool_calls WHERE run_id IN (SELECT id FROM agent_runs WHERE user_id=? AND project_id=? AND agent_id=?)",
            "DELETE FROM agent_model_calls WHERE run_id IN (SELECT id FROM agent_runs WHERE user_id=? AND project_id=? AND agent_id=?)",
            "DELETE FROM agent_artifacts WHERE run_id IN (SELECT id FROM agent_runs WHERE user_id=? AND project_id=? AND agent_id=?)",
            "DELETE FROM agent_events WHERE session_id IN (SELECT id FROM agent_sessions WHERE user_id=? AND project_id=? AND agent_id=?)",
            "DELETE FROM agent_messages WHERE session_id IN (SELECT id FROM agent_sessions WHERE user_id=? AND project_id=? AND agent_id=?)",
            "DELETE FROM agent_checkpoints WHERE session_id IN (SELECT id FROM agent_sessions WHERE user_id=? AND project_id=? AND agent_id=?)",
            "DELETE FROM agent_session_state WHERE session_id IN (SELECT id FROM agent_sessions WHERE user_id=? AND project_id=? AND agent_id=?)",
            "DELETE FROM agent_runs WHERE user_id=? AND project_id=? AND agent_id=?",
            "DELETE FROM agent_sessions WHERE user_id=? AND project_id=? AND agent_id=?",
            "DELETE FROM agent_profiles WHERE user_id=? AND project_id=? AND id=?",
        ] {
            sqlx::query(statement)
                .bind(user).bind(project).bind(agent)
                .execute(&mut *tx).await?;
        }
        tx.commit().await?;
        self.inner
            .sessions
            .lock()
            .unwrap()
            .drop_where(|key| session_ids.iter().any(|id| id == key));
        for id in &session_ids {
            let _ = tokio::fs::remove_dir_all(super::cli::work_dir(id)).await;
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
            let message = json!({"id":id,"chatId":ctx.run.chat_id,"tophId":ctx.agent.id,"sessionId":ctx.run.session_id,"runId":ctx.run.id,"role":"error","content":error,"status":"error","createdAt":now()});
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
        if state == "completed" && ctx.depth == 0 && !answer.is_empty() {
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

    fn identity(agent: &AgentSpec, roster: &[AgentSpec], routed: &[String]) -> String {
        let mut text = format!(
            "Você é {} (@{}), {}.\n{}\n{}\n{}",
            agent.name,
            agent.handle,
            agent.role,
            agent.description,
            agent.personality,
            agent.prompt
        );
        if roster.len() > 1 {
            let peers = roster
                .iter()
                .filter(|item| item.id != agent.id)
                .map(|item| format!("@{} ({})", item.handle, item.role))
                .collect::<Vec<_>>()
                .join(", ");
            text.push_str(&format!(
                "\n\nVocê está num grupo com {peers}. Se precisar do trabalho de outro Toph, mencione o @handle dele na resposta com um pedido claro; ele recebe a sua resposta e continua a mesma conversa. Não responda pela outra pessoa."
            ));
        }
        if routed.len() > 1 {
            let peers = roster
                .iter()
                .filter(|item| item.id != agent.id && routed.iter().any(|id| id == &item.id))
                .map(|item| format!("@{}", item.handle))
                .collect::<Vec<_>>()
                .join(", ");
            if !peers.is_empty() {
                text.push_str(&format!(
                    "\n\nNesta mensagem, {peers} também participam. Se uma resposta deles já estiver no seu contexto, complemente ou revise sem repetir; se ainda não estiver, faça a sua parte."
                ));
            }
        }
        text
    }

    /// Runs one turn on an external CLI. The CLI owns the native agent loop and
    /// tools; Toph adds only identity and the selected native integrations.
    fn execute_cli<'a>(
        &'a self,
        ctx: &'a RunContext,
        config: &'a AiConfig,
        cancel: &'a CancellationToken,
        attachments: &'a [Attachment],
    ) -> BoxFuture<'a, AppResult<String>> {
        Box::pin(async move {
            self.inner.repo.state(&ctx.run.id, "running", "").await?;
            self.event(ctx,"run",json!({"id":ctx.run.id,"chatId":ctx.run.chat_id,"sessionId":ctx.run.session_id,"agentId":ctx.agent.id,"state":"running","error":"","parentId":ctx.run.parent_id,"createdAt":ctx.run.created_at}));
            let engine = ctx.agent.engine.as_str();
            let engine_label = super::engines::label(engine);
            let model = if engine == "opencode" {
                cli::opencode_model(&ctx.agent, config)
            } else if ctx.agent.model.trim().is_empty() {
                String::new()
            } else {
                ctx.agent.model.clone()
            };
            let system = Self::identity(&ctx.agent, &ctx.roster, &ctx.routed);
            let prompt = ctx.request.clone();
            let opencode_session = format!("ses_{}", ctx.run.session_id);
            let mut mcp_servers = self
                .inner
                .tools
                .mcp
                .selected_servers(&ctx.agent.mcp_servers)
                .await
                .unwrap_or_default();
            if let Some(native) = cli::native_server(
                &ctx.project_id,
                &ctx.root,
                &ctx.agent.tools,
                &ctx.agent.email_account_ids,
            ) {
                mcp_servers.push(native);
            }
            let work = cli::work_dir(&ctx.run.session_id);
            tokio::fs::create_dir_all(&work).await?;
            let mid = format!("{}-engine", ctx.run.id);
            let display = json!({"id":mid,"userId":ctx.user_id,"projectId":ctx.project_id,"chatId":ctx.run.chat_id,"tophId":ctx.agent.id,"sessionId":ctx.run.session_id,"runId":ctx.run.id,"model":model,"agentMode":ctx.agent.agent_mode,"role":"assistant","content":"","status":"running","createdAt":now()});
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
            let (tool_tx, mut tool_rx) = tokio::sync::mpsc::unbounded_channel::<cli::NativeTool>();
            let recorder = {
                let runtime = self.clone();
                let tool_ctx = ctx.clone();
                tokio::spawn(async move {
                    while let Some(tool) = tool_rx.recv().await {
                        if let Err(error) = runtime.record_native_tool(&tool_ctx, tool).await {
                            tracing::warn!(%error, "record native tool");
                        }
                    }
                })
            };
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
                match engine {
                    "claude" => {
                        let tx = tool_tx.clone();
                        let session = cli::session_uuid(&ctx.run.session_id);
                        let resume = sqlx::query_scalar::<_, i64>(
                            "SELECT COUNT(*) FROM agent_messages WHERE session_id=? AND role='assistant'",
                        )
                        .bind(&ctx.run.session_id)
                        .fetch_one(self.inner.repo.0.pool())
                        .await
                        .unwrap_or(0)
                            > 0;
                        cli::run_claude(
                            &model,
                            &ctx.agent.effort,
                            &system,
                            &prompt,
                            &work,
                            &ctx.skills,
                            &mcp_servers,
                            &session,
                            resume,
                            cancel,
                            &mut |tool| { let _ = tx.send(tool); },
                        )
                        .await
                        .map(|(text, usage)| (text, usage, None))
                    }
                    "codex" => {
                        let tx = tool_tx.clone();
                        let session = self
                            .inner
                            .repo
                            .ledger(&ctx.run.session_id)
                            .await
                            .unwrap_or_default();
                        cli::run_codex(
                            &model,
                            &system,
                            &prompt,
                            &work,
                            &ctx.skills,
                            &mcp_servers,
                            (!session.trim().is_empty()).then_some(session.as_str()),
                            cancel,
                            &mut |tool| { let _ = tx.send(tool); },
                        )
                        .await
                    }
                    "opencode" => {
                        let tx = tool_tx.clone();
                        cli::run_opencode(
                            &model,
                            &system,
                            &prompt,
                            &opencode_session,
                            &ctx.root,
                            attachments,
                            &ctx.skills,
                            &mcp_servers,
                            cancel,
                            &mut on_text,
                            &mut |tool| { let _ = tx.send(tool); },
                        )
                        .await
                        .map(|(text, usage)| (text, usage, None))
                    }
                    other => Err(bad_request(format!(
                        "O harness {other} ainda não está ligado ao runtime. Use OpenCode, Claude Code ou Codex."
                    ))),
                }
            };
            drop(tool_tx);
            let _ = recorder.await;
            self.inner.drafts.lock().unwrap().remove(&ctx.run.id);
            let (text, usage, codex_thread) = match result {
                Ok(value) => value,
                Err(error) => return Err(error),
            };
            if let Some(thread) = codex_thread {
                let _ = self
                    .inner
                    .repo
                    .save_ledger(&ctx.run.session_id, &thread)
                    .await;
            }
            if text.trim().is_empty() {
                return Err(bad_request(format!(
                    "O {engine_label} terminou sem resposta."
                )));
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
        })
    }

    /// Stores a tool call reported by a native harness as a regular Toph
    /// message. Native harnesses execute the tool themselves; this is only the
    /// transcript/UI bridge.
    async fn record_native_tool(&self, ctx: &RunContext, tool: cli::NativeTool) -> AppResult<()> {
        let created = tool.started_at.unwrap_or_else(now);
        let finished = tool.finished_at.unwrap_or_else(now);
        let failed = tool.error.is_some();
        let content = tool
            .error
            .clone()
            .or_else(|| match &tool.output {
                Value::String(text) => Some(text.clone()),
                value if !value.is_null() => Some(value.to_string()),
                _ => None,
            })
            .unwrap_or_default();
        let label = activity::tool_activity(&tool.name, &tool.input);
        let id = format!("native-{}-{}", ctx.run.id, tool.id);
        let display = json!({
            "id": id,
            "chatId": ctx.run.chat_id,
            "tophId": ctx.agent.id,
            "sessionId": ctx.run.session_id,
            "runId": ctx.run.id,
            "role": "tool",
            "title": tool.name,
            "activity": label,
            "phase": "engine",
            "content": content,
            "detail": json!({"input": tool.input, "output": tool.output}).to_string(),
            "status": if failed { "error" } else { "complete" },
            "durationMs": finished.saturating_sub(created),
            "createdAt": created,
        });
        let seq = self
            .inner
            .repo
            .message(
                ctx,
                &id,
                json!({"role":"tool","name":tool.name,"content":content}),
                display.clone(),
            )
            .await?;
        let mut display = display;
        display["seq"] = json!(seq);
        self.event(ctx, "message", display);
        Ok(())
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
        let started = Instant::now();
        let tid = new_id();
        let call_id = if call_id.trim().is_empty() {
            tid.clone()
        } else {
            call_id.to_string()
        };
        let label = activity::tool_activity(name, &args);
        let tool_display = json!({"id":tid,"chatId":ctx.run.chat_id,"tophId":ctx.agent.id,"sessionId":ctx.run.session_id,"runId":ctx.run.id,"role":"tool","title":name,"activity":label,"phase":"engine","content":args.to_string(),"status":"running","createdAt":now()});
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
                result=async {
                    if name == "delegate" {
                        self.delegate(ctx, &args, cancel).await
                    } else if name == "read_skill" {
                        let wanted = args["name"].as_str().unwrap_or("");
                        match self
                            .inner
                            .skills
                            .read_for_agent(&ctx.project_id, &ctx.agent.id, wanted)
                            .await?
                        {
                            Some(skill) => {
                                let file = args["file"].as_str();
                                let content = if let Some(source) = skill.source.as_deref() {
                                    super::skills::read_local(source, file)?
                                } else if file.is_some() {
                                    return Err(bad_request(
                                        "Essa skill não tem arquivos de apoio.",
                                    ));
                                } else {
                                    skill.body.clone()
                                };
                                Ok(json!({
                                    "name": skill.name,
                                    "description": skill.description,
                                    "content": content,
                                }))
                            }
                            None => Err(bad_request(format!(
                                "Você não tem uma skill chamada \"{wanted}\"."
                            ))),
                        }
                    } else if name == "propose_skill" {
                        self.inner
                            .skills
                            .propose(
                                &ctx.project_id,
                                &ctx.agent.id,
                                super::skill_service::ProposalInput {
                                    name: args["name"].as_str().unwrap_or("").into(),
                                    description: args["description"].as_str().unwrap_or("").into(),
                                    body: args["recipe"].as_str().unwrap_or("").into(),
                                    reason: args["reason"].as_str().unwrap_or("").into(),
                                },
                            )
                            .await
                    } else {
                        self.inner.tools.execute(ctx, name, &args).await
                    }
                }=>result,
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
        display["durationMs"] = json!(started.elapsed().as_millis() as i64);
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

    /// Runs a child turn for another Toph in the same team. The child uses its
    /// own session, model, prompt and permissions; its messages join the same
    /// conversation, and the answer comes back to the caller.
    fn delegate<'a>(
        &'a self,
        parent: &'a RunContext,
        args: &'a Value,
        cancel: &'a CancellationToken,
    ) -> BoxFuture<'a, AppResult<Value>> {
        Box::pin(async move {
            if parent.depth >= 2 {
                return Err(bad_request(
                    "A conversa entre Tophs chegou ao limite de três trocas. Responda ao usuário.",
                ));
            }
            let handle = args["agent"]
                .as_str()
                .unwrap_or("")
                .trim()
                .trim_start_matches('@');
            let task = args["task"].as_str().unwrap_or("").trim();
            if handle.is_empty() || task.is_empty() {
                return Err(bad_request("agent and task are required"));
            }
            let mut target = parent
                .roster
                .iter()
                .find(|agent| {
                    agent.id != parent.agent.id
                        && (agent.handle.eq_ignore_ascii_case(handle)
                            || agent.name.eq_ignore_ascii_case(handle))
                })
                .cloned()
                .ok_or_else(|| bad_request(format!("Toph @{handle} não está nesta equipe.")))?;
            target.chat_id = parent.run.chat_id.clone();
            if parent.routed.len() > 1 && parent.routed.iter().any(|id| id == &target.id) {
                return Ok(json!({
                    "agent": target.handle,
                    "busy": true,
                    "text": format!(
                        "@{} já foi escolhido para responder a esta mesma mensagem. Não delegue de novo: faça a sua parte e deixe a resposta dele chegar.",
                        target.handle
                    )
                }));
            }
            let busy: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM agent_runs WHERE user_id=? AND project_id=? AND chat_id=? AND agent_id=? AND state IN ('queued','running','waiting')",
            )
            .bind(parent.user_id).bind(&parent.project_id).bind(&parent.run.chat_id).bind(&target.id)
            .fetch_one(self.inner.repo.0.pool()).await.unwrap_or(0);
            if busy > 0 {
                return Ok(json!({
                    "agent": target.handle,
                    "busy": true,
                    "text": format!(
                        "@{} já está respondendo nesta conversa. Não delegue de novo; faça a sua parte e deixe a resposta dele chegar.",
                        target.handle
                    )
                }));
            }
            let model = self.inner.ai.migrate_agent_model(&target.model).await?;
            let config = self.inner.ai.resolve(&model).await?;
            let mut session = self
                .inner
                .repo
                .session(parent.user_id, &parent.project_id, &target, None)
                .await?;
            if session.chat_id != parent.run.chat_id {
                sqlx::query(
                    "UPDATE agent_sessions SET chat_id=? WHERE id=? AND user_id=? AND project_id=?",
                )
                .bind(&parent.run.chat_id)
                .bind(&session.id)
                .bind(parent.user_id)
                .bind(&parent.project_id)
                .execute(self.inner.repo.0.pool())
                .await?;
                session.chat_id = parent.run.chat_id.clone();
            }
            let run = self
                .inner
                .repo
                .create_run(
                    parent.user_id,
                    &parent.project_id,
                    &session,
                    &format!("delegate-{}-{}", parent.run.id, new_id()),
                    Some(&parent.run.id),
                    &target,
                )
                .await?;
            let skills = self
                .inner
                .skills
                .for_agent(&parent.project_id, &target.id)
                .await?;
            let ctx = RunContext {
                run: run.clone(),
                user_id: parent.user_id,
                project_id: parent.project_id.clone(),
                root: parent.root.clone(),
                agent: target,
                roster: parent.roster.clone(),
                skills,
                chat_description: parent.chat_description.clone(),
                depth: parent.depth + 1,
                secondary: false,
                routed: parent.routed.clone(),
                silent: false,
                routing_reason: String::new(),
                request: task.to_string(),
            };
            self.inner
                .runs
                .lock()
                .unwrap()
                .insert(run.id.clone(), cancel.clone());
            let runtime = self.clone();
            let child_ctx = ctx.clone();
            let child_cancel = cancel.clone();
            let child_task = task.to_string();
            let result = match tokio::spawn(async move {
                runtime.prepare(&child_ctx, &child_task, &[]).await?;
                runtime
                    .execute_cli(&child_ctx, &config, &child_cancel, &[])
                    .await
            })
            .await
            {
                Ok(result) => result,
                Err(error) => Err(crate::errors::internal(error.to_string())),
            };
            self.inner.runs.lock().unwrap().remove(&run.id);
            // A delegated Toph can mention another one too. The chain stops at
            // depth 2, so a user message gets at most three agent answers in a row.
            if let Ok(text) = &result {
                if !cancel.is_cancelled() {
                    self.auto_handoff(&ctx, text, cancel).await;
                }
            }
            match &result {
                Ok(text) => {
                    let _ = self.inner.repo.state(&run.id, "completed", "").await;
                    self.event(&ctx, "run", json!({"id":run.id,"chatId":ctx.run.chat_id,"sessionId":ctx.run.session_id,"agentId":ctx.agent.id,"state":"completed","error":"","parentId":ctx.run.parent_id,"createdAt":ctx.run.created_at,"finishedAt":now()}));
                    let _ = self
                        .inner
                        .repo
                        .append_event(
                            &ctx,
                            event::kind::RUN_COMPLETED,
                            json!({"state":"completed","answer":text}),
                        )
                        .await;
                }
                Err(error) => {
                    let (state, message) = if cancel.is_cancelled() {
                        ("cancelled", "Execution cancelled".to_string())
                    } else {
                        ("failed", error.to_string())
                    };
                    let _ = self.inner.repo.state(&run.id, state, &message).await;
                    self.event(&ctx, "run", json!({"id":run.id,"chatId":ctx.run.chat_id,"sessionId":ctx.run.session_id,"agentId":ctx.agent.id,"state":state,"error":message,"parentId":ctx.run.parent_id,"createdAt":ctx.run.created_at,"finishedAt":now()}));
                    let _ = self
                        .inner
                        .repo
                        .append_event(
                            &ctx,
                            event::kind::RUN_FAILED,
                            json!({"state":state,"error":message}),
                        )
                        .await;
                }
            }
            let text = result?;
            Ok(json!({"agent": ctx.agent.handle, "text": text}))
        })
    }

    /// After a reply, mentions of other Tophs can hand the turn over without
    /// the caller needing a `delegate` call. A small router turn decides if
    /// the mention is actually asking for work: "thanks, @beto" wakes nobody.
    async fn auto_handoff(&self, ctx: &RunContext, text: &str, cancel: &CancellationToken) {
        if ctx.depth >= 2 || ctx.roster.len() < 2 || cancel.is_cancelled() || text.trim().is_empty()
        {
            return;
        }
        // An explicit delegate already ran the other Toph and brought the
        // answer back; running the mention again would duplicate it.
        let used_delegate: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM agent_tool_calls WHERE run_id=? AND name='delegate' AND state='completed'",
        )
        .bind(&ctx.run.id)
        .fetch_one(self.inner.repo.0.pool())
        .await
        .unwrap_or(0);
        if used_delegate > 0 {
            return;
        }
        let mut candidates = mentioned_agents(text, &ctx.roster, &ctx.agent.id);
        if ctx.routed.len() > 1 {
            candidates.retain(|agent| !ctx.routed.iter().any(|id| id == &agent.id));
        }
        // A delegated child does not hand work back to its caller: the caller
        // already receives the child's answer through the delegate tool.
        if let Some(parent_id) = &ctx.run.parent_id {
            if let Ok(parent) = self
                .inner
                .repo
                .get_run(ctx.user_id, &ctx.project_id, parent_id)
                .await
            {
                candidates.retain(|agent| agent.id != parent.agent_id);
            }
        }
        if candidates.is_empty() {
            return;
        }
        let mut available = Vec::new();
        for agent in candidates {
            let busy: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM agent_runs WHERE user_id=? AND project_id=? AND chat_id=? AND agent_id=? AND state IN ('queued','running','waiting')",
            )
            .bind(ctx.user_id)
            .bind(&ctx.project_id)
            .bind(&ctx.run.chat_id)
            .bind(&agent.id)
            .fetch_one(self.inner.repo.0.pool())
            .await
            .unwrap_or(0);
            if busy == 0 {
                available.push(agent);
            }
        }
        if available.is_empty() {
            return;
        }
        let chosen = self.handoff_choice(ctx, text, &available).await;
        for agent in chosen {
            let reply = text.chars().take(4_000).collect::<String>();
            let task = format!(
                "{} (@{}) respondeu:\n\n{}\n\nContinue a conversa respondendo à parte que é sua. Não repita o que já foi respondido.",
                ctx.agent.name, ctx.agent.handle, reply
            );
            if let Err(error) = self
                .delegate(ctx, &json!({"agent":agent.handle,"task":task}), cancel)
                .await
            {
                tracing::warn!(%error, agent = %agent.handle, "automatic handoff failed");
            }
        }
    }

    async fn handoff_choice(
        &self,
        ctx: &RunContext,
        text: &str,
        candidates: &[AgentSpec],
    ) -> Vec<AgentSpec> {
        let team = candidates
            .iter()
            .map(|agent| {
                format!(
                    "@{} — {} — {}",
                    agent.handle,
                    agent.role,
                    agent.description.chars().take(180).collect::<String>()
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        let history = self
            .inner
            .repo
            .recent_text(&ctx.run.session_id, "", 8)
            .await
            .unwrap_or_default()
            .chars()
            .take(6_000)
            .collect::<String>();
        let reply = text.chars().take(6_000).collect::<String>();
        let messages = vec![
            crate::ai::Message {
                role: "system".into(),
                content: json!(
                    "Você decide a passagem de vez entre Tophs. Um Toph respondeu e mencionou outros. Escolha só os mencionados que precisam agir por causa da resposta. Responda SOMENTE com JSON no formato {\"handles\":[\"...\"]}, usando os handles da lista. Passe a vez para pedido, pergunta, tarefa, revisão ou decisão. Não passe para agradecimento, confirmação, menção que só credita ou informa. Na dúvida, não passe."
                ),
            },
            crate::ai::Message {
                role: "user".into(),
                content: json!(format!(
                    "Mencionados:\n{team}\n\nConversa recente:\n{history}\n\nResposta de @{}:\n<reply>\n{}\n</reply>\n\nQuais mencionados precisam agir?",
                    ctx.agent.handle, reply
                )),
            },
        ];
        let answer = match tokio::time::timeout(
            Duration::from_secs(20),
            self.inner.ai.chat(messages, None, None, None, vec![]),
        )
        .await
        {
            Ok(Ok(answer)) => answer,
            _ => return Vec::new(),
        };
        let handles = parse_handles(&answer);
        candidates
            .iter()
            .filter(|agent| {
                handles
                    .iter()
                    .any(|handle| handle == &agent.handle.to_lowercase())
            })
            .take(2)
            .cloned()
            .collect()
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

#[cfg(test)]
mod tests {
    use super::*;

    fn agent(id: &str, handle: &str) -> AgentSpec {
        serde_json::from_value(json!({
            "id": id,
            "chatId": "chat",
            "name": handle,
            "handle": handle
        }))
        .unwrap()
    }

    #[test]
    fn handoff_handles_are_read_from_a_json_reply() {
        assert_eq!(
            parse_handles("```json\n{\"handles\":[\"@Beto\",\"nico,\"]}\n```"),
            vec!["beto".to_string(), "nico".to_string()]
        );
        assert!(parse_handles("ninguém").is_empty());
        assert!(parse_handles("{\"handles\":[]}").is_empty());
    }

    #[test]
    fn router_plan_reads_multiple_handles_and_everyone() {
        let plan = parse_route("```json\n{\"handles\":[\"@Beto\",\"nico\"],\"todos\":false,\"reason\":\"pesquisa e dev\"}\n```").unwrap();
        assert_eq!(plan.handles, vec!["beto".to_string(), "nico".to_string()]);
        assert!(!plan.everyone);
        assert_eq!(plan.reason, "pesquisa e dev");

        let everyone =
            parse_route("{\"handles\":[],\"everyone\":true,\"reason\":\"pessoal\"}").unwrap();
        assert!(everyone.everyone);
        assert!(parse_route("sem json").is_none());
    }

    #[test]
    fn mentions_skip_the_speaker_and_duplicates() {
        let roster = vec![agent("a", "ana"), agent("b", "beto"), agent("c", "nico")];
        let found = mentioned_agents("@beto e @beto, depois @ana e @nico.", &roster, "a");
        assert_eq!(
            found
                .iter()
                .map(|item| item.handle.as_str())
                .collect::<Vec<_>>(),
            vec!["beto", "nico"]
        );
    }
}
