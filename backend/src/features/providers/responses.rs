//! OpenAI Responses: preserves encrypted reasoning within a tool-call turn.
use super::protocol::{ToolCall, Turn, Usage};
use crate::ai::AiConfig;
use crate::errors::{bad_request, AppError, AppResult};
use serde_json::{json, Value};

pub(super) fn request(
    config: &AiConfig,
    messages: &[Value],
    tools: &[Value],
    effort: Option<&str>,
) -> AppResult<Value> {
    let mut input = Vec::new();
    for message in messages {
        if message["role"] == "assistant" && message["response_model"] == config.model {
            if let Some(items) = message["response_items"]
                .as_array()
                .filter(|items| !items.is_empty())
            {
                input.extend(items.iter().cloned());
                continue;
            }
        }
        if message["role"] == "tool" {
            input.push(json!({"type":"function_call_output","call_id":message["tool_call_id"],"output":message["content"].as_str().unwrap_or("")}));
            continue;
        }
        match &message["content"] {
            Value::String(text) if !text.is_empty() => {
                input.push(json!({"role":message["role"],"content":text}))
            }
            Value::Array(parts) => {
                let mut content = Vec::new();
                for part in parts {
                    match part["type"].as_str() {
                        Some("text") => {
                            content.push(json!({"type":"input_text","text":part["text"]}))
                        }
                        Some("image_url") => content.push(
                            json!({"type":"input_image","image_url":part["image_url"]["url"]}),
                        ),
                        _ => return Err(bad_request("Unsupported Responses attachment")),
                    }
                }
                input.push(json!({"role":message["role"],"content":content}));
            }
            _ => {}
        }
        if let Some(calls) = message["tool_calls"].as_array() {
            for call in calls {
                input.push(json!({"type":"function_call","call_id":call["id"],"name":call["function"]["name"],"arguments":call["function"]["arguments"]}));
            }
        }
    }
    let mut body = json!({"model":config.model,"input":input,"stream":true,"store":false,"max_output_tokens":config.max_tokens,"include":["reasoning.encrypted_content"]});
    if !tools.is_empty() {
        body["tools"] = Value::Array(tools.iter().map(|tool| json!({"type":"function","name":tool["function"]["name"],"description":tool["function"]["description"],"parameters":tool["function"]["parameters"],"strict":false})).collect());
    }
    if let Some(effort) = effort.filter(|value| !value.is_empty()) {
        body["reasoning"] = json!({"effort":effort});
    }
    Ok(body)
}

pub(super) fn event<F: FnMut(&str)>(
    turn: &mut Turn,
    value: &Value,
    delta: &mut F,
) -> AppResult<bool> {
    match value["type"].as_str().unwrap_or("") {
        "response.output_text.delta" | "response.refusal.delta" => {
            if let Some(text) = value["delta"].as_str() {
                turn.text.push_str(text);
                delta(text);
            }
        }
        "response.completed" => {
            let response = &value["response"];
            let usage = &response["usage"];
            turn.usage = Usage {
                input: usage["input_tokens"].as_u64().unwrap_or(0),
                output: usage["output_tokens"].as_u64().unwrap_or(0),
                cached: usage["input_tokens_details"]["cached_tokens"]
                    .as_u64()
                    .unwrap_or(0),
                reasoning: usage["output_tokens_details"]["reasoning_tokens"]
                    .as_u64()
                    .unwrap_or(0),
            };
            turn.response_items = response["output"].as_array().cloned().unwrap_or_default();
            let mut text = String::new();
            for item in &turn.response_items {
                match item["type"].as_str() {
                    Some("function_call") => turn.calls.push(ToolCall {
                        id: item["call_id"].as_str().unwrap_or("").into(),
                        name: item["name"].as_str().unwrap_or("").into(),
                        arguments: item["arguments"].as_str().unwrap_or("{}").into(),
                    }),
                    Some("message") => {
                        if let Some(parts) = item["content"].as_array() {
                            for part in parts {
                                if let Some(value) =
                                    part["text"].as_str().or_else(|| part["refusal"].as_str())
                                {
                                    text.push_str(value);
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            if !text.is_empty() {
                turn.text = text;
            }
            turn.finish = if turn.calls.is_empty() {
                "stop"
            } else {
                "tool_calls"
            }
            .into();
            return Ok(true);
        }
        "response.failed" | "error" => {
            return Err(AppError::Upstream(format!(
                "OpenAI Responses: {}",
                value
                    .pointer("/response/error/message")
                    .or_else(|| value.get("message"))
                    .and_then(Value::as_str)
                    .unwrap_or("request failed")
            )))
        }
        "response.incomplete" => {
            return Err(AppError::Upstream(format!(
                "OpenAI Responses incomplete: {}",
                value
                    .pointer("/response/incomplete_details/reason")
                    .and_then(Value::as_str)
                    .unwrap_or("output limit")
            )))
        }
        _ => {}
    }
    Ok(false)
}
