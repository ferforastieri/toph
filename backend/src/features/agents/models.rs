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
    #[serde(default)]
    pub coordinator: bool,
}
fn build() -> String {
    "build".into()
}
fn ask() -> String {
    "ask".into()
}
fn default_tools() -> Vec<String> {
    vec!["generate_image".into(), "delegate".into()]
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
    pub chat_description: String,
    pub depth: usize,
}

pub fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
