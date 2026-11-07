pub mod condenser;
pub mod contract;
pub mod event;
pub mod gates;
pub mod planner;
pub mod projection;
pub mod state;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn event(seq: i64, kind: &str, payload: serde_json::Value) -> event::StoredEvent {
        event::StoredEvent {
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
        let contract = contract::TaskContract {
            kind: contract::TaskKind::Change,
            goal: "change".into(),
            request: "change".into(),
            acceptance: vec![],
            steps: vec![],
        };
        let mut state = state::RunState::from_events(contract, &[]);
        assert!(!gates::completion_blockers(&state, "done").is_empty());

        state.apply(&event(2, event::kind::EDIT_APPLIED, json!({"path":"a.ts"})));
        assert!(!gates::completion_blockers(&state, "done").is_empty());

        state.apply(&event(
            3,
            event::kind::VERIFICATION,
            json!({"ok":true,"commands":["npm test"]}),
        ));
        assert!(gates::completion_blockers(&state, "done").is_empty());

        state.apply(&event(
            4,
            event::kind::VERIFICATION,
            json!({"ok":false,"commands":["npm test"]}),
        ));
        assert!(!gates::completion_blockers(&state, "done").is_empty());
    }

    #[test]
    fn projection_keeps_contract_and_condensation_summary() {
        let contract = contract::TaskContract::conversation("Olá");
        let messages = projection::build(
            "system",
            &contract,
            "resumo antigo",
            &[event(
                1,
                event::kind::USER_TASK,
                json!({"body":{"role":"user","content":"pedido"}}),
            )],
        );
        assert_eq!(messages[0]["role"], "system");
        assert!(messages[1]["content"]
            .as_str()
            .unwrap()
            .contains("CONTRATO"));
        assert!(messages[2]["content"]
            .as_str()
            .unwrap()
            .contains("resumo antigo"));
        assert_eq!(messages[3]["content"], "pedido");
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
}
