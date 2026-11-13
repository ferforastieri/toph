/// Event kinds stored in the append-only agent log.
pub mod kind {
    pub const USER_TASK: &str = "user_task";
    pub const ASSISTANT: &str = "assistant";
    pub const TOOL: &str = "tool";
    pub const EDIT_APPLIED: &str = "edit_applied";
    pub const ACTIVITY: &str = "activity";
    pub const RUN_COMPLETED: &str = "run_completed";
    pub const RUN_FAILED: &str = "run_failed";
}

pub fn message_kind(role: &str) -> &'static str {
    match role {
        "user" => kind::USER_TASK,
        "tool" => kind::TOOL,
        "activity" => kind::ACTIVITY,
        _ => kind::ASSISTANT,
    }
}
