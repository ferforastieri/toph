use std::collections::HashSet;

use serde_json::Value;

use crate::features::agents::context;

use super::event::StoredEvent;

/// A condensation is a summary of a prefix of the event log. The original
/// events remain in SQLite and stay searchable; the model only sees the
/// rolling summary plus the recent tail.
///
/// `previous` is the summary of everything forgotten before this prefix. It is
/// kept as an anchor (bounded to a third of the budget) while the newest
/// forgotten events get the rest.
pub fn summarize(previous: &str, events: &[StoredEvent], max_chars: usize) -> String {
    let mut fresh = String::new();
    let mut used = 0usize;
    for event in events {
        let line = match event.kind.as_str() {
            "user_task" => event
                .body()
                .map(|body| context::content_text(&body["content"]))
                .map(|text| format!("Pedido: {}", text.chars().take(500).collect::<String>())),
            "assistant" => event
                .body()
                .and_then(|body| body["content"].as_str())
                .filter(|text| !text.trim().is_empty())
                .map(|text| {
                    format!(
                        "Resposta: {}",
                        text.trim().chars().take(300).collect::<String>()
                    )
                }),
            "tool" => event
                .body()
                .and_then(|body| body["name"].as_str())
                .map(|name| {
                    let args = event
                        .body()
                        .and_then(|body| body["content"].as_str())
                        .unwrap_or("")
                        .chars()
                        .take(180)
                        .collect::<String>();
                    format!("Ferramenta {name}: {args}")
                }),
            "edit_applied" => event
                .payload
                .get("path")
                .and_then(Value::as_str)
                .map(|path| format!("Arquivo alterado: {path}")),
            "verification" => Some(format!(
                "Verificação {}: {}",
                if event.payload["ok"].as_bool() == Some(true) {
                    "ok"
                } else {
                    "falhou"
                },
                event.payload["commands"].to_string()
            )),
            "completion_rejected" => Some(format!(
                "Conclusão rejeitada: {}",
                event.payload["blockers"].to_string()
            )),
            _ => None,
        };
        if let Some(line) = line {
            let length = line.chars().count() + 1;
            if used + length > max_chars {
                break;
            }
            fresh.push_str(&line);
            fresh.push('\n');
            used += length;
        }
    }

    let previous = previous.trim();
    if previous.is_empty() {
        return fresh;
    }
    let mut out = String::new();
    let anchor: String = previous.chars().take(max_chars / 3).collect();
    out.push_str(&anchor);
    if anchor.chars().count() < previous.chars().count() {
        out.push_str("\n…\n");
    } else {
        out.push('\n');
    }
    let remaining = max_chars.saturating_sub(out.chars().count());
    out.extend(fresh.chars().take(remaining));
    out
}

/// End indices after which no tool call is still waiting for its results.
pub fn safe_boundaries(events: &[StoredEvent]) -> Vec<usize> {
    let mut pending = HashSet::new();
    let mut boundaries = Vec::new();
    for (index, event) in events.iter().enumerate() {
        if let Some(body) = event.body() {
            if let Some(calls) = body["tool_calls"].as_array() {
                for call in calls {
                    if let Some(id) = call["id"].as_str() {
                        pending.insert(id.to_owned());
                    }
                }
            }
            if body["role"] == "tool" {
                if let Some(id) = body["tool_call_id"].as_str() {
                    pending.remove(id);
                }
            }
        }
        if pending.is_empty() {
            boundaries.push(index + 1);
        }
    }
    boundaries
}

fn estimated_event(event: &StoredEvent) -> usize {
    context::estimate(&event.payload)
}

/// Pick a prefix to forget while keeping a recent tail within `target_tokens`.
/// The result is always a safe tool boundary, so a tool-call batch never
/// survives without its results (or vice versa).
pub fn forget_prefix(events: &[StoredEvent], target_tokens: usize) -> usize {
    let boundaries = safe_boundaries(events);
    let Some(&safe) = boundaries.last() else {
        return 0;
    };
    if safe == 0 {
        return 0;
    }
    let total = events.iter().map(estimated_event).sum::<usize>();
    if total <= target_tokens {
        return safe;
    }
    let mut total = 0usize;
    let mut start = safe;
    for index in (0..safe).rev() {
        total += estimated_event(&events[index]);
        if total > target_tokens {
            start = index + 1;
            break;
        }
        start = index;
    }
    boundaries
        .into_iter()
        .find(|boundary| *boundary >= start)
        .unwrap_or(safe)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn event(seq: i64, kind: &str, payload: serde_json::Value) -> StoredEvent {
        StoredEvent {
            seq,
            id: format!("e{seq}"),
            session_id: "s".into(),
            run_id: Some("r".into()),
            kind: kind.into(),
            payload,
            created_at: seq,
        }
    }

    #[test]
    fn rolling_summary_keeps_the_previous_anchor_and_new_events() {
        let events = vec![event(
            1,
            "edit_applied",
            json!({"path": "web/src/Chat.tsx"}),
        )];
        let summary = summarize("Pedido: mover o horário", &events, 400);
        assert!(summary.contains("mover o horário"));
        assert!(summary.contains("web/src/Chat.tsx"));
    }

    #[test]
    fn forgetting_never_splits_a_parallel_tool_batch() {
        let events = vec![
            event(
                1,
                "assistant",
                json!({"body":{"role":"assistant","content":"","tool_calls":[
                    {"id":"a","type":"function","function":{"name":"read_file","arguments":"{\"path\":\"a\"}"}},
                    {"id":"b","type":"function","function":{"name":"read_file","arguments":"{\"path\":\"b\"}"}}
                ]}}),
            ),
            event(
                2,
                "tool",
                json!({"body":{"role":"tool","tool_call_id":"a","name":"read_file","content":"aaa"}}),
            ),
            event(
                3,
                "tool",
                json!({"body":{"role":"tool","tool_call_id":"b","name":"read_file","content":"bbb"}}),
            ),
        ];
        assert_eq!(forget_prefix(&events, 1), 3);
        assert!(forget_prefix(&events, 100_000) >= 3);
    }
}
