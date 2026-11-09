use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

use crate::ai::AiConfig;
use crate::errors::{bad_request, AppResult};

use super::models::{AgentSpec, Attachment};

/// A stable private home/config directory per Toph session. The engine now runs
/// in the project itself, but OpenCode still needs a fixed home whose config
/// survives resumed turns. It is cleaned only when the team is deleted.
pub fn work_dir(session_id: &str) -> PathBuf {
    let safe: String = session_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    std::env::temp_dir().join(format!("toph-cli-{safe}"))
}

/// Writes image attachments into the private CLI home so OpenCode can attach
/// them with `--file`. The prompt itself is plain text; without this the model
/// only sees an `artifact:` reference and cannot inspect the image.
pub async fn attachment_files(dir: &Path, attachments: &[Attachment]) -> AppResult<Vec<PathBuf>> {
    if attachments.is_empty() {
        return Ok(Vec::new());
    }
    tokio::fs::create_dir_all(dir).await?;
    let mut files = Vec::new();
    for (index, attachment) in attachments.iter().enumerate() {
        if !attachment.mime.starts_with("image/") {
            continue;
        }
        let Some((_, encoded)) = attachment.uri.split_once(";base64,") else {
            continue;
        };
        let data = STANDARD
            .decode(encoded)
            .map_err(|error| bad_request(error.to_string()))?;
        let original = Path::new(&attachment.name)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("imagem");
        let safe = original
            .chars()
            .map(|ch| {
                if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                    ch
                } else {
                    '_'
                }
            })
            .collect::<String>();
        let extension = match attachment.mime.as_str() {
            "image/jpeg" => "jpg",
            "image/webp" => "webp",
            "image/gif" => "gif",
            _ => "png",
        };
        let name = if Path::new(&safe).extension().is_some() {
            safe
        } else {
            format!("{safe}.{extension}")
        };
        let path = dir.join(format!("{index}-{name}"));
        tokio::fs::write(&path, data).await?;
        files.push(path);
    }
    Ok(files)
}

#[derive(Clone, Debug, Default)]
pub struct CliUsage {
    pub input: i64,
    pub output: i64,
    pub cached: i64,
}

/// A completed tool call reported by a native harness. The runtime stores it
/// as a normal Toph tool message so the transcript keeps the same shape.
#[derive(Clone, Debug)]
pub struct NativeTool {
    pub id: String,
    pub name: String,
    pub input: Value,
    pub output: Value,
    pub error: Option<String>,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
}

/// Maps a Toph connection to the provider id OpenCode uses for the same API.
/// `custom` connections are identified by their base URL; unknown endpoints
/// keep the OpenCode Go default so a legacy model id still has a valid shape.
fn opencode_provider(config: &AiConfig) -> &'static str {
    match config.provider.as_str() {
        "openai" => "openai",
        "anthropic" => "anthropic",
        "gemini" | "google" => "google",
        "ollama" => "ollama",
        "openrouter" => "openrouter",
        "groq" => "groq",
        "mistral" => "mistral",
        "deepseek" => "deepseek",
        "xai" | "grok" => "xai",
        "opencode-go" | "opencode" => "opencode-go",
        "custom" => {
            let url = config.base_url.as_str();
            if url.contains("opencode.ai") {
                "opencode-go"
            } else if url.contains("openrouter.ai") {
                "openrouter"
            } else if url.contains("generativelanguage.googleapis.com") {
                "google"
            } else if url.contains("api.groq.com") {
                "groq"
            } else if url.contains("api.deepseek.com") {
                "deepseek"
            } else if url.contains("api.mistral.ai") {
                "mistral"
            } else if url.contains("api.x.ai") {
                "xai"
            } else if url.contains("api.openai.com") {
                "openai"
            } else if url.contains("api.anthropic.com") {
                "anthropic"
            } else {
                "opencode-go"
            }
        }
        _ => "opencode-go",
    }
}

/// The model OpenCode should run. Existing Toph model ids are migrated:
/// `default::deepseek-v4.1-flash` becomes `opencode-go/deepseek-v4.1-flash`,
/// and a named connection keeps its real provider (`openai/gpt-5`). The
/// selected reasoning effort becomes the OpenCode variant (`model#max`).
pub fn opencode_model(agent: &AgentSpec, config: &AiConfig) -> String {
    let selected = if agent.model.trim().is_empty() {
        config.model.trim()
    } else {
        agent.model.trim()
    };
    let config_model = config
        .model
        .trim()
        .strip_prefix("default::")
        .unwrap_or(config.model.trim());
    let model = if let Some(model) = selected.strip_prefix("default::") {
        format!("{}/{}", opencode_provider(config), model)
    } else if let Some((_, model)) = selected.split_once("::") {
        format!("{}/{}", opencode_provider(config), model)
    } else if selected.contains('/') {
        selected.to_string()
    } else if selected.is_empty() {
        format!("{}/{}", opencode_provider(config), config_model)
    } else {
        format!("opencode-go/{selected}")
    };
    let effort: String = agent
        .effort
        .trim()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
        .collect();
    if effort.is_empty() || model.contains('#') {
        model
    } else {
        format!("{model}#{effort}")
    }
}

fn tail(text: &str) -> String {
    let chars = text.chars().collect::<Vec<_>>();
    chars[chars.len().saturating_sub(2_000)..].iter().collect()
}

fn provider_model(model: &str, accepted: &[&str]) -> Option<String> {
    if model.trim().is_empty() {
        return None;
    }
    let value = model.rsplit("::").next().unwrap_or(model);
    let value = value.rsplit('/').next().unwrap_or(value);
    let lower = value.to_lowercase();
    accepted
        .iter()
        .any(|needle| lower.contains(needle))
        .then(|| value.to_string())
}

/// Runs a CLI once, with the prompt on stdin, and captures both streams.
/// The whole process group is killed when the run is cancelled.
async fn run_capture(
    binary: &Path,
    args: &[String],
    envs: &[(&str, String)],
    cwd: &Path,
    prompt: &str,
    cancel: &CancellationToken,
) -> AppResult<(String, String)> {
    let mut command = Command::new(binary);
    command
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    for (key, value) in envs {
        command.env(key, value);
    }
    #[cfg(unix)]
    command.process_group(0);
    let mut child = command.spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            bad_request("A CLI do harness não está instalada.")
        } else {
            crate::errors::AppError::Io(error)
        }
    })?;
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin.write_all(prompt.as_bytes()).await?;
    }
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| bad_request("A CLI não abriu stdout."))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| bad_request("A CLI não abriu stderr."))?;
    let out = tokio::spawn(async move {
        use tokio::io::AsyncReadExt;
        let mut reader = BufReader::new(stdout);
        let mut buffer = Vec::new();
        reader.read_to_end(&mut buffer).await?;
        Ok::<_, std::io::Error>(buffer)
    });
    let err = tokio::spawn(async move {
        use tokio::io::AsyncReadExt;
        let mut reader = BufReader::new(stderr);
        let mut buffer = Vec::new();
        reader.read_to_end(&mut buffer).await?;
        Ok::<_, std::io::Error>(buffer)
    });
    let status = tokio::select! {
        _ = cancel.cancelled() => {
            let _ = child.kill().await;
            return Err(bad_request("Execution cancelled"));
        }
        status = child.wait() => status?,
    };
    let stdout = out
        .await
        .map_err(|error| crate::errors::internal(error.to_string()))??;
    let stderr = err
        .await
        .map_err(|error| crate::errors::internal(error.to_string()))??;
    let stdout = String::from_utf8_lossy(&stdout).to_string();
    let stderr = String::from_utf8_lossy(&stderr).to_string();
    if !status.success() {
        return Err(bad_request(format!(
            "A CLI saiu com código {}. {}",
            status.code().unwrap_or(-1),
            tail(&stderr)
        )));
    }
    Ok((stdout, stderr))
}

/// Runs Claude Code headless with its native harness: native tools, project
/// config/skills and the Toph system prompt. Toph still owns the chat, run
/// state and final transcript.
pub async fn run_claude(
    model: &str,
    effort: &str,
    prompt: &str,
    cwd: &Path,
    cancel: &CancellationToken,
    _on_tool: &mut (dyn FnMut(NativeTool) + Send),
) -> AppResult<(String, CliUsage)> {
    let binary = super::engines::find_binary("claude").ok_or_else(|| {
        bad_request(
            "O Claude Code não está instalado. Instale em Configurações → Harness e tente de novo.",
        )
    })?;
    let mut args = vec![
        "-p".to_string(),
        "--output-format".into(),
        "json".into(),
        "--dangerously-skip-permissions".into(),
    ];
    if let Some(model) = provider_model(model, &["claude", "sonnet", "opus", "haiku"]) {
        args.push("--model".into());
        args.push(model);
    }
    if !effort.trim().is_empty() {
        args.push("--effort".into());
        args.push(effort.trim().to_string());
    }
    let (stdout, stderr) = run_capture(
        &binary,
        &args,
        &[
            ("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1".into()),
            ("MCP_TOOL_TIMEOUT", "900000".into()),
        ],
        cwd,
        prompt,
        cancel,
    )
    .await?;
    let value = serde_json::from_str::<Value>(stdout.trim())
        .ok()
        .or_else(|| {
            stdout
                .lines()
                .rev()
                .find_map(|line| serde_json::from_str::<Value>(line).ok())
        });
    let Some(value) = value else {
        if stdout.trim().is_empty() {
            return Err(bad_request(format!(
                "O Claude Code saiu sem resposta. {}",
                tail(&stderr)
            )));
        }
        return Ok((stdout.trim().to_string(), CliUsage::default()));
    };
    if value["is_error"].as_bool() == Some(true) || value["subtype"].as_str() != Some("success") {
        return Err(bad_request(
            value["result"]
                .as_str()
                .filter(|text| !text.trim().is_empty())
                .unwrap_or("O Claude Code terminou com erro.")
                .to_string(),
        ));
    }
    let text = value["result"].as_str().unwrap_or("").trim().to_string();
    if text.is_empty() {
        return Err(bad_request("O Claude Code terminou sem resposta."));
    }
    let usage = &value["usage"];
    let cached = usage["cache_read_input_tokens"].as_i64().unwrap_or(0);
    Ok((
        text,
        CliUsage {
            input: usage["input_tokens"].as_i64().unwrap_or(0)
                + cached
                + usage["cache_creation_input_tokens"].as_i64().unwrap_or(0),
            output: usage["output_tokens"].as_i64().unwrap_or(0),
            cached,
        },
    ))
}

/// Runs Codex headless with its native harness (`codex exec --json`). Native
/// shell/edit/search tools are enabled; Toph only stores the run and messages.
pub async fn run_codex(
    model: &str,
    prompt: &str,
    cwd: &Path,
    cancel: &CancellationToken,
    on_tool: &mut (dyn FnMut(NativeTool) + Send),
) -> AppResult<(String, CliUsage)> {
    let binary = super::engines::find_binary("codex").ok_or_else(|| {
        bad_request(
            "O Codex não está instalado. Instale em Configurações → Harness e tente de novo.",
        )
    })?;
    let mut args = vec![
        "exec".to_string(),
        "--json".into(),
        "--ephemeral".into(),
        "--skip-git-repo-check".into(),
        "--full-auto".into(),
        "-C".into(),
        cwd.display().to_string(),
    ];
    if let Some(model) = provider_model(model, &["gpt", "codex", "o3", "o4", "chatgpt"]) {
        args.push("-m".into());
        args.push(model);
    }
    args.push("-".into());
    let (stdout, stderr) = run_capture(&binary, &args, &[], cwd, prompt, cancel).await?;
    let mut text = String::new();
    let mut usage = CliUsage::default();
    let mut error: Option<String> = None;
    for line in stdout.lines() {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        match value["type"].as_str().unwrap_or("") {
            "item.completed" => {
                let item = &value["item"];
                let kind = item["type"].as_str().unwrap_or("");
                if kind == "agent_message" {
                    if let Some(part) = item["text"].as_str() {
                        if !text.is_empty() {
                            text.push_str("\n\n");
                        }
                        text.push_str(part);
                    }
                }
                let id = item["id"].as_str().unwrap_or("").to_string();
                let (name, input, output, tool_error) = match kind {
                    "command_execution" => {
                        let exit = item["exit_code"].as_i64().unwrap_or(0);
                        (
                            "shell".to_string(),
                            json!({"command": item["command"]}),
                            json!({
                                "exitCode": exit,
                                "stdout": item["aggregated_output"].as_str().unwrap_or(""),
                                "stderr": ""
                            }),
                            (exit != 0).then(|| format!("exit code {exit}")),
                        )
                    }
                    "file_change" => (
                        "edit_file".to_string(),
                        json!({"changes": item["changes"]}),
                        item["changes"].clone(),
                        None,
                    ),
                    "mcp_tool_call" => (
                        "mcp_call".to_string(),
                        json!({"server": item["server"], "tool": item["tool"], "arguments": item["arguments"]}),
                        item["result"].clone(),
                        None,
                    ),
                    _ => continue,
                };
                if !id.is_empty() {
                    on_tool(NativeTool {
                        id,
                        name,
                        input,
                        output,
                        error: tool_error,
                        started_at: None,
                        finished_at: None,
                    });
                }
            }
            "turn.completed" => {
                let raw = &value["usage"];
                usage.cached = raw["cached_input_tokens"].as_i64().unwrap_or(0);
                usage.input = raw["input_tokens"].as_i64().unwrap_or(0) + usage.cached;
                usage.output = raw["output_tokens"].as_i64().unwrap_or(0);
            }
            "turn.failed" | "error" => {
                error = Some(
                    value["error"]["message"]
                        .as_str()
                        .or_else(|| value["message"].as_str())
                        .unwrap_or("O Codex terminou com erro.")
                        .to_string(),
                );
            }
            _ => {}
        }
    }
    if let Some(error) = error {
        return Err(bad_request(error));
    }
    if text.trim().is_empty() {
        return Err(bad_request(format!(
            "O Codex saiu sem resposta. {}",
            tail(&stderr)
        )));
    }
    Ok((text, usage))
}

/// Runs one OpenCode turn with its native harness. Native tools, project
/// config, skills and plugins stay available; Toph injects identity and stores
/// the transcript.
pub async fn run_opencode<F, T>(
    model: &str,
    prompt: &str,
    session_id: &str,
    project: &Path,
    attachments: &[Attachment],
    cancel: &CancellationToken,
    mut on_text: F,
    mut on_tool: T,
) -> AppResult<(String, CliUsage)>
where
    F: FnMut(&str),
    T: FnMut(NativeTool) + Send,
{
    let home = work_dir(session_id);
    let files = attachment_files(&home.join("attachments"), attachments).await?;
    // systemd starts Toph with a minimal PATH; resolve the CLI the same way the
    // Settings detector does instead of relying on PATH containing ~/.local/bin.
    let binary = super::engines::find_binary("opencode").ok_or_else(|| {
        bad_request(
            "O OpenCode não está instalado. Instale em Configurações → CLIs e tente de novo.",
        )
    })?;
    let mut command = Command::new(&binary);
    command
        // A private server keeps this run's config and permissions out of the
        // user's shared OpenCode service.
        .arg("--standalone")
        .arg("--log-level")
        .arg("error")
        .arg("run")
        .arg("--session")
        .arg(session_id)
        .arg("--format")
        .arg("json")
        .arg("--auto")
        .arg("-m")
        .arg(model);
    for file in &files {
        command.arg("--file").arg(file);
    }
    command
        .arg(prompt)
        .current_dir(project)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    command.process_group(0);
    let mut child = command.spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            bad_request(
                "O OpenCode não está instalado. Instale em Configurações → CLIs e tente de novo.",
            )
        } else {
            crate::errors::AppError::Io(error)
        }
    })?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| bad_request("OpenCode sem stdout"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| bad_request("OpenCode sem stderr"))?;
    let mut lines = BufReader::new(stdout).lines();
    let mut err_lines = BufReader::new(stderr).lines();
    let mut text = String::new();
    let mut usage = CliUsage::default();
    let mut error: Option<String> = None;
    loop {
        tokio::select! {
            _=cancel.cancelled()=>{
                let _=child.kill().await;
                return Err(bad_request("Execution cancelled"));
            }
            line=lines.next_line()=>{
                let Ok(Some(line))=line else { break; };
                let Ok(value)=serde_json::from_str::<Value>(&line) else { continue };
                match value["type"].as_str().unwrap_or("") {
                    "text" => {
                        if let Some(part)=value["part"]["text"].as_str() {
                            if !part.is_empty() {
                                text.push_str(part);
                                on_text(part);
                            }
                        }
                    }
                    "tool_use" => {
                        let part = &value["part"];
                        let state = &part["state"];
                        let status = state["status"].as_str().unwrap_or("completed");
                        if status != "completed" && status != "error" { continue; }
                        let id = part["id"].as_str().unwrap_or("").to_string();
                        let name = part["tool"].as_str().unwrap_or("tool").to_string();
                        let input = state["input"].clone();
                        let output = if state["output"].is_null() {
                            state["metadata"]["content"].clone()
                        } else {
                            state["output"].clone()
                        };
                        let error = if status == "error" {
                            state["error"].as_str().map(str::to_string)
                                .or_else(|| state["output"].as_str().map(str::to_string))
                        } else { None };
                        if !id.is_empty() {
                            on_tool(NativeTool {
                                id,
                                name,
                                input,
                                output,
                                error,
                                started_at: state["time"]["start"].as_i64(),
                                finished_at: state["time"]["end"].as_i64(),
                            });
                        }
                    }
                    "step_finish" => {
                        let tokens=&value["part"]["tokens"];
                        usage.input += tokens["input"].as_i64().unwrap_or(0)
                            + tokens["cache"]["read"].as_i64().unwrap_or(0)
                            + tokens["cache"]["write"].as_i64().unwrap_or(0);
                        usage.cached += tokens["cache"]["read"].as_i64().unwrap_or(0);
                        usage.output += tokens["output"].as_i64().unwrap_or(0)
                            + tokens["reasoning"].as_i64().unwrap_or(0);
                    }
                    "error" => {
                        let data=&value["error"]["data"];
                        error=Some(
                            data["message"].as_str()
                                .or_else(|| value["error"]["message"].as_str())
                                .or_else(|| value["error"]["name"].as_str())
                                .unwrap_or("OpenCode terminou com erro.")
                                .to_string(),
                        );
                    }
                    _ => {}
                }
            }
            line=err_lines.next_line()=>{
                if let Ok(Some(line))=line {
                    if !line.trim().is_empty() {
                        error=Some(line);
                    }
                }
            }
        }
    }
    let status = child.wait().await?;
    if !status.success() {
        return Err(bad_request(error.unwrap_or_else(|| {
            format!("OpenCode saiu com código {}", status.code().unwrap_or(-1))
        })));
    }
    if let Some(error) = error {
        if text.trim().is_empty() {
            return Err(bad_request(error));
        }
    }
    Ok((text, usage))
}
