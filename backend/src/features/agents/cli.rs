use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

use crate::ai::AiConfig;
use crate::errors::{bad_request, AppResult};

use super::models::{AgentSpec, Attachment};
use super::skill_service::ManagedSkill;
use crate::features::integrations::mcp::Server;

/// A stable private home/config directory per Toph session. The engine runs in
/// the project itself, but native harnesses need a fixed home whose config and
/// session files survive resumed turns and server restarts. It lives under the
/// data directory and is cleaned only when the chat/Toph is deleted.
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
    let base = std::env::var_os("TOPH_CLI_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("TOPH_DATA_DIR").map(|dir| PathBuf::from(dir).join("cli")))
        .unwrap_or_else(std::env::temp_dir);
    base.join(format!("toph-cli-{safe}"))
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

/// Toph-only tools selected for one Toph (email connector and image
/// generation), exposed as a native stdio MCP server. The harness sees normal
/// MCP tools and executes them itself; there is no Toph gateway.
pub fn native_server(
    project_id: &str,
    project_root: &Path,
    tools: &[String],
    accounts: &[String],
) -> Option<Server> {
    let image = tools.iter().any(|tool| tool == "generate_image");
    if accounts.is_empty() && !image {
        return None;
    }
    let executable = std::env::current_exe().ok()?;
    let mut env = HashMap::new();
    if !accounts.is_empty() {
        env.insert("TOPH_EMAIL_ACCOUNTS".into(), accounts.join(","));
    }
    if image {
        env.insert("TOPH_TOOLS".into(), "generate_image".into());
        env.insert("TOPH_PROJECT_ID".into(), project_id.into());
        env.insert(
            "TOPH_PROJECT_ROOT".into(),
            project_root.display().to_string(),
        );
    }
    Some(Server {
        id: "toph-tools".into(),
        name: "toph_tools".into(),
        transport: "stdio".into(),
        url: String::new(),
        command: vec![executable.display().to_string(), "mcp-tools".into()],
        env,
        token: String::new(),
        timeout_seconds: 120,
        auto_approve: true,
    })
}

/// A stable UUID for a Toph conversation, used by Claude Code's native
/// session id/resume flags.
pub fn session_uuid(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

fn safe_name(value: &str) -> String {
    let name: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect();
    let name = name.trim_matches('_').to_string();
    if name.is_empty() {
        "mcp".into()
    } else {
        name.chars().take(40).collect()
    }
}

/// Materializes the Toph-managed skills as native SKILL.md files. OpenCode,
/// Claude and Codex all discover skills from files, so this is configuration,
/// not a prompt wrapper.
async fn materialize_skills(work: &Path, skills: &[ManagedSkill]) -> AppResult<Option<PathBuf>> {
    if skills.is_empty() {
        return Ok(None);
    }
    let root = work.join("skills");
    tokio::fs::create_dir_all(&root).await?;
    for (index, skill) in skills.iter().enumerate() {
        let id = safe_name(if skill.id.is_empty() {
            &skill.name
        } else {
            &skill.id
        });
        let folder = root.join(format!("{index}-{id}"));
        tokio::fs::create_dir_all(&folder).await?;
        // The native harnesses use this as a command name, so keep it a slug.
        let name = format!("{index}-{id}");
        let description = skill.description.replace('\n', " ").replace('"', "'");
        let body = format!(
            "---\nname: \"{name}\"\ndescription: \"{description}\"\n---\n\n{}\n",
            skill.body
        );
        tokio::fs::write(folder.join("SKILL.md"), body).await?;
    }
    Ok(Some(root))
}

/// Native MCP configuration with secrets passed through process environment
/// placeholders, never written into the generated config file.
fn native_mcp(servers: &[Server], envs: &mut HashMap<String, String>) -> Value {
    let mut out = serde_json::Map::new();
    for (index, server) in servers.iter().enumerate() {
        let base = safe_name(&server.name);
        let mut name = base.clone();
        let mut suffix = 2;
        while out.contains_key(&name) {
            name = format!("{base}_{suffix}");
            suffix += 1;
        }
        let timeout = server.timeout_seconds.clamp(5, 600) * 1000;
        let mut entry = if server.transport == "http" {
            let mut value = json!({
                "type": "remote",
                "url": server.url,
                "oauth": false,
                "timeout": { "startup": timeout, "execution": timeout },
            });
            if !server.token.is_empty() {
                let key = format!("TOPH_MCP_{index}_TOKEN");
                envs.insert(key.clone(), server.token.clone());
                value["headers"] = json!({"Authorization": format!("Bearer {{env:{key}}}")});
            }
            value
        } else {
            let mut environment = serde_json::Map::new();
            for (key, value) in &server.env {
                let env_key = format!("TOPH_MCP_{index}_{}", safe_name(key).to_uppercase());
                envs.insert(env_key.clone(), value.clone());
                environment.insert(key.clone(), json!(format!("{{env:{env_key}}}")));
            }
            let mut value = json!({
                "type": "local",
                "command": server.command,
                "timeout": { "startup": timeout, "execution": timeout },
            });
            if !environment.is_empty() {
                value["environment"] = Value::Object(environment);
            }
            value
        };
        entry["codemode"] = json!(false);
        out.insert(name, entry);
    }
    Value::Object(out)
}

fn claude_mcp_config(servers: &[Server], envs: &mut HashMap<String, String>) -> Value {
    let mut out = serde_json::Map::new();
    for (index, server) in servers.iter().enumerate() {
        let base = safe_name(&server.name);
        let mut name = base.clone();
        let mut suffix = 2;
        while out.contains_key(&name) {
            name = format!("{base}_{suffix}");
            suffix += 1;
        }
        let entry = if server.transport == "http" {
            let mut value = json!({
                "type": "http",
                "url": server.url,
            });
            if !server.token.is_empty() {
                let key = format!("TOPH_MCP_{index}_TOKEN");
                envs.insert(key.clone(), server.token.clone());
                value["headers"] = json!({"Authorization": format!("Bearer ${{{key}}}")});
            }
            value
        } else {
            let command = server.command.first().cloned().unwrap_or_default();
            let args = server.command.iter().skip(1).cloned().collect::<Vec<_>>();
            let mut value = json!({
                "type": "stdio",
                "command": command,
                "args": args,
            });
            if !server.env.is_empty() {
                let mut environment = serde_json::Map::new();
                for (key, value) in &server.env {
                    let env_key = format!("TOPH_MCP_{index}_{}", safe_name(key).to_uppercase());
                    envs.insert(env_key.clone(), value.clone());
                    environment.insert(key.clone(), json!(format!("${{{env_key}}}")));
                }
                value["env"] = Value::Object(environment);
            }
            value
        };
        out.insert(name, entry);
    }
    json!({"mcpServers": out})
}

/// Builds a session-only Claude plugin containing the skills selected for
/// this Toph. The user's own `~/.claude/skills` and project skills stay
/// untouched and available.
async fn claude_plugin(work: &Path, skills: &[ManagedSkill]) -> AppResult<Option<PathBuf>> {
    if skills.is_empty() {
        return Ok(None);
    }
    let root = work.join("claude-plugin");
    materialize_skills(&root, skills).await?;
    let manifest_dir = root.join(".claude-plugin");
    tokio::fs::create_dir_all(&manifest_dir).await?;
    let name = work
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| safe_name(name).replace('_', "-"))
        .unwrap_or_else(|| "toph-skills".into());
    tokio::fs::write(
        manifest_dir.join("plugin.json"),
        json!({
            "name": format!("toph-{name}"),
            "version": "1.0.0",
            "description": "Skills selected for this Toph"
        })
        .to_string(),
    )
    .await?;
    Ok(Some(root))
}

fn opencode_config(system: &str, skills: Option<&Path>, mcp: Value) -> Value {
    let mut config = json!({
        "$schema": "https://opencode.ai/config.json",
        "share": "disabled",
        "autoupdate": false,
        "snapshot": false,
        "agents": {
            "toph": {
                "mode": "primary",
                "system": system
            }
        }
    });
    if let Some(root) = skills {
        config["skills"] = json!([root.display().to_string()]);
    }
    if mcp
        .as_object()
        .map(|items| !items.is_empty())
        .unwrap_or(false)
    {
        config["mcp"] = json!({"servers": mcp});
    }
    config
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
async fn run_capture<S: AsRef<str>>(
    binary: &Path,
    args: &[String],
    envs: &[(S, String)],
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
        command.env(key.as_ref(), value);
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
    system: &str,
    prompt: &str,
    cwd: &Path,
    skills: &[ManagedSkill],
    mcp_servers: &[Server],
    session: &str,
    resume: bool,
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
        "--append-system-prompt".into(),
        system.to_string(),
    ];
    if resume {
        args.push("--resume".into());
        args.push(session.to_string());
    } else {
        args.push("--session-id".into());
        args.push(session.to_string());
    }
    if let Some(model) = provider_model(model, &["claude", "sonnet", "opus", "haiku"]) {
        args.push("--model".into());
        args.push(model);
    }
    if !effort.trim().is_empty() {
        args.push("--effort".into());
        args.push(effort.trim().to_string());
    }
    if let Some(plugin) = claude_plugin(cwd, skills).await? {
        args.push("--plugin-dir".into());
        args.push(plugin.display().to_string());
    }
    let mut secrets = HashMap::new();
    if !mcp_servers.is_empty() {
        tokio::fs::create_dir_all(cwd).await?;
        let path = cwd.join("toph-mcp.json");
        tokio::fs::write(
            &path,
            claude_mcp_config(mcp_servers, &mut secrets).to_string(),
        )
        .await?;
        args.push("--mcp-config".into());
        args.push(path.display().to_string());
    }
    let mut environment = vec![
        ("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1".into()),
        ("MCP_TOOL_TIMEOUT", "900000".into()),
    ];
    environment.extend(
        secrets
            .iter()
            .map(|(key, value)| (key.as_str(), value.clone())),
    );
    let (stdout, stderr) = run_capture(&binary, &args, &environment, cwd, prompt, cancel).await?;
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

#[cfg(unix)]
async fn link_or_copy(from: &Path, to: &Path) -> AppResult<()> {
    if tokio::fs::symlink(from, to).await.is_err() && from.is_file() {
        tokio::fs::copy(from, to).await?;
    }
    Ok(())
}

/// Builds a private Codex home that keeps the user's native auth/config and
/// adds the skills selected for this Toph. Codex reads skills from
/// `$CODEX_HOME/skills`; the real `$HOME/.agents/skills` still loads because
/// only `CODEX_HOME` changes, not `HOME`.
async fn codex_home(work: &Path, skills: &[ManagedSkill]) -> AppResult<PathBuf> {
    let root = work.join("codex");
    let skills_root = root.join("skills");
    tokio::fs::create_dir_all(&skills_root).await?;
    let real = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".codex")));
    if let Some(real) = real {
        for name in ["auth.json", "config.toml", "instructions.md"] {
            let from = real.join(name);
            let to = root.join(name);
            if tokio::fs::try_exists(&from).await.unwrap_or(false)
                && !tokio::fs::try_exists(&to).await.unwrap_or(false)
            {
                #[cfg(unix)]
                link_or_copy(&from, &to).await?;
                #[cfg(not(unix))]
                if from.is_file() {
                    tokio::fs::copy(&from, &to).await?;
                }
            }
        }
        if let Ok(mut entries) = tokio::fs::read_dir(real.join("skills")).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let name = entry.file_name();
                if name == ".system" {
                    continue;
                }
                let to = skills_root.join(&name);
                if !tokio::fs::try_exists(&to).await.unwrap_or(false) {
                    #[cfg(unix)]
                    link_or_copy(&entry.path(), &to).await?;
                }
            }
        }
    }
    materialize_skills(&root, skills).await?;
    Ok(root)
}

/// Runs Codex headless with its native harness (`codex exec --json`). Native
/// shell/edit/search tools are enabled; Toph only stores the run and messages.
pub async fn run_codex(
    model: &str,
    system: &str,
    prompt: &str,
    cwd: &Path,
    skills: &[ManagedSkill],
    mcp_servers: &[Server],
    session: Option<&str>,
    cancel: &CancellationToken,
    on_tool: &mut (dyn FnMut(NativeTool) + Send),
) -> AppResult<(String, CliUsage, Option<String>)> {
    let binary = super::engines::find_binary("codex").ok_or_else(|| {
        bad_request(
            "O Codex não está instalado. Instale em Configurações → Harness e tente de novo.",
        )
    })?;
    let mut args = vec!["exec".to_string(), "--json".into()];
    if let Some(session) = session {
        args.push("resume".into());
        args.push(session.to_string());
    }
    args.extend([
        "--skip-git-repo-check".into(),
        "--sandbox".into(),
        "danger-full-access".into(),
        "-C".into(),
        cwd.display().to_string(),
        "-c".into(),
        format!(
            "developer_instructions={}",
            serde_json::to_string(system).unwrap_or_else(|_| "\"\"".into())
        ),
    ]);
    let mut envs: Vec<(String, String)> = Vec::new();
    for (index, server) in mcp_servers.iter().enumerate() {
        let name = safe_name(&server.name);
        if server.transport == "http" {
            args.push("-c".into());
            args.push(format!(
                "mcp_servers.{name}.url={}",
                serde_json::to_string(&server.url).unwrap_or_default()
            ));
            if !server.token.is_empty() {
                let key = format!("TOPH_MCP_{index}_TOKEN");
                envs.push((key.clone(), server.token.clone()));
                args.push("-c".into());
                args.push(format!("mcp_servers.{name}.bearer_token_env_var={key:?}"));
            }
        } else if !server.command.is_empty() {
            args.push("-c".into());
            args.push(format!(
                "mcp_servers.{name}.command={}",
                serde_json::to_string(&server.command).unwrap_or_default()
            ));
            for (key, value) in &server.env {
                args.push("-c".into());
                args.push(format!(
                    "mcp_servers.{name}.env.{key}={}",
                    serde_json::to_string(value).unwrap_or_default()
                ));
            }
        }
    }
    if let Some(model) = provider_model(model, &["gpt", "codex", "o3", "o4", "chatgpt"]) {
        args.push("-m".into());
        args.push(model);
    }
    args.push("-".into());
    let codex_home = codex_home(cwd, skills).await?;
    envs.push(("CODEX_HOME".into(), codex_home.display().to_string()));
    let (stdout, stderr) = run_capture(&binary, &args, &envs, cwd, prompt, cancel).await?;
    let mut text = String::new();
    let mut usage = CliUsage::default();
    let mut error: Option<String> = None;
    let mut thread_id: Option<String> = None;
    for line in stdout.lines() {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        match value["type"].as_str().unwrap_or("") {
            "thread.started" => {
                thread_id = value["thread_id"].as_str().map(str::to_string);
            }
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
    Ok((text, usage, thread_id))
}

/// Runs one OpenCode turn with its native harness. Native tools, project
/// config, skills and plugins stay available; Toph injects identity and stores
/// the transcript.
pub async fn run_opencode<F, T>(
    model: &str,
    system: &str,
    prompt: &str,
    session_id: &str,
    project: &Path,
    attachments: &[Attachment],
    skills: &[ManagedSkill],
    mcp_servers: &[Server],
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
    let skill_root = materialize_skills(&home, skills).await?;
    let mut envs = HashMap::new();
    let config = opencode_config(
        system,
        skill_root.as_deref(),
        native_mcp(mcp_servers, &mut envs),
    );
    tokio::fs::create_dir_all(&home).await?;
    let config_path = home.join("opencode.json");
    tokio::fs::write(&config_path, config.to_string()).await?;
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
        .arg("--agent")
        .arg("toph")
        .arg("-m")
        .arg(model);
    for file in &files {
        command.arg("--file").arg(file);
    }
    command
        .arg(prompt)
        .current_dir(project)
        .env("OPENCODE_CONFIG", &config_path)
        .envs(&envs)
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
