use std::path::Path;
use std::process::Stdio;

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

use crate::ai::AiConfig;
use crate::errors::{bad_request, AppResult};

use super::models::AgentSpec;

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

/// Runs one OpenCode turn. The CLI gets an empty working directory and only
/// the Toph gateway as a tool source; its own tools are disabled by config.
pub async fn run_opencode<F>(
    model: &str,
    system: &str,
    prompt: &str,
    gateway: &str,
    session_id: &str,
    cwd: &Path,
    cancel: &CancellationToken,
    mut on_text: F,
) -> AppResult<(String, CliUsage)>
where
    F: FnMut(&str),
{
    let config = opencode_config(model, system, gateway);
    let config_home = cwd.join(".config");
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
        .current_dir(cwd)
        .env("OPENCODE_CONFIG_CONTENT", config.to_string())
        .env("OPENCODE_CONFIG", &config_path)
        .env("HOME", cwd)
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
