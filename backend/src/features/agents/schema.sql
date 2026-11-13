CREATE TABLE IF NOT EXISTS agent_profiles (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), project_id TEXT NOT NULL REFERENCES projects(id),
 chat_id TEXT NOT NULL, config TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_sessions (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), project_id TEXT NOT NULL REFERENCES projects(id),
 chat_id TEXT NOT NULL, agent_id TEXT NOT NULL REFERENCES agent_profiles(id), title TEXT NOT NULL,
 archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
DROP INDEX IF EXISTS agent_session_active;
CREATE UNIQUE INDEX IF NOT EXISTS agent_session_active ON agent_sessions(user_id,project_id,chat_id,agent_id) WHERE archived=0;
CREATE INDEX IF NOT EXISTS agent_session_chat ON agent_sessions(user_id,project_id,chat_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS agent_runs (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES agent_sessions(id), parent_id TEXT REFERENCES agent_runs(id),
 user_id INTEGER NOT NULL, project_id TEXT NOT NULL, chat_id TEXT NOT NULL, agent_id TEXT NOT NULL,
 request_id TEXT NOT NULL, state TEXT NOT NULL, error TEXT NOT NULL DEFAULT '', config TEXT NOT NULL,
 created_at INTEGER NOT NULL, finished_at INTEGER,
 UNIQUE(user_id,project_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_run_active ON agent_runs(session_id) WHERE state IN ('queued','running','waiting');
CREATE INDEX IF NOT EXISTS agent_runs_chat ON agent_runs(user_id,project_id,chat_id,created_at DESC);
-- How many times an interrupted run was automatically resumed. Kept across
-- restarts so a crash loop cannot relaunch the same turn forever.
CREATE TABLE IF NOT EXISTS agent_run_recoveries (
 run_id TEXT PRIMARY KEY REFERENCES agent_runs(id) ON DELETE CASCADE,
 attempts INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_messages (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
 session_id TEXT NOT NULL REFERENCES agent_sessions(id), run_id TEXT REFERENCES agent_runs(id),
 role TEXT NOT NULL, body TEXT NOT NULL, display TEXT NOT NULL, content_text TEXT NOT NULL,
 estimated_tokens INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_message_page ON agent_messages(session_id,seq);
CREATE TABLE IF NOT EXISTS agent_events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
 session_id TEXT NOT NULL REFERENCES agent_sessions(id), run_id TEXT REFERENCES agent_runs(id),
 kind TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_event_session ON agent_events(session_id,seq);
CREATE INDEX IF NOT EXISTS agent_event_run ON agent_events(run_id,seq);
CREATE INDEX IF NOT EXISTS agent_event_kind ON agent_events(session_id,kind,seq);
CREATE VIRTUAL TABLE IF NOT EXISTS agent_history_fts USING fts5(content_text, content='agent_messages',content_rowid='seq');
CREATE TRIGGER IF NOT EXISTS agent_history_insert AFTER INSERT ON agent_messages BEGIN
 INSERT INTO agent_history_fts(rowid,content_text) VALUES (new.seq,new.content_text);
END;
CREATE TABLE IF NOT EXISTS agent_checkpoints (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES agent_sessions(id), through_seq INTEGER NOT NULL,
 summary TEXT NOT NULL, estimated_tokens INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_checkpoint_latest ON agent_checkpoints(session_id,through_seq DESC);
CREATE TABLE IF NOT EXISTS agent_session_state (
 session_id TEXT PRIMARY KEY REFERENCES agent_sessions(id) ON DELETE CASCADE,
 ledger TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_tool_calls (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(id), call_id TEXT NOT NULL,
 name TEXT NOT NULL, arguments TEXT NOT NULL, state TEXT NOT NULL, result TEXT, created_at INTEGER NOT NULL,
 UNIQUE(run_id,call_id)
);
CREATE TABLE IF NOT EXISTS agent_model_calls (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(id), kind TEXT NOT NULL,
 provider TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL,
 cached_tokens INTEGER NOT NULL, reasoning_tokens INTEGER NOT NULL, estimated_input INTEGER NOT NULL,
 duration_ms INTEGER NOT NULL, finish TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_usage_run ON agent_model_calls(run_id,created_at);
CREATE TABLE IF NOT EXISTS agent_artifacts (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, project_id TEXT NOT NULL, run_id TEXT REFERENCES agent_runs(id),
 name TEXT NOT NULL, mime TEXT NOT NULL, path TEXT NOT NULL, bytes INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_memories (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, project_id TEXT NOT NULL, content TEXT NOT NULL,
 source_id TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_memory_project ON agent_memories(user_id,project_id,created_at DESC);
CREATE TABLE IF NOT EXISTS agent_skills (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
 name TEXT NOT NULL, description TEXT NOT NULL, body TEXT NOT NULL,
 agents TEXT NOT NULL DEFAULT '[]', state TEXT NOT NULL DEFAULT 'active',
 replaces TEXT, proposed_by TEXT, reason TEXT, source TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_skill_active_name ON agent_skills(project_id,name) WHERE state='active';
CREATE INDEX IF NOT EXISTS agent_skill_project ON agent_skills(project_id,state,name);
CREATE TABLE IF NOT EXISTS agent_skill_versions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, skill_id TEXT NOT NULL REFERENCES agent_skills(id) ON DELETE CASCADE,
 name TEXT NOT NULL, description TEXT NOT NULL, body TEXT NOT NULL, by TEXT NOT NULL, at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_skill_versions_skill ON agent_skill_versions(skill_id,at DESC);
