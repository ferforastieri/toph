#[derive(Clone, Debug, Default)]
pub struct RunState {
    pub edits: usize,
    pub last_edit: usize,
    pub last_verify_ok: usize,
    pub last_verify_failed: usize,
    pub verify_failures: usize,
}

impl RunState {
    pub fn record_edit(&mut self, step: usize) {
        self.edits += 1;
        self.last_edit = step;
    }

    pub fn record_verification(&mut self, ok: bool, step: usize) {
        if ok {
            self.last_verify_ok = step;
        } else {
            self.last_verify_failed = step;
            self.verify_failures += 1;
        }
    }

    pub fn last_verification_failed(&self) -> bool {
        self.last_verify_failed > self.last_verify_ok
    }
}
