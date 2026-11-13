//! Harness sessions, following the same model as the reference app: the
//! engine's session id and what it has already seen live in memory, keyed by
//! the Toph session (a conversation thread in the database). The database is
//! the source of truth for messages; the harness is the source of truth for
//! the model context. When the app restarts, a new engine session starts from
//! the database transcript. While it lives, only the new messages are sent.

use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};

/// The prompt cache lasts about an hour; past it, resuming costs the same as
/// starting over.
pub const SESSION_TTL_MS: i64 = 55 * 60_000;
/// Past this, the next turn starts from the database transcript again.
pub const SESSION_MAX_CONTEXT: usize = 60_000;
pub const MAX_SESSIONS: usize = 100;
const OWN: &str = "*";

#[derive(Clone, Debug)]
pub struct Shown {
    pub id: String,
    pub block: String,
}

#[derive(Clone, Debug)]
pub struct SessionPlan {
    /// The engine's session id.
    pub id: String,
    pub resume: bool,
    /// Message ids to send: all of them on a new session, only the new ones
    /// when resuming.
    pub send: Vec<String>,
}

#[derive(Clone, Debug)]
struct Entry {
    id: String,
    config: String,
    seen: HashMap<String, String>,
    used_at: i64,
    context: usize,
}

pub struct Sessions {
    entries: HashMap<String, Entry>,
    ttl_ms: i64,
    max_context: usize,
    max_entries: usize,
}

impl Default for Sessions {
    fn default() -> Self {
        Self::new(SESSION_TTL_MS, SESSION_MAX_CONTEXT, MAX_SESSIONS)
    }
}

impl Sessions {
    pub fn new(ttl_ms: i64, max_context: usize, max_entries: usize) -> Self {
        Self {
            entries: HashMap::new(),
            ttl_ms,
            max_context,
            max_entries,
        }
    }

    /// Chooses the session for this turn. `restart` forces a new one (the
    /// "try again" path). Returns the engine id and what to send.
    pub fn begin(
        &mut self,
        key: &str,
        config: &str,
        shown: &[Shown],
        restart: bool,
    ) -> SessionPlan {
        if !restart {
            if let Some(entry) = self.entries.get(key) {
                if let Some(send) = self.since(entry, config, shown) {
                    return SessionPlan {
                        id: entry.id.clone(),
                        resume: true,
                        send,
                    };
                }
            }
        }
        SessionPlan {
            id: format!("ses_toph_{}", crate::crypto::new_id()),
            resume: false,
            send: shown.iter().map(|item| item.id.clone()).collect(),
        }
    }

    /// Records a finished turn. `ok` false drops the session so the next turn
    /// starts clean; a failed turn must not leave a half-written context.
    pub fn end(
        &mut self,
        key: &str,
        plan: &SessionPlan,
        ok: bool,
        config: &str,
        shown: &[Shown],
        reply: Option<&str>,
        context: usize,
    ) {
        if !ok {
            if self.entries.get(key).map(|entry| entry.id.as_str()) == Some(plan.id.as_str()) {
                self.entries.remove(key);
            }
            return;
        }
        let mut seen = HashMap::new();
        for item in shown {
            seen.insert(item.id.clone(), hash(&item.block));
        }
        if let Some(reply) = reply {
            seen.insert(reply.to_string(), OWN.to_string());
        }
        self.entries.insert(
            key.to_string(),
            Entry {
                id: plan.id.clone(),
                config: config.to_string(),
                seen,
                used_at: super::models::now(),
                context,
            },
        );
        if self.entries.len() > self.max_entries {
            if let Some(oldest) = self
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.used_at)
                .map(|(key, _)| key.clone())
            {
                self.entries.remove(&oldest);
            }
        }
    }

    pub fn drop_where(&mut self, mut match_key: impl FnMut(&str) -> bool) {
        self.entries.retain(|key, _| !match_key(key));
    }

    /// What is new since the session's last turn, or None when it cannot go on.
    fn since(&self, entry: &Entry, config: &str, shown: &[Shown]) -> Option<Vec<String>> {
        if entry.config != config {
            return None;
        }
        if super::models::now() - entry.used_at > self.ttl_ms {
            return None;
        }
        if entry.context > self.max_context {
            return None;
        }
        let mut send = Vec::new();
        let mut shown_ids = HashSet::new();
        for item in shown {
            shown_ids.insert(item.id.as_str());
            match entry.seen.get(&item.id) {
                None => send.push(item.id.clone()),
                Some(was) => {
                    // A message it already saw cannot come after one it did not.
                    if !send.is_empty() {
                        return None;
                    }
                    if was != OWN && was != &hash(&item.block) {
                        return None;
                    }
                }
            }
        }
        // A message it saw is gone: the transcript was rewritten.
        for id in entry.seen.keys() {
            if !shown_ids.contains(id.as_str()) {
                return None;
            }
        }
        Some(send)
    }
}

pub fn hash(text: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(text.as_bytes());
    format!("{:x}", digest.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shown(id: &str, block: &str) -> Shown {
        Shown {
            id: id.into(),
            block: block.into(),
        }
    }

    #[test]
    fn new_session_sends_everything_and_resume_sends_only_new_messages() {
        let mut sessions = Sessions::new(SESSION_TTL_MS, SESSION_MAX_CONTEXT, MAX_SESSIONS);
        let config = "config";
        let first = vec![shown("m1", "[user]\nola")];
        let plan = sessions.begin("key", config, &first, false);
        assert!(!plan.resume);
        assert_eq!(plan.send, vec!["m1"]);
        sessions.end("key", &plan, true, config, &first, Some("a1"), 100);

        let second = vec![
            shown("m1", "[user]\nola"),
            shown("a1", "[assistant]\nOi"),
            shown("m2", "[user]\nTudo bem?"),
        ];
        let plan = sessions.begin("key", config, &second, false);
        assert!(plan.resume);
        assert_eq!(plan.send, vec!["m2"]);
    }

    #[test]
    fn edited_or_deleted_messages_start_a_new_session() {
        let mut sessions = Sessions::new(SESSION_TTL_MS, SESSION_MAX_CONTEXT, MAX_SESSIONS);
        let config = "config";
        let first = vec![shown("m1", "[user]\nola")];
        let plan = sessions.begin("key", config, &first, false);
        sessions.end("key", &plan, true, config, &first, Some("a1"), 100);

        let edited = vec![shown("m1", "[user]\nola, mudou")];
        let plan = sessions.begin("key", config, &edited, false);
        assert!(!plan.resume);

        let plan = sessions.begin("key", config, &first, false);
        sessions.end("key", &plan, true, config, &first, Some("a1"), 100);
        let plan = sessions.begin("key", config, &[], false);
        assert!(!plan.resume);
    }

    #[test]
    fn config_change_or_budget_starts_a_new_session() {
        let mut sessions = Sessions::new(SESSION_TTL_MS, SESSION_MAX_CONTEXT, MAX_SESSIONS);
        let first = vec![shown("m1", "[user]\nola")];
        let plan = sessions.begin("key", "a", &first, false);
        sessions.end(
            "key",
            &plan,
            true,
            "a",
            &first,
            Some("a1"),
            SESSION_MAX_CONTEXT + 1,
        );
        assert!(!sessions.begin("key", "a", &first, false).resume);

        let plan = sessions.begin("key", "a", &first, false);
        sessions.end("key", &plan, true, "a", &first, Some("a1"), 100);
        assert!(!sessions.begin("key", "b", &first, false).resume);
    }
}
