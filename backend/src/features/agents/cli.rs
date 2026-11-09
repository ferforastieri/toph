use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

use crate::ai::AiConfig;
use crate::errors::{bad_request, AppResult};

use super::models::AgentSpec;

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

#[derive(Clone, Debug, Default)]
pub struct CliUsage {
    pub input: i64,
    pub output: i64,
    pub cached: i64,
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

fn opencode_config(model: &str, system: &str, gateway: &str) -> Value {
    json!({
        "$schema": "https://opencode.ai/config.json",
        "share": "disabled",
        "autoupdate": false,
        "snapshot": false,
        "model": model,
        "mcp": {
            "servers": {
                "toph": {
                    "type": "remote",
                    "url": gateway,
                    "oauth": false,
                    "codemode": false,
                    "disabled": false
                }
            }
        },
        "permissions": [
            { "action": "*", "resource": "*", "effect": "deny" },
            { "action": "toph_*", "resource": "*", "effect": "allow" }
        ],
        "agents": {
            "toph": {
                "mode": "primary",
                "system": system
            }
        }
    })
}

/// Codex features that would give the agent its own shell, files or
/// subagents. Its only tool source must be the Toph gateway.
const CODEX_DISABLED_FEATURES: &[&str] = &[
    "shell_tool",
    "unified_exec",
    "apps",
    "plugins",
    "browser_use",
    "computer_use",
    "in_app_browser",
    "image_generation",
    "multi_agent",
    "goals",
    "view_image",
    "tool_suggest",
    "skill_search",
    "hooks",
    "memories",
];

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

/// Runs Claude Code headless with the Toph gateway as its only MCP server.
/// The JSON result carries the final text and the subscription usage.
pub async fn run_claude(
    model: &str,
    effort: &str,
    system: &str,
    prompt: &str,
    gateway: &str,
    cwd: &Path,
    cancel: &CancellationToken,
) -> AppResult<(String, CliUsage)> {
    let binary = super::engines::find_binary("claude").ok_or_else(|| {
        bad_request(
            "O Claude Code não está instalado. Instale em Configurações → Harness e tente de novo.",
        )
    })?;
    let mcp = json!({
        "mcpServers": {
            "toph": { "type": "http", "url": gateway }
        }
    })
    .to_string();
    let mut args = vec![
        "-p".to_string(),
        "--output-format".into(),
        "json".into(),
        "--system-prompt".into(),
        system.to_string(),
        "--tools".into(),
        "".into(),
        "--strict-mcp-config".into(),
        "--setting-sources".into(),
        "".into(),
        "--mcp-config".into(),
        mcp,
        "--allowedTools".into(),
        "mcp__toph".into(),
        "--no-session-persistence".into(),
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
            ("TOPH_MCP_URL", gateway.to_string()),
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

/// Runs Codex headless (`codex exec --json`) with an empty read-only sandbox
/// and the Toph gateway as its only MCP server.
pub async fn run_codex(
    model: &str,
    system: &str,
    prompt: &str,
    gateway: &str,
    cwd: &Path,
    cancel: &CancellationToken,
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
        "--ignore-user-config".into(),
        "--ignore-rules".into(),
        "--skip-git-repo-check".into(),
        "-s".into(),
        "read-only".into(),
        "-C".into(),
        cwd.display().to_string(),
        "-c".into(),
        format!(
            "developer_instructions={}",
            serde_json::to_string(system).unwrap_or_else(|_| "\"\"".into())
        ),
        "-c".into(),
        format!(
            "mcp_servers.toph.url={}",
            serde_json::to_string(gateway).unwrap_or_else(|_| "\"\"".into())
        ),
        "-c".into(),
        "mcp_servers.toph.default_tools_approval_mode=\"approve\"".into(),
        "-c".into(),
        "mcp_servers.toph.tool_timeout_sec=900".into(),
        "-c".into(),
        "project_doc_max_bytes=0".into(),
        "-c".into(),
        "skills.include_instructions=false".into(),
        "-c".into(),
        "skills.bundled.enabled=false".into(),
        "-c".into(),
        "web_search=\"disabled\"".into(),
    ];
    for feature in CODEX_DISABLED_FEATURES {
        args.push("--disable".into());
        args.push((*feature).into());
    }
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
                if item["type"].as_str() == Some("agent_message") {
                    if let Some(part) = item["text"].as_str() {
                        if !text.is_empty() {
                            text.push_str("\n\n");
                        }
                        text.push_str(part);
                    }
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

/// Runs one OpenCode turn. The CLI gets an empty working directory and only
/// the Toph gateway as a tool source; its own tools are disabled by config.
pub async fn run_opencode<F>(
    model: &str,
    system: &str,
    prompt: &str,
    gateway: &str,
    session_id: &str,
    project: &Path,
    cancel: &CancellationToken,
    mut on_text: F,
) -> AppResult<(String, CliUsage)>
where
    F: FnMut(&str),
{
    let config = opencode_config(model, system, gateway);
    // The engine runs inside the project so its reported workspace is the real
    // one. Its private home/config stays in a stable temp directory; project
    // config files are ignored so only the generated gateway config applies.
    let home = work_dir(session_id);
    let config_home = home.join(".config");
    let config_dir = config_home.join("opencode");
    tokio::fs::create_dir_all(&config_dir).await?;
    let config_path = config_dir.join("opencode.json");
    tokio::fs::write(&config_path, config.to_string()).await?;
    let real_home = std::env::var("HOME").unwrap_or_else(|_| "/home/fernando".into());
    let data_home =
        std::env::var("XDG_DATA_HOME").unwrap_or_else(|_| format!("{real_home}/.local/share"));
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
        .arg("--agent")
        .arg("toph")
        .arg("-m")
        .arg(model)
        .arg(prompt)
        .current_dir(project)
        .env("OPENCODE_CONFIG_CONTENT", config.to_string())
        .env("OPENCODE_CONFIG", &config_path)
        .env("OPENCODE_CONFIG_PROJECT_DISABLE", "1")
        .env("HOME", &home)
        .env("XDG_CONFIG_HOME", &config_home)
        .env("XDG_DATA_HOME", data_home)
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
                        // The gateway already records and shows the tool call.
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
