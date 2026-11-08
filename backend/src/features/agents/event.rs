use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Event kinds stored in the append-only agent log.
pub mod kind {
    pub const USER_TASK: &str = "user_task";
    pub const ASSISTANT: &str = "assistant";
    pub const TOOL: &str = "tool";
    pub const TOOL_CALL: &str = "tool_call";
    pub const EDIT_APPLIED: &str = "edit_applied";
    pub const ACTIVITY: &str = "activity";
    pub const RUN_COMPLETED: &str = "run_completed";
    pub const RUN_FAILED: &str = "run_failed";
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StoredEvent {
    pub seq: i64,
    pub id: String,
    pub session_id: String,
    pub run_id: Option<String>,
    pub kind: String,
    pub payload: Value,
    pub created_at: i64,
}

impl StoredEvent {
    pub fn body(&self) -> Option<&Value> {
        self.payload.get("body")
    }
}

pub fn message_kind(role: &str) -> &'static str {
    match role {
        "user" => kind::USER_TASK,
        "tool" => kind::TOOL,
        "activity" => kind::ACTIVITY,
        _ => kind::ASSISTANT,
    }
}
