use super::{
    contract::TaskContract,
    event::{kind, StoredEvent},
};

#[derive(Clone, Debug)]
pub struct RunState {
    pub contract: TaskContract,
    pub tool_calls: usize,
    pub last_edit_seq: Option<i64>,
    pub last_verification_ok_seq: Option<i64>,
    pub last_verification_failed_seq: Option<i64>,
}

impl RunState {
    pub fn from_events(contract: TaskContract, events: &[StoredEvent]) -> Self {
        let mut state = Self {
            contract,
            tool_calls: 0,
            last_edit_seq: None,
            last_verification_ok_seq: None,
            last_verification_failed_seq: None,
        };
        for event in events {
            state.apply(event);
        }
        state
    }

    pub fn apply(&mut self, event: &StoredEvent) {
        match event.kind.as_str() {
            kind::TOOL_CALL => self.tool_calls += 1,
            kind::EDIT_APPLIED => self.last_edit_seq = Some(event.seq),
            kind::VERIFICATION => {
                if event.payload["ok"].as_bool() == Some(true) {
                    self.last_verification_ok_seq = Some(event.seq);
                } else {
                    self.last_verification_failed_seq = Some(event.seq);
                }
            }
            _ => {}
        }
    }
}
