//! A tiny stdio MCP server that exposes the Toph-only tools selected for one
//! Toph (email accounts and image generation) to its native harness. It is
//! configuration glue, not a gateway: the harness talks MCP directly to this
//! process and executes the tools itself.

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::ai::{AiService, ImageTool};
use crate::errors::AppResult;
use crate::platform::config::Config;
use crate::store::Store;

use super::service::{EmailService, SendInput};

fn definition(name: &str, description: &str, properties: Value, required: &[&str]) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": false
        }
    })
}

fn tools(has_email: bool, image: bool) -> Value {
    let mut items = Vec::new();
    if has_email {
        items.push(definition(
            "email_list",
            "List recent messages in an authorized email account.",
            json!({"accountId": {"type": "string"}, "limit": {"type": "integer"}}),
            &["accountId"],
        ));
        items.push(definition(
            "email_read",
            "Read an email by UID from an authorized account.",
            json!({"accountId": {"type": "string"}, "uid": {"type": "string"}}),
            &["accountId", "uid"],
        ));
        items.push(definition(
            "email_send",
            "Send an email from an authorized account.",
            json!({
                "accountId": {"type": "string"},
                "to": {"type": "string"},
                "cc": {"type": "string"},
                "bcc": {"type": "string"},
                "subject": {"type": "string"},
                "text": {"type": "string"},
                "inReplyTo": {"type": "string"}
            }),
            &["accountId", "to", "subject", "text"],
        ));
    }
    if image {
        items.push(definition(
            "generate_image",
            "Generate an image with the project's configured image provider and save it in the project.",
            json!({
                "prompt": {"type": "string"},
                "provider": {"type": "string"},
                "model": {"type": "string"},
                "size": {"type": "string"},
                "filename": {"type": "string"}
            }),
            &["prompt"],
        ));
    }
    json!(items)
}

async fn call(
    email: &EmailService,
    accounts: &[String],
    ai: &AiService,
    image: Option<&ImageTool>,
    params: &Value,
) -> Value {
    let name = params["name"].as_str().unwrap_or("");
    let args = &params["arguments"];
    let email_tool = name.starts_with("email_");
    let account = args["accountId"].as_str().unwrap_or("");
    if email_tool && !accounts.iter().any(|id| id == account) {
        return json!({
            "content": [{"type": "text", "text": "Conta de e-mail não autorizada para este Toph."}],
            "isError": true
        });
    }
    let result: AppResult<Value> = match name {
        "email_list" => {
            let limit = args["limit"].as_u64().unwrap_or(10).clamp(1, 30) as usize;
            email.messages(account, limit).await.map(Value::Array)
        }
        "email_read" => match args["uid"].as_str() {
            Some(uid) if !uid.trim().is_empty() => email.message(account, uid).await,
            _ => {
                return json!({
                    "content": [{"type": "text", "text": "uid é obrigatório."}],
                    "isError": true
                })
            }
        },
        "email_send" => match serde_json::from_value::<SendInput>(args.clone()) {
            Ok(input) => email
                .send(account, input)
                .await
                .map(|_| json!({"sent": true})),
            Err(error) => Err(crate::errors::bad_request(error.to_string())),
        },
        "generate_image" => match image {
            Some(tool) => ai.image(tool, &args.to_string()).await,
            None => Err(crate::errors::bad_request(
                "generate_image não está habilitado para este Toph",
            )),
        },
        other => {
            return json!({
                "content": [{"type": "text", "text": format!("Ferramenta desconhecida: {other}")}],
                "isError": true
            });
        }
    };
    match result {
        Ok(value) => json!({
            "content": [{
                "type": "text",
                "text": serde_json::to_string_pretty(&value).unwrap_or_default()
            }]
        }),
        Err(error) => json!({
            "content": [{"type": "text", "text": error.to_string()}],
            "isError": true
        }),
    }
}

pub async fn serve() -> anyhow::Result<()> {
    let accounts = std::env::var("TOPH_EMAIL_ACCOUNTS")
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    let image_marker = std::env::var("TOPH_TOOLS").unwrap_or_default();
    let image_enabled = image_marker
        .split(',')
        .any(|tool| tool.trim() == "generate_image");
    let image = image_enabled
        .then(|| {
            let project_id = std::env::var("TOPH_PROJECT_ID").ok()?;
            let root = std::env::var("TOPH_PROJECT_ROOT").ok()?;
            Some(ImageTool {
                project_id,
                project_root: root.into(),
            })
        })
        .flatten();
    let config = Config::load()?;
    let store = Store::open(&config.data_dir.join("toph.db")).await?;
    let ai = AiService::new(store.clone(), &config.master_key_file)?;
    let email = EmailService::new(store, &config.data_dir, &config.master_key_file)?;
    let authorized = email
        .list()
        .await?
        .into_iter()
        .filter(|account| accounts.iter().any(|id| id == &account.id))
        .map(|account| format!("{} <{}> = {}", account.name, account.email, account.id))
        .collect::<Vec<_>>();
    let mut instructions = Vec::new();
    if authorized.is_empty() {
        instructions.push("Este Toph não tem contas de e-mail autorizadas.".to_string());
    } else {
        instructions.push(format!(
            "Contas de e-mail autorizadas para este Toph:\n{}\nUse o id da conta no campo accountId.",
            authorized.join("\n")
        ));
    }
    if image.is_some() {
        instructions.push(
            "A ferramenta generate_image está habilitada e salva a imagem dentro do projeto."
                .to_string(),
        );
    }
    let instructions = instructions.join("\n\n");
    let has_email = !accounts.is_empty();
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        let request: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(error) => {
                let response = json!({
                    "jsonrpc": "2.0",
                    "id": Value::Null,
                    "error": {"code": -32700, "message": error.to_string()}
                });
                let mut stdout = tokio::io::stdout();
                stdout.write_all(format!("{response}\n").as_bytes()).await?;
                stdout.flush().await?;
                continue;
            }
        };
        let id = request["id"].clone();
        if id.is_null() {
            continue;
        }
        let method = request["method"].as_str().unwrap_or("");
        let result = match method {
            "initialize" => Ok(json!({
                "protocolVersion": "2025-11-25",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "toph_tools", "version": env!("CARGO_PKG_VERSION")},
                "instructions": instructions
            })),
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({"tools": tools(has_email, image.is_some())})),
            "tools/call" => {
                Ok(call(&email, &accounts, &ai, image.as_ref(), &request["params"]).await)
            }
            "resources/list" => Ok(json!({"resources": []})),
            "prompts/list" => Ok(json!({"prompts": []})),
            other => Err(format!("Método não suportado: {other}")),
        };
        let response = match result {
            Ok(result) => json!({"jsonrpc": "2.0", "id": id, "result": result}),
            Err(message) => json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": {"code": -32601, "message": message}
            }),
        };
        let mut stdout = tokio::io::stdout();
        stdout.write_all(format!("{response}\n").as_bytes()).await?;
        stdout.flush().await?;
    }
    Ok(())
}
