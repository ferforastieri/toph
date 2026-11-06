//! Direct provider protocols. Errors never trigger a model/provider substitution.
use crate::ai::{AiConfig, AiService};
use crate::errors::{AppError, AppResult};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::time::Duration;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Usage {
    pub input: u64,
    pub output: u64,
    pub cached: u64,
    pub reasoning: u64,
}
#[derive(Default)]
pub struct Turn {
    pub text: String,
    pub calls: Vec<ToolCall>,
    pub usage: Usage,
    pub finish: String,
    pub response_items: Vec<Value>,
}

fn endpoint(base: &str, suffix: &str) -> String {
    let base = base.trim_end_matches('/');
    if base.ends_with("/v1") || base.ends_with("/openai") {
        format!("{base}{suffix}")
    } else {
        format!("{base}/v1{suffix}")
    }
}

/// The hosted gateway expects a `ses_` session identifier for routing. Use a
/// fresh one per run so a throttled historical id cannot poison new turns.
fn provider_session(session: &str) -> String {
    let cleaned = session
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>();
    if cleaned.starts_with("ses_") {
        cleaned
    } else {
        format!("ses_{cleaned}")
    }
}

fn retry_after(response: &reqwest::Response) -> Option<Duration> {
    response
        .headers()
        .get(reqwest::header::RETRY_AFTER)?
        .to_str()
        .ok()?
        .trim()
        .parse::<u64>()
        .ok()
        .map(Duration::from_secs)
}

/// Hosted inference gateway only; no connection to an installed agent service.
pub fn console_gateway(base: &str) -> Option<String> {
    let url = reqwest::Url::parse(base).ok()?;
    if url.scheme() != "https" || url.host_str()? != "opencode.ai" {
        return None;
    }
    let path = url.path().trim_end_matches('/');
    for root in ["/inference/go", "/inference"] {
        if path == format!("{root}/openai/v1") || path == format!("{root}/anthropic/v1") {
            return Some(format!("https://opencode.ai{root}"));
        }
    }
    None
}

pub fn models_endpoint(base: &str) -> String {
    match console_gateway(base) {
        Some(root) => format!("{root}/v1/models"),
        None => endpoint(base, "/models"),
    }
}

#[cfg(test)]
mod gateway_tests {
    use super::*;

    #[test]
    fn hosted_go_catalog_has_a_distinct_url_from_inference() {
        assert_eq!(
            models_endpoint("https://opencode.ai/inference/go/openai/v1"),
            "https://opencode.ai/inference/go/v1/models"
        );
        assert_eq!(
            models_endpoint("https://opencode.ai/inference/go/anthropic/v1/"),
            "https://opencode.ai/inference/go/v1/models"
        );
        assert_eq!(
            models_endpoint("https://api.openai.com/v1"),
            "https://api.openai.com/v1/models"
        );
        assert_eq!(
            models_endpoint("https://generativelanguage.googleapis.com/v1beta/openai"),
            "https://generativelanguage.googleapis.com/v1beta/openai/models"
        );
        assert!(
            console_gateway("https://opencode.ai.example.com/inference/go/openai/v1").is_none()
        );
        assert!(console_gateway("http://127.0.0.1:3005").is_none());
    }

    #[test]
    fn gateway_sessions_always_use_the_routable_prefix() {
        assert_eq!(provider_session("MYEPS9IRYv4BJHdA"), "ses_MYEPS9IRYv4BJHdA");
        assert_eq!(provider_session("ses_already"), "ses_already");
        assert_eq!(provider_session("a/b c"), "ses_a_b_c");
    }
}

pub fn anthropic_messages(messages: &[Value]) -> AppResult<(String, Vec<Value>)> {
    let mut system = Vec::new();
    let mut result: Vec<Value> = Vec::new();
    for message in messages {
        let role = message["role"].as_str().unwrap_or("");
        if role == "system" {
            system.push(message["content"].as_str().unwrap_or("").to_string());
            continue;
        }
        let mut parts = Vec::new();
        if role == "tool" {
            parts.push(json!({"type":"tool_result","tool_use_id":message["tool_call_id"],"content":message["content"]}));
        } else {
            match &message["content"] {
                Value::String(s) if !s.is_empty() => parts.push(json!({"type":"text","text":s})),
                Value::Array(items) => {
                    for part in items {
                        match part["type"].as_str() {
                            Some("text") => parts.push(part.clone()),
                            Some("image_url") => {
                                let uri = part["image_url"]["url"].as_str().unwrap_or("");
                                if let Some((head, data)) = uri
                                    .strip_prefix("data:")
                                    .and_then(|s| s.split_once(";base64,"))
                                {
                                    parts.push(json!({"type":"image","source":{"type":"base64","media_type":head,"data":data}}));
                                } else {
                                    return Err(AppError::BadRequest(
                                        "Image must be an uploaded data URI".into(),
                                    ));
                                }
                            }
                            _ => {
                                return Err(AppError::BadRequest(
                                    "Unsupported attachment for this provider".into(),
                                ))
                            }
                        }
                    }
                }
                _ => {}
            }
            if let Some(calls) = message["tool_calls"].as_array() {
                for call in calls {
                    let input: Value = serde_json::from_str(
                        call["function"]["arguments"].as_str().unwrap_or("{}"),
                    )
                    .map_err(|e| AppError::Upstream(format!("Invalid tool arguments: {e}")))?;
                    parts.push(json!({"type":"tool_use","id":call["id"],"name":call["function"]["name"],"input":input}));
                }
            }
        }
        let role = if role == "tool" { "user" } else { role };
        if parts.is_empty() {
            continue;
        }
        if result.last().is_some_and(|m| m["role"] == role) {
            result.last_mut().unwrap()["content"]
                .as_array_mut()
                .unwrap()
                .extend(parts);
        } else {
            result.push(json!({"role":role,"content":parts}));
        }
    }
    Ok((system.join("\n\n"), result))
}

impl AiService {
    pub async fn turn<F>(
        &self,
        config: &AiConfig,
        messages: &[Value],
        tools: &[Value],
        effort: Option<&str>,
        delta: F,
    ) -> AppResult<Turn>
    where
        F: FnMut(&str) + Send,
    {
        let session = crate::crypto::new_id();
        self.turn_in_session(config, messages, tools, effort, &session, delta)
            .await
    }

    pub async fn turn_in_session<F>(
        &self,
        config: &AiConfig,
        messages: &[Value],
        tools: &[Value],
        effort: Option<&str>,
        session: &str,
        mut delta: F,
    ) -> AppResult<Turn>
    where
        F: FnMut(&str) + Send,
    {
        super::connections::validate_endpoint(&config.provider, &config.base_url)?;
        let anthropic = config.provider == "anthropic";
        let ollama = config.provider == "ollama";
        let responses = config.provider == "openai";
        let (url, body) = if responses {
            (
                endpoint(&config.base_url, "/responses"),
                super::responses::request(config, messages, tools, effort)?,
            )
        } else if anthropic {
            let (system, chat) = anthropic_messages(messages)?;
            let mut body = json!({"model":config.model,"max_tokens":config.max_tokens,"system":[{"type":"text","text":system,"cache_control":{"type":"ephemeral"}}],"messages":chat,"stream":true});
            if system.is_empty() {
                body.as_object_mut().unwrap().remove("system");
            }
            if !tools.is_empty() {
                body["tools"] = Value::Array(tools.iter().map(|t| json!({"name":t["function"]["name"],"description":t["function"]["description"],"input_schema":t["function"]["parameters"]})).collect());
                if let Some(last) = body["tools"].as_array_mut().and_then(|t| t.last_mut()) {
                    last["cache_control"] = json!({"type":"ephemeral"});
                }
            }
            (endpoint(&config.base_url, "/messages"), body)
        } else if ollama {
            let mut chat = messages.to_vec();
            for m in &mut chat {
                m.as_object_mut().unwrap().remove("response_items");
                m.as_object_mut().unwrap().remove("response_model");
                if m["role"] == "tool" {
                    m["tool_name"] = m["name"].clone();
                }
                if let Some(parts) = m["content"].as_array() {
                    let text = parts
                        .iter()
                        .filter_map(|p| p["text"].as_str())
                        .collect::<Vec<_>>()
                        .join("\n");
                    let images = parts
                        .iter()
                        .filter_map(|p| p["image_url"]["url"].as_str())
                        .map(|s| s.split_once(',').map(|(_, s)| s).unwrap_or(s).to_string())
                        .collect::<Vec<_>>();
                    m["content"] = json!(text);
                    if !images.is_empty() {
                        m["images"] = json!(images);
                    }
                }
                if let Some(calls) = m["tool_calls"].as_array_mut() {
                    for call in calls {
                        if let Some(args) = call["function"]["arguments"].as_str() {
                            call["function"]["arguments"] =
                                serde_json::from_str(args).map_err(|e| {
                                    AppError::Upstream(format!("Invalid tool arguments: {e}"))
                                })?;
                        }
                    }
                }
            }
            let mut body = json!({"model":config.model,"messages":chat,"stream":true,"options":{"num_predict":config.max_tokens,"num_ctx":16384}});
            if !tools.is_empty() {
                body["tools"] = json!(tools);
            }
            (
                format!("{}/api/chat", config.base_url.trim_end_matches('/')),
                body,
            )
        } else {
            let mut body = json!({"model":config.model,"messages":messages,"max_completion_tokens":config.max_tokens,"stream":true,"stream_options":{"include_usage":true}});
            if let Some(chat) = body["messages"].as_array_mut() {
                for message in chat {
                    message.as_object_mut().unwrap().remove("response_items");
                    message.as_object_mut().unwrap().remove("response_model");
                    if message["role"] == "tool" {
                        message.as_object_mut().unwrap().remove("name");
                    }
                }
            }
            if config.provider == "custom" {
                body.as_object_mut()
                    .unwrap()
                    .remove("max_completion_tokens");
                body["max_tokens"] = json!(config.max_tokens);
            }
            if !tools.is_empty() {
                body["tools"] = json!(tools);
            }
            if let Some(effort) = effort.filter(|s| !s.is_empty()) {
                body["reasoning_effort"] = json!(effort);
            }
            (endpoint(&config.base_url, "/chat/completions"), body)
        };
        let gateway = console_gateway(&config.base_url).is_some();
        // Go routes and rate-limits by this header. A reused internal Toph id
        // can be permanently throttled by the gateway, so every run gets a
        // fresh `ses_` id instead of the long-lived chat/session id.
        let provider_session = if gateway {
            provider_session(session)
        } else {
            session.to_string()
        };
        let mut response = None;
        for attempt in 0..3 {
            let mut request = self.client.post(&url).json(&body);
            if gateway {
                request = request
                    .bearer_auth(&config.api_key)
                    .header("x-opencode-session", &provider_session);
                if anthropic {
                    request = request.header("anthropic-version", "2023-06-01");
                }
            } else if anthropic {
                request = request
                    .header("x-api-key", &config.api_key)
                    .header("anthropic-version", "2023-06-01");
            } else if !config.api_key.is_empty() {
                request = request.bearer_auth(&config.api_key);
            }
            let current = request
                .send()
                .await
                .map_err(|e| AppError::Upstream(e.to_string()))?;
            // Transient gateway overload: retry the same connection only. Never
            // switch model or provider. Honor Retry-After when it is bounded.
            if current.status() == reqwest::StatusCode::TOO_MANY_REQUESTS && attempt < 2 {
                let wait = retry_after(&current)
                    .unwrap_or_else(|| Duration::from_millis(800 * (1 << attempt)));
                let _ = current.bytes().await;
                tokio::time::sleep(wait.min(Duration::from_secs(8))).await;
                continue;
            }
            response = Some(current);
            break;
        }
        let response =
            response.ok_or_else(|| AppError::Upstream("AI provider unavailable".into()))?;
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            let text = if config.api_key.is_empty() {
                text
            } else {
                text.replace(&config.api_key, "[redacted]")
            };
            let connection = config.connection_name();
            if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                return Err(AppError::Upstream(format!(
                    "A conexão {connection} recusou a requisição por sobrecarga (429) após três tentativas. Esta execução foi encerrada; tente novamente em instantes."
                )));
            }
            return Err(AppError::Upstream(format!(
                "Conexão {connection} · modelo {} ({}): Provider {status}: {}",
                config.model,
                config.provider,
                text.chars().take(1500).collect::<String>()
            )));
        }
        let mut stream = response.bytes_stream();
        let mut pending = Vec::new();
        let mut turn = Turn::default();
        let mut calls = BTreeMap::<usize, ToolCall>::new();
        let mut finished = false;
        let mut size = 0usize;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| AppError::Upstream(e.to_string()))?;
            size += chunk.len();
            if size > 8 * 1024 * 1024 {
                return Err(AppError::TooLarge);
            }
            pending.extend_from_slice(&chunk);
            while let Some(index) = pending.iter().position(|b| *b == b'\n') {
                let line = pending.drain(..=index).collect::<Vec<_>>();
                let line = std::str::from_utf8(&line)
                    .map_err(|e| AppError::Upstream(e.to_string()))?
                    .trim();
                let payload = if ollama {
                    line
                } else if let Some(s) = line.strip_prefix("data:") {
                    s.trim()
                } else {
                    continue;
                };
                if payload.is_empty() {
                    continue;
                }
                if payload == "[DONE]" {
                    finished = true;
                    continue;
                }
                let value: Value = serde_json::from_str(payload)
                    .map_err(|e| AppError::Upstream(format!("Invalid provider stream: {e}")))?;
                if let Some(error) = value.get("error") {
                    return Err(AppError::Upstream(error.to_string()));
                }
                if responses {
                    if super::responses::event(&mut turn, &value, &mut delta)? {
                        finished = true;
                    }
                } else if anthropic {
                    match value["type"].as_str().unwrap_or("") {
                        "message_start" => {
                            let u = &value["message"]["usage"];
                            turn.usage.input = number(u, "input_tokens")
                                + number(u, "cache_read_input_tokens")
                                + number(u, "cache_creation_input_tokens");
                            turn.usage.cached = number(u, "cache_read_input_tokens");
                        }
                        "content_block_start" if value["content_block"]["type"] == "tool_use" => {
                            let i = number(&value, "index") as usize;
                            calls.insert(
                                i,
                                ToolCall {
                                    id: value["content_block"]["id"].as_str().unwrap_or("").into(),
                                    name: value["content_block"]["name"]
                                        .as_str()
                                        .unwrap_or("")
                                        .into(),
                                    arguments: String::new(),
                                },
                            );
                        }
                        "content_block_delta" => {
                            if let Some(text) = value["delta"]["text"].as_str() {
                                turn.text.push_str(text);
                                delta(text);
                            }
                            if let Some(args) = value["delta"]["partial_json"].as_str() {
                                calls
                                    .entry(number(&value, "index") as usize)
                                    .or_default()
                                    .arguments
                                    .push_str(args);
                            }
                        }
                        "message_delta" => {
                            turn.usage.output = number(&value["usage"], "output_tokens");
                            turn.finish =
                                value["delta"]["stop_reason"].as_str().unwrap_or("").into();
                        }
                        "message_stop" => finished = true,
                        _ => {}
                    }
                } else if ollama {
                    if let Some(text) = value["message"]["content"].as_str() {
                        turn.text.push_str(text);
                        delta(text);
                    }
                    if let Some(items) = value["message"]["tool_calls"].as_array() {
                        for item in items {
                            let i = calls.len();
                            calls.insert(
                                i,
                                ToolCall {
                                    id: crate::crypto::new_id(),
                                    name: item["function"]["name"].as_str().unwrap_or("").into(),
                                    arguments: item["function"]["arguments"].to_string(),
                                },
                            );
                        }
                    }
                    if value["done"] == true {
                        turn.usage.input = number(&value, "prompt_eval_count");
                        turn.usage.output = number(&value, "eval_count");
                        turn.finish = value["done_reason"].as_str().unwrap_or("stop").into();
                        finished = true;
                    }
                } else {
                    if let Some(text) = value
                        .pointer("/choices/0/delta/content")
                        .and_then(Value::as_str)
                    {
                        turn.text.push_str(text);
                        delta(text);
                    }
                    if let Some(items) = value
                        .pointer("/choices/0/delta/tool_calls")
                        .and_then(Value::as_array)
                    {
                        for item in items {
                            let call = calls.entry(number(item, "index") as usize).or_default();
                            if let Some(id) = item["id"].as_str() {
                                call.id.push_str(id);
                            }
                            if let Some(name) = item["function"]["name"].as_str() {
                                call.name.push_str(name);
                            }
                            if let Some(args) = item["function"]["arguments"].as_str() {
                                call.arguments.push_str(args);
                            }
                        }
                    }
                    if let Some(reason) = value
                        .pointer("/choices/0/finish_reason")
                        .and_then(Value::as_str)
                    {
                        turn.finish = reason.into();
                    }
                    if let Some(u) = value.get("usage").filter(|u| !u.is_null()) {
                        turn.usage = Usage {
                            input: number(u, "prompt_tokens"),
                            output: number(u, "completion_tokens"),
                            cached: number(&u["prompt_tokens_details"], "cached_tokens"),
                            reasoning: number(&u["completion_tokens_details"], "reasoning_tokens"),
                        };
                    }
                }
            }
            if pending.len() > 1024 * 1024 {
                return Err(AppError::TooLarge);
            }
        }
        if !finished {
            return Err(AppError::Upstream(
                "Provider stream ended before completion".into(),
            ));
        }
        if !responses {
            turn.calls = calls.into_values().collect();
        }
        for call in &mut turn.calls {
            if call.id.is_empty() || call.name.is_empty() {
                return Err(AppError::Upstream("Incomplete tool call".into()));
            }
            if call.arguments.is_empty() {
                call.arguments = "{}".into();
            }
            serde_json::from_str::<Value>(&call.arguments)
                .map_err(|e| AppError::Upstream(format!("Invalid tool JSON: {e}")))?;
        }
        // A `length` finish is not fatal: summaries may be truncated and text
        // answers can still be useful. The runtime keeps the partial content
        // instead of failing the whole execution.
        Ok(turn)
    }
}

fn number(value: &Value, key: &str) -> u64 {
    value[key].as_u64().unwrap_or(0)
}
