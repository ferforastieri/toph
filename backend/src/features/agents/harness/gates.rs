use super::state::RunState;

/// Completion is a contract check, not a phrase check. It runs only in the
/// implementation phase, where a change is required.
pub fn completion_blockers(state: &RunState, answer: &str) -> Vec<String> {
    let mut blockers = Vec::new();
    if answer.trim().is_empty() {
        blockers.push("A resposta final está vazia.".into());
    }
    if state.edits == 0 {
        blockers.push(
            "A tarefa exige uma alteração, mas nenhum arquivo foi criado ou editado. \
Execute o plano agora."
                .into(),
        );
        return blockers;
    }
    if state.last_verify_ok <= state.last_edit {
        blockers.push(
            "A alteração ainda não foi verificada. Chame verify depois da última edição.".into(),
        );
    }
    if state.last_verification_failed() {
        blockers
            .push("A última verificação falhou. Corrija os erros e chame verify novamente.".into());
    }
    blockers
}
