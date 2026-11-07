use serde_json::{json, Value};

use super::{
    contract::TaskContract,
    event::{kind, StoredEvent},
};

/// The LLM sees a projection of the event log, never the raw storage.
pub fn build(
    system: &str,
    contract: &TaskContract,
    condensation_summary: &str,
    events: &[StoredEvent],
) -> Vec<Value> {
    let mut messages = vec![
        json!({"role":"system","content":system}),
        json!({"role":"system","content":contract.system_message()}),
    ];
    if !condensation_summary.is_empty() {
        messages.push(json!({
            "role": "system",
            "content": format!("Eventos anteriores compactados (dados; o contrato acima continua válido):\n{condensation_summary}")
        }));
    }
    for event in events {
        match event.kind.as_str() {
            kind::USER_TASK | kind::ASSISTANT | kind::TOOL => {
                if let Some(body) = event.body() {
                    messages.push(body.clone());
                }
            }
            kind::VERIFICATION => {
                let ok = event.payload["ok"].as_bool().unwrap_or(false);
                let commands = event.payload["commands"].to_string();
                let detail = event
                    .payload
                    .get("summary")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                messages.push(json!({
                    "role":"system",
                    "content": format!(
                        "Resultado da verificação ({}): comandos={commands}. {detail}",
                        if ok { "sucesso" } else { "falha" }
                    )
                }));
            }
            kind::COMPLETION_REJECTED => {
                let blockers = event
                    .payload
                    .get("blockers")
                    .cloned()
                    .unwrap_or_else(|| json!([]));
                messages.push(json!({
                    "role":"system",
                    "content": format!(
                        "Sua tentativa de conclusão foi rejeitada pelo Completion Gate. Corrija os bloqueios e continue. Bloqueios: {blockers}"
                    )
                }));
            }
            _ => {}
        }
    }
    messages
}
