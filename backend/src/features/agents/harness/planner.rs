use serde_json::{json, Value};

use super::contract::{TaskContract, TaskKind};

const PLANNER_SYSTEM: &str = "You are the planning component of a coding harness. Return ONLY a JSON object, no markdown fences and no prose. Schema: {\"kind\":\"conversation|investigation|change\",\"goal\":\"one sentence\",\"acceptance\":[\"verifiable outcome\"],\"steps\":[\"short ordered step\"]}. Use conversation only for greetings or identity questions. Use investigation when the user asks for analysis/explanation without changing files. Use change when files must be created, edited, removed or moved. For change tasks, acceptance must require a verification command. Keep the plan compact.";

pub fn messages(request: &str, project: &str) -> Vec<Value> {
    let request = if request.trim().is_empty() {
        "O usuário enviou um anexo ou imagem sem texto. Inspecione o conteúdo e execute a tarefa solicitada."
    } else {
        request.trim()
    };
    vec![
        json!({"role":"system","content":PLANNER_SYSTEM}),
        json!({"role":"user","content":format!("Projeto: {project}\nPedido:\n{request}")}),
    ]
}

fn strip_fences(text: &str) -> &str {
    let trimmed = text.trim();
    let Some(rest) = trimmed.strip_prefix("```") else {
        return trimmed;
    };
    let rest = rest
        .strip_prefix("json")
        .or_else(|| rest.strip_prefix("JSON"))
        .unwrap_or(rest)
        .trim_start();
    rest.strip_suffix("```").unwrap_or(rest).trim()
}

pub fn parse(text: &str, request: &str) -> Option<TaskContract> {
    let raw = strip_fences(text);
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    let value: Value = serde_json::from_str(&raw[start..=end]).ok()?;
    let kind = match value["kind"].as_str()? {
        "conversation" => TaskKind::Conversation,
        "investigation" => TaskKind::Investigation,
        "change" => TaskKind::Change,
        _ => return None,
    };
    let goal = value["goal"]
        .as_str()
        .map(str::trim)
        .filter(|goal| !goal.is_empty())
        .unwrap_or(request)
        .to_string();
    let acceptance = value["acceptance"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let steps = value["steps"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Some(TaskContract {
        kind,
        goal,
        request: request.to_string(),
        acceptance,
        steps,
    })
}
