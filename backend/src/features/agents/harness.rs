//! The OpenCode service: the models it offers (with their effort variants) and
//! the titles of the sessions it runs. The Toph server proxies it so the app
//! never reads provider keys of its own.
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::Duration;

const DEFAULT_URL: &str = "http://127.0.0.1:3005";

fn base_url() -> String {
    std::env::var("TOPH_OPENCODE_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_URL.to_string())
}

/// The service's own password (the CLI's background service file), or the
/// header the deployment passes in `TOPH_OPENCODE_AUTH`.
fn password() -> Option<String> {
    if let Ok(auth) = std::env::var("TOPH_OPENCODE_AUTH") {
        let value = auth.trim();
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    let home = std::env::var("HOME").ok()?;
    let text =
        std::fs::read_to_string(PathBuf::from(home).join(".config/opencode/service.json")).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    value.get("password")?.as_str().map(str::to_owned)
}

async fn get(path: &str) -> Option<Value> {
    let url = format!("{}{}", base_url().trim_end_matches('/'), path);
    let mut request = reqwest::Client::new()
        .get(url)
        .timeout(Duration::from_secs(6))
        .header("accept", "application/json");
    if let Some(password) = password() {
        request = request.basic_auth("opencode", Some(password));
    }
    let response = request.send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    response.json::<Value>().await.ok()
}

/// Every chat model the harness offers, as `provider/model`, with its effort
/// variants (the same names the runtime appends as `#variant`).
pub async fn models() -> Option<Vec<Value>> {
    let value = get("/api/model").await?;
    let data = value.get("data")?.as_array()?;
    let mut models = Vec::new();
    for item in data {
        if item.get("type").and_then(Value::as_str) != Some("chat") {
            continue;
        }
        let Some(provider) = item.get("providerID").and_then(Value::as_str) else {
            continue;
        };
        let Some(model) = item
            .get("modelID")
            .or_else(|| item.get("id"))
            .and_then(Value::as_str)
        else {
            continue;
        };
        let variants = item
            .get("variants")
            .and_then(Value::as_array)
            .map(|list| {
                list.iter()
                    .filter_map(|variant| variant.get("id").and_then(Value::as_str))
                    .map(str::to_owned)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        models.push(json!({
            "id": format!("{provider}/{model}"),
            "label": item.get("name").and_then(Value::as_str).unwrap_or(model),
            "provider": provider,
            "variants": variants,
        }));
    }
    Some(models)
}

/// The sessions the harness knows: id, title and when it last moved.
pub async fn session_titles() -> Option<Vec<Value>> {
    let value = get("/api/session").await?;
    let data = value.get("data")?.as_array()?;
    Some(
        data.iter()
            .filter_map(|session| {
                let id = session.get("id").and_then(Value::as_str)?;
                Some(json!({
                    "id": id,
                    "title": session.get("title").and_then(Value::as_str).unwrap_or(""),
                    "updatedAt": session
                        .get("time")
                        .and_then(|time| time.get("updated"))
                        .and_then(Value::as_i64)
                        .unwrap_or(0),
                }))
            })
            .collect(),
    )
}
