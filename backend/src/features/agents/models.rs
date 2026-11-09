use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSpec {
    pub id: String,
    pub chat_id: String,
    pub name: String,
    pub handle: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub personality: String,
    #[serde(default)]
    pub model: String,
    /// Execution harness: opencode, claude, codex, cursor, grok, pi, gemini.
    #[serde(default = "default_engine")]
    pub engine: String,
    #[serde(default)]
    pub effort: String,
    #[serde(default = "build")]
    pub agent_mode: String,
    #[serde(default = "ask")]
    pub permission_mode: String,
    #[serde(default = "default_tools")]
    pub tools: Vec<String>,
    #[serde(default)]
    pub mcp_servers: Vec<String>,
    #[serde(default)]
    pub email_account_ids: Vec<String>,
    #[serde(default)]
    pub language: String,
}
fn build() -> String {
    "build".into()
}
fn default_engine() -> String {
    "opencode".into()
}
fn ask() -> String {
    "ask".into()
}
fn default_tools() -> Vec<String> {
    vec!["generate_image".into()]
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub name: String,
    pub mime: String,
    pub uri: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunInput {
    pub request_id: String,
    pub chat_id: String,
    #[serde(default)]
    pub chat_description: String,
    pub agent_id: String,
    pub text: String,
    #[serde(default)]
    pub session_id: Option<String>,
    pub agents: Vec<AgentSpec>,
    #[serde(default)]
    pub attachments: Vec<Attachment>,
}

#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub chat_id: String,
    pub agent_id: String,
    pub title: String,
    pub archived: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub id: String,
    pub session_id: String,
    pub parent_id: Option<String>,
    pub chat_id: String,
    pub agent_id: String,
    pub state: String,
    pub error: String,
    pub created_at: i64,
    pub finished_at: Option<i64>,
}

#[derive(Clone)]
pub struct ContextMessage {
    pub seq: i64,
    pub body: Value,
    pub tokens: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvent {
    pub user_id: i64,
    pub project_id: String,
    pub chat_id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub data: Value,
}

#[derive(Clone)]
pub struct RunContext {
    pub run: Run,
    pub user_id: i64,
    pub project_id: String,
    pub root: std::path::PathBuf,
    pub agent: AgentSpec,
    pub roster: Vec<AgentSpec>,
    /// Managed skills assigned to this agent. Only names and descriptions go
    /// into the prompt; the body is read on demand through `toph_read_skill`.
    pub skills: Vec<super::skill_service::ManagedSkill>,
    pub chat_description: String,
    pub depth: usize,
    /// A second responder chosen by the router. Its copy of the user message
    /// stays hidden in the UI; the primary responder owns the visible bubble.
    pub secondary: bool,
    /// Tophs the router chose for the same message. They answer together, so
    /// a handoff to one of them would duplicate the turn.
    pub routed: Vec<String>,
    /// The current request text, used when the session has no transcript yet.
    pub request: String,
}

pub fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
