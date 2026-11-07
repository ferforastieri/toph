use super::models::{now, AgentSpec, RunContext};
use crate::{
    ai::{AiService, ImageTool},
    email::EmailService,
    errors::{bad_request, AppError, AppResult},
    store::Store,
    workspace::WorkspaceService,
};
use serde_json::{json, Value};
use sqlx::Row;
use std::{path::PathBuf, process::Stdio, time::Duration};
use tokio::io::{AsyncRead, AsyncReadExt};

#[derive(Clone)]
pub struct Tools {
    pub store: Store,
    pub ai: AiService,
    pub workspace: WorkspaceService,
    pub email: EmailService,
    pub artifacts: PathBuf,
    pub mcp: crate::features::integrations::mcp::Service,
    pub http: reqwest::Client,
}

fn definition(name: &str, description: &str, properties: Value, required: &[&str]) -> Value {
    json!({"type":"function","function":{"name":name,"description":description,"parameters":{"type":"object","properties":properties,"required":required,"additionalProperties":false}}})
}

fn ask_user_definition() -> Value {
    let string = || json!({"type":"string"});
    definition(
        "ask_user",
        "Ask the user a blocking question and wait for the answer. Use it only when a decision cannot be inferred safely. Provide 2-4 concrete options; the user may also type a free answer.",
        json!({"questions":{"type":"array","items":{"type":"object","properties":{"header":string(),"question":string(),"options":{"type":"array","items":{"type":"object","properties":{"label":string(),"description":string()},"required":["label"]}},"multiple":{"type":"boolean"}},"required":["question","options"]}}}),
        &["questions"],
    )
}

fn read_tools(agent: &AgentSpec) -> Vec<Value> {
    let string = || json!({"type":"string"});
    let integer = || json!({"type":"integer"});
    let mut tools = vec![
        definition("read_file","Read a project file range. Returns its hash for safe editing. Prefer small relevant ranges.",json!({"path":string(),"offset":integer(),"limit":integer()}),&["path"]),
        definition("list_files","List matching project paths (max 100).",json!({"query":string()}),&["query"]),
        definition("search","Search file contents for literal text. Returns paths and line numbers.",json!({"query":string(),"path":string()}),&["query"]),
        definition("read_artifact","Read a bounded range of a saved tool result or attachment.",json!({"id":string(),"offset":integer(),"limit":integer()}),&["id"]),
        definition("search_history","Find relevant earlier messages. Query uses plain words; returns source ids.",json!({"query":string()}),&["query"]),
        definition("search_memory","Find durable project facts by a keyword.",json!({"query":string()}),&["query"]),
        definition("fetch_url","Fetch a public HTTP(S) document. Large results are saved as artifacts.",json!({"url":string()}),&["url"]),
    ];
    if !agent.skills.is_empty() {
        tools.push(definition(
            "read_skill",
            "Load the full instructions of an enabled project skill. Read a skill before acting on its domain.",
            json!({"name":string()}),
            &["name"],
        ));
    }
    tools
}

/// Phase 1: read-only research. The only terminal action is submit_research.
pub fn research_definitions(agent: &AgentSpec) -> Vec<Value> {
    let string = || json!({"type":"string"});
    let mut tools = read_tools(agent);
    tools.push(ask_user_definition());
    tools.push(definition(
        "submit_research",
        "Finish the read-only research phase. Return the exact files, excerpts, constraints and open questions needed to plan the change. This is the only way to leave the research phase.",
        json!({
            "summary": string(),
            "files": {"type":"array","items":{"type":"object","properties":{"path":string(),"relevance":string(),"excerpt":string()},"required":["path"]}},
            "constraints": {"type":"array","items":{"type":"string"}},
            "openQuestions": {"type":"array","items":{"type":"string"}}
        }),
        &["summary", "files"],
    ));
    tools
}

pub fn delegate_definition() -> Value {
    definition(
        "delegate",
        "Give a specific research task to another team agent by handle. Include only necessary context and artifact references. Waits for its result.",
        json!({"agent":{"type":"string"},"task":{"type":"string"}}),
        &["agent", "task"],
    )
}

/// Phase 2: architect. The only terminal action is submit_plan.
pub fn plan_definitions() -> Vec<Value> {
    let string = || json!({"type":"string"});
    vec![
        ask_user_definition(),
        definition(
            "submit_plan",
            "Finish the planning phase with an executable change plan. Name the exact files, the instructions for each one, and the real verification commands.",
            json!({
                "goal": string(),
                "files": {"type":"array","items":{"type":"object","properties":{"path":string(),"action":{"type":"string","enum":["edit","create","delete"]},"instructions":string()},"required":["path","action","instructions"]}},
                "verification": {"type":"array","items":{"type":"string"}},
                "acceptance": {"type":"array","items":{"type":"string"}}
            }),
            &["goal", "files", "verification"],
        ),
    ]
}

/// Phase 3: editor. It can only read and change files named by the plan and
/// can only run the plan's verification commands.
pub fn implementation_definitions(
    agent: &AgentSpec,
    plan: &crate::features::agents::harness::artifacts::ChangePlan,
) -> Vec<Value> {
    let string = || json!({"type":"string"});
    let integer = || json!({"type":"integer"});
    let paths = plan.paths();
    let mut tools = vec![definition(
        "read_file",
        &format!(
            "Read one of the files named by the plan. Allowed paths: {}. Returns its hash.",
            paths.join(", ")
        ),
        json!({"path":string(),"offset":integer(),"limit":integer()}),
        &["path"],
    )];
    if agent.agent_mode != "plan" && agent.permission_mode != "deny" {
        tools.extend([
            definition("edit_file","Replace exactly one occurrence of oldText in a planned file. Fails when ambiguous or stale.",json!({"path":string(),"oldText":string(),"newText":string()}),&["path","oldText","newText"]),
            definition("write_file","Create a planned file or replace it. For an existing file, expectedHash from read_file is required.",json!({"path":string(),"content":string(),"expectedHash":string()}),&["path","content"]),
            definition("delete_file","Delete one of the planned files.",json!({"path":string()}),&["path"]),
            definition("verify","Run the verification commands from the plan. Call it after the last edit. It is the only way to prove completion.",json!({"reason":string()}),&[]),
        ]);
    }
    tools.push(definition(
        "report_blocked",
        "Stop the run with a concrete blocker when the plan cannot be applied safely. Do not use it to avoid work.",
        json!({"reason":string()}),
        &["reason"],
    ));
    tools.push(ask_user_definition());
    tools
}

pub fn mutating(name: &str) -> bool {
    matches!(
        name,
        "write_file"
            | "edit_file"
            | "delete_file"
            | "shell"
            | "remember"
            | "generate_image"
            | "email_send"
    )
}

pub fn needs_permission(name: &str) -> bool {
    mutating(name) || name == "verify"
}

/// `mcp_call` prompts once per server instead of once per call when that
/// server is configured as auto-approved. Browser automation issues dozens of
/// calls per task, so a per-call prompt makes the feature unusable.
pub fn mcp_needs_permission(servers: &[String], server: &str, auto: &[String]) -> bool {
    servers.iter().any(|s| s == server) && !auto.iter().any(|s| s == server)
}

fn text<'a>(args: &'a Value, key: &str) -> AppResult<&'a str> {
    args[key]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| bad_request(format!("{key} is required")))
}

impl Tools {
    pub async fn artifact(
        &self,
        ctx: &RunContext,
        name: &str,
        mime: &str,
        bytes: &[u8],
    ) -> AppResult<String> {
        if bytes.len() > 8 * 1024 * 1024 {
            return Err(AppError::TooLarge);
        }
        let id = crate::crypto::new_id();
        let path = self.artifacts.join(&id);
        tokio::fs::create_dir_all(&self.artifacts).await?;
        tokio::fs::write(&path, bytes).await?;
        sqlx::query("INSERT INTO agent_artifacts VALUES(?,?,?,?,?,?,?,?,?)")
            .bind(&id)
            .bind(ctx.user_id)
            .bind(&ctx.project_id)
            .bind(&ctx.run.id)
            .bind(name)
            .bind(mime)
            .bind(&id)
            .bind(bytes.len() as i64)
            .bind(now())
            .execute(self.store.pool())
            .await?;
        Ok(id)
    }

    pub async fn artifact_bytes(
        &self,
        user: i64,
        project: &str,
        id: &str,
    ) -> AppResult<(String, Vec<u8>)> {
        let row = sqlx::query(
            "SELECT path,mime FROM agent_artifacts WHERE id=? AND user_id=? AND project_id=?",
        )
        .bind(id)
        .bind(user)
        .bind(project)
        .fetch_optional(self.store.pool())
        .await?
        .ok_or(AppError::NotFound)?;
        Ok((
            row.get("mime"),
            tokio::fs::read(self.artifacts.join(row.get::<String, _>("path"))).await?,
        ))
    }

    pub async fn execute(&self, ctx: &RunContext, name: &str, args: &Value) -> AppResult<Value> {
        match name {
            "read_file" => {
                let path = text(args, "path")?.to_owned();
                let ws = self.workspace.clone();
                let root = ctx.root.clone();
                let file = tokio::task::spawn_blocking(move || ws.read(&root, &path))
                    .await
                    .map_err(|e| AppError::Internal(e.into()))??;
                let offset = args["offset"].as_u64().unwrap_or(1).max(1) as usize;
                let limit = args["limit"].as_u64().unwrap_or(60).clamp(1, 200) as usize;
                let lines = file
                    .content
                    .lines()
                    .skip(offset - 1)
                    .take(limit)
                    .enumerate()
                    .map(|(i, l)| format!("{}: {}", offset + i, l))
                    .collect::<Vec<_>>()
                    .join("\n");
                Ok(
                    json!({"path":file.path,"hash":file.hash,"offset":offset,"content":lines,"totalLines":file.content.lines().count()}),
                )
            }
            "list_files" => {
                let query = args["query"].as_str().unwrap_or("").to_owned();
                let ws = self.workspace.clone();
                let root = ctx.root.clone();
                let paths = tokio::task::spawn_blocking(move || ws.files(&root, &query, 100))
                    .await
                    .map_err(|e| AppError::Internal(e.into()))??;
                Ok(json!(paths))
            }
            "search" => {
                let prefix = args["path"].as_str().unwrap_or("");
                let matches = self
                    .workspace
                    .search(&ctx.root, text(args, "query")?, 100)
                    .await?;
                Ok(json!(matches
                    .into_iter()
                    .filter(|m| m.path.starts_with(prefix))
                    .take(40)
                    .collect::<Vec<_>>()))
            }
            "write_file" | "edit_file" => {
                let ws = self.workspace.clone();
                let root = ctx.root.clone();
                let args = args.clone();
                let name = name.to_owned();
                let result = tokio::task::spawn_blocking(move || -> AppResult<Value> {
                    let path = text(&args, "path")?;
                    let existing = match ws.read(&root, path) {
                        Ok(f) => Some(f),
                        Err(AppError::NotFound) => None,
                        Err(AppError::Io(e)) if e.kind() == std::io::ErrorKind::NotFound => None,
                        Err(e) => return Err(e),
                    };
                    let (content, hash) = if name == "edit_file" {
                        let file = existing.as_ref().ok_or(AppError::NotFound)?;
                        let old = text(&args, "oldText")?;
                        let new = args["newText"]
                            .as_str()
                            .ok_or_else(|| bad_request("newText is required"))?;
                        if file.content.matches(old).count() != 1 {
                            return Err(bad_request("oldText must match exactly one location"));
                        }
                        (file.content.replacen(old, new, 1), file.hash.clone())
                    } else {
                        let content = args["content"]
                            .as_str()
                            .ok_or_else(|| bad_request("content is required"))?
                            .to_owned();
                        let hash = args["expectedHash"].as_str().unwrap_or("").to_owned();
                        if existing.is_some() && hash.is_empty() {
                            return Err(bad_request(
                                "Read the file first and provide expectedHash",
                            ));
                        }
                        (content, hash)
                    };
                    let file = ws.write(&root, path, &content, &hash)?;
                    Ok(json!({"path":file.path,"hash":file.hash,"bytes":file.size}))
                })
                .await
                .map_err(|e| AppError::Internal(e.into()))??;
                Ok(result)
            }
            "delete_file" => {
                let path = text(args, "path")?.to_owned();
                let ws = self.workspace.clone();
                let root = ctx.root.clone();
                let deleted = path.clone();
                tokio::task::spawn_blocking(move || ws.delete(&root, &path))
                    .await
                    .map_err(|e| AppError::Internal(e.into()))??;
                Ok(json!({"path":deleted,"deleted":true}))
            }
            "shell" => {
                shell(
                    &ctx.root,
                    text(args, "command")?,
                    args.get("timeoutMs").and_then(Value::as_u64),
                )
                .await
            }
            "verify" => Err(bad_request("verify is executed by the phase runner")),
            "read_artifact" => {
                let id = text(args, "id")?;
                let (mime, bytes) = self
                    .artifact_bytes(ctx.user_id, &ctx.project_id, id)
                    .await?;
                if mime.starts_with("image/") {
                    return Ok(
                        json!({"id":id,"mime":mime,"url":format!("/api/projects/{}/agent/artifacts/{id}",ctx.project_id)}),
                    );
                }
                let source = String::from_utf8(bytes).map_err(|_| AppError::Binary)?;
                let offset = args["offset"].as_u64().unwrap_or(0) as usize;
                let limit = args["limit"].as_u64().unwrap_or(1800).clamp(1, 2000) as usize;
                Ok(
                    json!({"id":id,"offset":offset,"text":source.chars().skip(offset).take(limit).collect::<String>(),"totalChars":source.chars().count()}),
                )
            }
            "search_history" => {
                let query = text(args, "query")?
                    .split_whitespace()
                    .take(8)
                    .map(|s| format!("\"{}\"", s.replace('"', "\"\"")))
                    .collect::<Vec<_>>()
                    .join(" OR ");
                let rows=sqlx::query("SELECT m.id,m.session_id,substr(m.content_text,1,1200) AS text FROM agent_history_fts f JOIN agent_messages m ON m.seq=f.rowid JOIN agent_sessions s ON s.id=m.session_id WHERE f.content_text MATCH ? AND s.user_id=? AND s.project_id=? ORDER BY f.rank LIMIT 5")
                    .bind(query).bind(ctx.user_id).bind(&ctx.project_id).fetch_all(self.store.pool()).await?;
                Ok(json!(rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"sessionId":r.get::<String,_>("session_id"),"text":r.get::<String,_>("text")})).collect::<Vec<_>>()))
            }
            "remember" => {
                let source = text(args, "sourceId")?;
                let content = text(args, "content")?;
                if content.len() > 2000 {
                    return Err(AppError::TooLarge);
                }
                let count:i64=sqlx::query_scalar("SELECT count(*) FROM agent_messages m JOIN agent_sessions s ON s.id=m.session_id WHERE m.id=? AND s.user_id=? AND s.project_id=?")
                    .bind(source).bind(ctx.user_id).bind(&ctx.project_id).fetch_one(self.store.pool()).await?;
                if count == 0 {
                    return Err(bad_request("Memory source must be a project message id"));
                }
                let id = crate::crypto::new_id();
                sqlx::query("INSERT INTO agent_memories VALUES(?,?,?,?,?,?)")
                    .bind(&id)
                    .bind(ctx.user_id)
                    .bind(&ctx.project_id)
                    .bind(content)
                    .bind(source)
                    .bind(now())
                    .execute(self.store.pool())
                    .await?;
                Ok(json!({"id":id,"saved":true}))
            }
            "search_memory" => {
                let rows=sqlx::query("SELECT id,content,source_id FROM agent_memories WHERE user_id=? AND project_id=? AND instr(lower(content),lower(?))>0 ORDER BY created_at DESC LIMIT 5")
                    .bind(ctx.user_id).bind(&ctx.project_id).bind(text(args,"query")?).fetch_all(self.store.pool()).await?;
                Ok(json!(rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"content":r.get::<String,_>("content"),"sourceId":r.get::<String,_>("source_id")})).collect::<Vec<_>>()))
            }
            "generate_image" => {
                self.ai
                    .image(
                        &ImageTool {
                            project_id: ctx.project_id.clone(),
                            project_root: ctx.root.clone(),
                        },
                        &args.to_string(),
                    )
                    .await
            }
            "email_list" | "email_read" | "email_send" => {
                let account = text(args, "accountId")?;
                if !ctx.agent.email_account_ids.iter().any(|s| s == account) {
                    return Err(AppError::Forbidden);
                }
                match name {
                    "email_list" => Ok(json!(
                        self.email
                            .messages(
                                account,
                                args["limit"].as_u64().unwrap_or(10).min(30) as usize
                            )
                            .await?
                    )),
                    "email_read" => Ok(json!(
                        self.email.message(account, text(args, "uid")?).await?
                    )),
                    _ => {
                        self.email
                            .send(account, serde_json::from_value(args.clone())?)
                            .await?;
                        Ok(json!({"sent":true}))
                    }
                }
            }
            "fetch_url" => {
                let url = reqwest::Url::parse(text(args, "url")?)
                    .map_err(|e| bad_request(e.to_string()))?;
                if !matches!(url.scheme(), "http" | "https") {
                    return Err(bad_request("HTTP(S) URL required"));
                }
                let mut response = self
                    .http
                    .get(url)
                    .send()
                    .await
                    .map_err(|e| AppError::Upstream(e.to_string()))?
                    .error_for_status()
                    .map_err(|e| AppError::Upstream(e.to_string()))?;
                let mut bytes = Vec::new();
                let mut truncated = false;
                while let Some(chunk) = response
                    .chunk()
                    .await
                    .map_err(|e| AppError::Upstream(e.to_string()))?
                {
                    let take = (256 * 1024usize)
                        .saturating_sub(bytes.len())
                        .min(chunk.len());
                    bytes.extend_from_slice(&chunk[..take]);
                    if take < chunk.len() || bytes.len() >= 256 * 1024 {
                        truncated = true;
                        break;
                    }
                }
                Ok(json!({"text":String::from_utf8_lossy(&bytes),"truncated":truncated}))
            }
            "read_skill" => {
                let name = text(args, "name")?;
                if !ctx.agent.skills.iter().any(|skill| skill == name) {
                    return Err(AppError::Forbidden);
                }
                Ok(json!({
                    "content": super::skills::read(&self.workspace, &ctx.root, name)?
                }))
            }
            "mcp_list" | "mcp_call" => {
                let server = text(args, "server")?;
                if !ctx.agent.mcp_servers.iter().any(|s| s == server) {
                    return Err(AppError::Forbidden);
                }
                self.mcp
                    .call(
                        &ctx.root,
                        server,
                        if name == "mcp_list" {
                            "tools/list"
                        } else {
                            "tools/call"
                        },
                        if name == "mcp_list" {
                            json!({})
                        } else {
                            json!({"name":text(args,"tool")?,"arguments":args["arguments"]})
                        },
                    )
                    .await
            }
            _ => Err(bad_request(format!("Unknown tool: {name}"))),
        }
    }
}

struct ProcessGroup(u32);
impl Drop for ProcessGroup {
    fn drop(&mut self) {
        #[cfg(unix)]
        if self.0 > 0 {
            unsafe {
                libc::kill(-(self.0 as i32), libc::SIGKILL);
            }
        }
    }
}
async fn bounded<R: AsyncRead + Unpin>(mut reader: R) -> std::io::Result<(String, usize)> {
    let mut output = Vec::new();
    let mut total = 0;
    let mut chunk = [0u8; 4096];
    loop {
        let n = reader.read(&mut chunk).await?;
        if n == 0 {
            break;
        }
        total += n;
        let keep = (64 * 1024usize).saturating_sub(output.len()).min(n);
        output.extend_from_slice(&chunk[..keep]);
    }
    Ok((String::from_utf8_lossy(&output).into_owned(), total))
}
/// Runs the exact commands from the change plan. The model cannot invent
/// verification commands: completion is tied to the plan's acceptance.
pub async fn run_verification(root: &std::path::Path, commands: &[String]) -> AppResult<Value> {
    if commands.is_empty() {
        return Err(bad_request("the plan has no verification commands"));
    }
    let mut results = Vec::new();
    let mut ok = true;
    for command in commands {
        let result = shell(root, command, None).await?;
        let passed = result["exitCode"].as_i64() == Some(0);
        results.push(json!({"command":command,"result":result}));
        if !passed {
            ok = false;
            break;
        }
    }
    Ok(json!({
        "ok": ok,
        "results": results,
        "summary": if ok {
            "Todos os comandos de verificação passaram."
        } else {
            "Um comando de verificação falhou."
        },
    }))
}

pub async fn shell(
    root: &std::path::Path,
    command: &str,
    timeout_ms: Option<u64>,
) -> AppResult<Value> {
    #[cfg(unix)]
    let mut cmd = {
        let mut c = tokio::process::Command::new("/bin/sh");
        c.arg("-lc").arg(command);
        c.process_group(0);
        c
    };
    #[cfg(windows)]
    let mut cmd = {
        let mut c = tokio::process::Command::new("cmd.exe");
        c.arg("/C").arg(command);
        c
    };
    cmd.current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = cmd.spawn()?;
    let _group = ProcessGroup(child.id().unwrap_or(0));
    let out = child
        .stdout
        .take()
        .ok_or_else(|| bad_request("Missing stdout"))?;
    let err = child
        .stderr
        .take()
        .ok_or_else(|| bad_request("Missing stderr"))?;
    let wait = async {
        let (status, out, err) = tokio::try_join!(child.wait(), bounded(out), bounded(err))?;
        Ok::<_, std::io::Error>(
            json!({"exitCode":status.code(),"stdout":out.0,"stderr":err.0,"stdoutBytes":out.1,"stderrBytes":err.1,"truncated":out.1>65536||err.1>65536}),
        )
    };
    match timeout_ms.filter(|ms| *ms > 0) {
        Some(ms) => tokio::time::timeout(Duration::from_millis(ms), wait)
            .await
            .map_err(|_| bad_request(format!("Command timed out after {ms}ms")))?
            .map_err(AppError::Io),
        None => wait.await.map_err(AppError::Io),
    }
}
