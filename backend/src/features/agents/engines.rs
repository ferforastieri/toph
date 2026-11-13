use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::{json, Value};
use tokio::process::Command;

use crate::errors::{bad_request, AppError, AppResult};

/// External agent harnesses. Only the ones marked `supported` are wired to the
/// Toph runtime; the rest are listed so the UI can show what is installed and
/// how to install it.
#[derive(Clone, Copy)]
pub struct Engine {
    pub id: &'static str,
    pub label: &'static str,
    pub binary: &'static str,
    pub login: &'static str,
    pub install: &'static str,
    pub site: &'static str,
    pub supported: bool,
}

pub const ENGINES: &[Engine] = &[
    Engine {
        id: "opencode",
        label: "OpenCode",
        binary: "opencode",
        login: "opencode auth login",
        install: "curl -fsSL https://opencode.ai/v2/install | bash",
        site: "https://opencode.ai",
        supported: true,
    },
    Engine {
        id: "claude",
        label: "Claude Code",
        binary: "claude",
        login: "claude auth login",
        install: "curl -fsSL https://claude.ai/install.sh | bash",
        site: "https://code.claude.com",
        supported: true,
    },
    Engine {
        id: "codex",
        label: "Codex",
        binary: "codex",
        login: "codex login",
        install: "npm install -g @openai/codex",
        site: "https://github.com/openai/codex",
        supported: true,
    },
    Engine {
        id: "cursor",
        label: "Cursor CLI",
        binary: "cursor-agent",
        login: "cursor-agent login",
        install: "curl https://cursor.com/install -fsS | bash",
        site: "https://cursor.com/cli",
        supported: false,
    },
    Engine {
        id: "grok",
        label: "Grok",
        binary: "grok",
        login: "grok login",
        install: "curl -fsSL https://x.ai/cli/install.sh | bash",
        site: "https://x.ai/cli",
        supported: false,
    },
    Engine {
        id: "pi",
        label: "Pi",
        binary: "pi",
        login: "pi",
        install: "npm install -g @earendil-works/pi-coding-agent",
        site: "https://pi.dev",
        supported: false,
    },
    Engine {
        id: "gemini",
        label: "Gemini CLI",
        binary: "gemini",
        login: "gemini",
        install: "npm install -g @google/gemini-cli",
        site: "https://github.com/google-gemini/gemini-cli",
        supported: false,
    },
];

pub fn label(id: &str) -> String {
    engine(id)
        .map(|engine| engine.label.to_string())
        .unwrap_or_else(|_| id.to_string())
}

fn engine(id: &str) -> AppResult<&'static Engine> {
    ENGINES
        .iter()
        .find(|engine| engine.id == id)
        .ok_or_else(|| bad_request(format!("CLI desconhecida: {id}")))
}

fn executable(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

/// Finds a CLI even when the daemon's PATH was captured before the user
/// installed it, which is the normal case inside the LXC.
pub fn find_binary(binary: &str) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&path).map(|dir| dir.join(binary)));
    }
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        candidates.push(home.join(".opencode/bin").join(binary));
        candidates.push(home.join(".local/bin").join(binary));
        candidates.push(home.join(".cargo/bin").join(binary));
        candidates.push(home.join(".claude/local").join(binary));
        candidates.push(home.join(".npm-global/bin").join(binary));
        candidates.push(home.join(".bun/bin").join(binary));
        candidates.push(home.join(".volta/bin").join(binary));
        candidates.push(home.join(".local/share/pnpm").join(binary));
    }
    candidates.push(PathBuf::from("/usr/local/bin").join(binary));
    candidates.push(PathBuf::from("/usr/bin").join(binary));
    candidates.into_iter().find(|path| executable(path))
}

pub fn list() -> Vec<Value> {
    ENGINES
        .iter()
        .map(|engine| {
            let path = find_binary(engine.binary);
            json!({
                "id": engine.id,
                "label": engine.label,
                "binary": engine.binary,
                "installed": path.is_some(),
                "path": path.map(|path| path.display().to_string()),
                "login": engine.login,
                "install": engine.install,
                "site": engine.site,
                "supported": engine.supported,
            })
        })
        .collect()
}

async fn version(path: &Path) -> Option<String> {
    let output = tokio::time::timeout(
        Duration::from_secs(10),
        Command::new(path).arg("--version").output(),
    )
    .await
    .ok()?
    .ok()?;
    let bytes = if output.status.success() {
        output.stdout
    } else {
        output.stderr
    };
    let text = String::from_utf8_lossy(&bytes);
    let line = text.lines().find(|line| !line.trim().is_empty())?.trim();
    Some(line.chars().take(200).collect())
}

async fn opencode_models(path: &Path) -> Option<(usize, Vec<String>)> {
    let output = tokio::time::timeout(
        Duration::from_secs(30),
        Command::new(path).arg("models").output(),
    )
    .await
    .ok()?
    .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let models = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && line.contains('/'))
        .map(str::to_owned)
        .collect::<Vec<_>>();
    Some((models.len(), models.into_iter().take(12).collect()))
}

pub async fn test(id: &str) -> AppResult<Value> {
    let engine = engine(id)?;
    let Some(path) = find_binary(engine.binary) else {
        return Ok(json!({
            "ok": false,
            "installed": false,
            "message": format!("{} não está instalado.", engine.label),
        }));
    };
    let version = version(&path).await;
    let mut models = None;
    if engine.id == "opencode" {
        models = opencode_models(&path).await;
    }
    let ok = version.is_some() || models.is_some();
    let message = if let Some((count, _)) = &models {
        format!("{} respondeu e listou {count} modelos.", engine.label)
    } else if let Some(version) = &version {
        format!("{} respondeu: {version}", engine.label)
    } else {
        format!(
            "{} foi encontrado, mas não respondeu ao teste.",
            engine.label
        )
    };
    let mut value = json!({
        "ok": ok,
        "installed": true,
        "path": path.display().to_string(),
        "version": version,
        "message": message,
    });
    if let Some((count, sample)) = models {
        value["modelCount"] = json!(count);
        value["models"] = json!(sample);
    }
    Ok(value)
}

/// The OpenCode Go allowance. The local OpenCode service exposes the rolling,
/// weekly and monthly windows as used percentages; Toph shows what is left.
pub async fn limits(id: &str) -> AppResult<Value> {
    let engine = engine(id)?;
    if engine.id != "opencode" {
        return Ok(json!({
            "ok": false,
            "message": "Limite do plano disponível apenas para OpenCode.",
        }));
    }
    let Some(binary) = find_binary(engine.binary) else {
        return Ok(json!({
            "ok": false,
            "message": "O OpenCode não está instalado.",
        }));
    };
    let output = tokio::time::timeout(
        Duration::from_secs(20),
        Command::new(&binary)
            .args(["api", "get", "/api/experimental/usage/limits"])
            .output(),
    )
    .await
    .map_err(|_| bad_request("O OpenCode demorou para responder o limite do plano."))?
    .map_err(AppError::Io)?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr)
            .trim()
            .chars()
            .take(500)
            .collect::<String>();
        return Ok(json!({
            "ok": false,
            "message": if message.is_empty() {
                "O OpenCode não devolveu o limite do plano.".to_string()
            } else {
                message
            },
        }));
    }
    let parsed: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| bad_request(format!("Resposta inválida do OpenCode: {error}")))?;
    Ok(json!({
        "ok": true,
        "data": parsed.get("data").cloned().unwrap_or(Value::Null),
    }))
}

pub async fn install(id: &str) -> AppResult<Value> {
    let engine = engine(id)?;
    if let Some(path) = find_binary(engine.binary) {
        return Ok(json!({
            "ok": true,
            "installed": true,
            "already": true,
            "path": path.display().to_string(),
            "output": "",
            "message": format!("{} já está instalado.", engine.label),
        }));
    }
    let output = tokio::time::timeout(
        Duration::from_secs(600),
        Command::new("sh").arg("-lc").arg(engine.install).output(),
    )
    .await
    .map_err(|_| bad_request("A instalação excedeu 10 minutos."))?
    .map_err(AppError::Io)?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{stdout}{stderr}");
    let tail = if combined.chars().count() > 6000 {
        combined
            .chars()
            .skip(combined.chars().count() - 6000)
            .collect::<String>()
    } else {
        combined
    };
    if !output.status.success() {
        return Err(bad_request(format!(
            "A instalação falhou (código {}).\n{}",
            output.status.code().unwrap_or(-1),
            tail
        )));
    }
    let path = find_binary(engine.binary);
    let installed = path.is_some();
    let path = path.map(|path| path.display().to_string());
    Ok(json!({
        "ok": installed,
        "installed": installed,
        "already": false,
        "path": path,
        "output": tail,
        "message": if installed {
            format!("{} instalado.", engine.label)
        } else {
            format!("O instalador terminou, mas {} não apareceu no PATH. Abra um terminal novo e teste de novo.", engine.label)
        },
    }))
}

/// Updates an installed harness in place. OpenCode carries its own upgrader;
/// Claude Code uses `claude update`; Codex is installed through npm.
pub async fn update(id: &str) -> AppResult<Value> {
    let engine = engine(id)?;
    let Some(path) = find_binary(engine.binary) else {
        return Ok(json!({
            "ok": false,
            "installed": false,
            "path": null,
            "version": null,
            "output": "",
            "message": format!("{} não está instalado. Use Instalar primeiro.", engine.label),
        }));
    };
    let mut command = match engine.id {
        "opencode" => {
            let mut command = Command::new(&path);
            command.arg("upgrade");
            command
        }
        "claude" => {
            let mut command = Command::new(&path);
            command.arg("update");
            command
        }
        "codex" => {
            let mut command = Command::new("sh");
            command
                .arg("-lc")
                .arg("npm install -g @openai/codex@latest");
            command
        }
        _ => {
            return Ok(json!({
                "ok": false,
                "installed": true,
                "path": path.display().to_string(),
                "version": version(&path).await,
                "output": "",
                "message": format!("{} não tem atualização automática.", engine.label),
            }));
        }
    };
    let output = tokio::time::timeout(Duration::from_secs(600), command.output())
        .await
        .map_err(|_| bad_request("A atualização excedeu 10 minutos."))?
        .map_err(AppError::Io)?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{stdout}{stderr}");
    let tail = if combined.chars().count() > 6000 {
        combined
            .chars()
            .skip(combined.chars().count() - 6000)
            .collect::<String>()
    } else {
        combined
    };
    let current = version(&path).await;
    Ok(json!({
        "ok": output.status.success(),
        "installed": true,
        "path": path.display().to_string(),
        "version": current,
        "output": tail,
        "message": if output.status.success() {
            match &current {
                Some(version) => format!("{} atualizado: {version}", engine.label),
                None => format!("{} atualizado.", engine.label),
            }
        } else {
            format!(
                "A atualização de {} falhou (código {}).",
                engine.label,
                output.status.code().unwrap_or(-1)
            )
        },
    }))
}
