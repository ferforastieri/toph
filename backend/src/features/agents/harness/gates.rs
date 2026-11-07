use super::{contract::TaskKind, state::RunState};

/// Completion is a contract check, not a phrase check. Every gate returns
/// concrete blockers that are fed back to the model.
pub fn completion_blockers(state: &RunState, answer: &str) -> Vec<String> {
    let mut blockers = Vec::new();
    if answer.trim().is_empty() {
        blockers.push("A resposta final está vazia.".into());
    }
    match state.contract.kind {
        TaskKind::Conversation => {}
        TaskKind::Investigation => {
            if state.tool_calls == 0 {
                blockers.push(
                    "A tarefa é de investigação, mas nenhuma ferramenta foi usada. \
Investigue o projeto e cite evidências concretas."
                        .into(),
                );
            }
        }
        TaskKind::Change => {
            if state.last_edit_seq.is_none() {
                blockers.push(
                    "A tarefa exige uma alteração, mas nenhum arquivo foi criado ou editado. \
Implemente a mudança solicitada."
                        .into(),
                );
            }
            if let Some(edit) = state.last_edit_seq {
                if state.last_verification_ok_seq.unwrap_or(0) <= edit {
                    blockers.push(
                        "A alteração ainda não foi verificada. Use a ferramenta verify com \
testes/build/lint depois da última edição."
                            .into(),
                    );
                }
                if state.last_verification_failed_seq.unwrap_or(0)
                    > state.last_verification_ok_seq.unwrap_or(0)
                {
                    blockers.push(
                        "A última verificação falhou. Corrija os erros e rode verify novamente."
                            .into(),
                    );
                }
            }
        }
    }
    blockers
}
