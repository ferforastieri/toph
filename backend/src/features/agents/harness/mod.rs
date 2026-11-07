pub mod activity;
pub mod artifacts;
pub mod contract;
pub mod event;
pub mod gates;
pub mod phase;
pub mod planner;
pub mod state;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn contract_is_pinned_and_contains_the_exact_request() {
        let contract = contract::TaskContract {
            kind: contract::TaskKind::Change,
            goal: "mover horário".into(),
            request: "Remova o rodapé e mova o horário.".into(),
            acceptance: vec!["build passa".into()],
            steps: vec!["editar".into(), "verify".into()],
        };
        let message = contract.system_message();
        assert!(message.contains("Remova o rodapé e mova o horário."));
        assert!(message.contains("change"));
        assert!(message.contains("verify"));
    }

    #[test]
    fn change_gate_requires_edit_then_successful_verification() {
        let mut state = state::RunState::default();
        assert!(!gates::completion_blockers(&state, "done").is_empty());

        state.record_edit(1);
        assert!(!gates::completion_blockers(&state, "done").is_empty());

        state.record_verification(true, 2);
        assert!(gates::completion_blockers(&state, "done").is_empty());

        state.record_verification(false, 3);
        assert!(!gates::completion_blockers(&state, "done").is_empty());
    }

    #[test]
    fn planner_parses_structured_plans() {
        let plan = planner::parse(
            "```json\n{\"kind\":\"change\",\"goal\":\"mover\",\"acceptance\":[\"build\"],\"steps\":[\"editar\",\"verify\"]}\n```",
            "mova o horário",
        )
        .unwrap();
        assert_eq!(plan.kind, contract::TaskKind::Change);
        assert_eq!(plan.acceptance, vec!["build"]);
        assert!(planner::parse("not json", "pedido").is_none());
    }

    #[test]
    fn activity_is_human_readable() {
        assert_eq!(
            activity::tool_activity("read_file", &json!({"path":"a.ts"})),
            "leu `a.ts`"
        );
    }
}
