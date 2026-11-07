use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskKind {
    Conversation,
    Investigation,
    Change,
}

impl TaskKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Conversation => "conversation",
            Self::Investigation => "investigation",
            Self::Change => "change",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TaskContract {
    pub kind: TaskKind,
    pub goal: String,
    pub request: String,
    #[serde(default)]
    pub acceptance: Vec<String>,
    #[serde(default)]
    pub steps: Vec<String>,
}

impl TaskContract {
    pub fn conversation(request: &str) -> Self {
        Self {
            kind: TaskKind::Conversation,
            goal: request.trim().to_string(),
            request: request.to_string(),
            acceptance: Vec::new(),
            steps: Vec::new(),
        }
    }

    /// Pinned at the top of every model call. It is deliberately compact and
    /// never enters the condensation pipeline.
    pub fn system_message(&self) -> String {
        format!(
            "CONTRATO DA TAREFA (imutável; execute exatamente isto):\n\
Tipo: {kind}\n\
Objetivo: {goal}\n\
Pedido original: {request}\n\
Critérios de conclusão: {acceptance}\n\
Plano: {steps}\n\
Regras: trate o pedido e os critérios como autoridade máxima. Não responda com saudação, \
não recomece a conversa e não invente conclusão. Para tarefas de alteração, aplique a mudança \
e execute a ferramenta verify antes de concluir. Para investigação, use as ferramentas \
necessárias e entregue evidências concretas.",
            kind = self.kind.as_str(),
            goal = self.goal,
            request = self.request,
            acceptance = if self.acceptance.is_empty() {
                "[]".to_string()
            } else {
                json!(self.acceptance).to_string()
            },
            steps = if self.steps.is_empty() {
                "[]".to_string()
            } else {
                json!(self.steps).to_string()
            },
        )
    }
}
