# Toph native harness

Toph owns the agent loop in `backend/src/features/agents`. The browser submits
one request and follows SSE events. Closing the browser does not cancel the
run. There is no external agent service, CLI, credential discovery, execution
proxy, provider substitution or retry with a different model.

## Setup

1. Configure a direct API URL, key and model under **Settings → AI**. Supported
   protocols are OpenAI Chat Completions, Anthropic Messages and Ollama Chat.
   The selected model must support streaming and tool calls for agent work.
2. Additional connections live under **Conexões de IA**. Models are identified
   by `connection-id::model-id`; model IDs containing `/` remain intact.
3. Select the model for each Toph. An empty agent model uses the explicitly
   configured main model. Provider errors are surfaced; another model is never
   selected automatically.
4. Configure image backends independently. MCP connections and email accounts
   must be explicitly enabled for each agent.

Credentials from other applications are not read or imported. Image generation
uses the selected backend/model without retrying a different model. Native
provider configuration uses its own settings key so old credentials are not
accidentally sent to a different endpoint.

### OpenCode Go as a model API

Use the compatible OpenAI protocol with
`https://opencode.ai/inference/go/openai/v1` and a Console personal API key from
the workspace subscribed to Go. The native client identifies itself as Toph and
sends `x-opencode-session` using the persistent conversation ID, including
compaction calls. The model catalog uses `/inference/go/v1/models`. This is a
direct hosted model API integration; no external agent service is involved.

## Runtime

The chat keeps the individual Toph/team interface: Build/Plan, model and effort
controls update the coordinator in the active chat, while each teammate keeps
its own configuration. Sidebar actions open the selected Toph's configuration
and sessions. The usage popover reports this chat's totals, a per-Toph breakdown,
and the estimated context budget; it does not mix usage from other chats.

Legacy provider-prefixed model selections are migrated to explicit native
connection IDs only when the corresponding provider connection is unambiguous.
The model and provider are preserved; a missing/ambiguous connection requires
configuration and never causes a retry against another provider. Workspace
reads/writes normalize these IDs so an older browser tab cannot restore a
misrouted selection.

`runtime.rs` owns admission, execution, cancellation, model concurrency, tool
dispatch, approvals, delegation and events. Runs have stable request IDs for
idempotent submission. A SQLite uniqueness constraint allows one active run per
session. Different sessions share four concurrent model-request slots.

`repository.rs` stores profiles, sessions, runs, original protocol messages,
checkpoints, tool calls, model usage and artifacts. Messages and the existing
chat transcript mirror are committed together. The UI no longer writes message
history or coordinates other agents.

`context.rs` builds a stable instruction prefix, summary and recent complete
turn groups. Tool-call batches are never split from their results. Older groups
are summarized incrementally using the same selected model, and the checkpoint
records the covered sequence. Original messages remain searchable using FTS5.

### Initial limits

| Resource | Limit |
| --- | --- |
| Input context | 12,000 estimated tokens, including instructions and schemas |
| Run budget | 120,000 reserved estimated tokens, including summaries and children |
| Tool/model loop | 24 iterations per agent |
| Parallel model requests | 4 across the runtime |
| Run admission | 16 active/queued entries checked at admission |
| Delegation | One level; workers cannot recursively delegate |
| Run duration | 15 minutes |
| Shell duration | 30 seconds by default, maximum 120 seconds |
| Shell output | 64 KiB per stdout/stderr; total byte counts indicate truncation |
| Tool result in context | 2,400 characters; larger results become artifacts |
| Uploaded attachments | 8 MiB decoded total; UTF-8 text or PNG/JPEG/WebP/GIF |
| MCP connections | At most 8 cached connections; idle eviction after 60 seconds |
| MCP RPC | 45 seconds; 1 MiB response limit |

Token estimates are model-independent heuristics, not invoices or exact
tokenizer counts. Each model call records provider-reported input, output,
cached and reasoning tokens separately, plus the estimate and latency. Pending
calls reserve budget; the main configuration's weekly limit covers native runs
across projects. Autocomplete is disabled initially and capped at 512 output
tokens when enabled. Utility completions also enforce the input budget.

Large attachments and request buffers are released after preparation/use rather
than kept for the lifetime of a run. Streaming updates are coalesced to roughly
12 updates/second per run. SSE subscribers use a bounded broadcast channel;
reconnection or lag triggers a durable snapshot with live drafts.

## Tools and permissions

Native tools include file ranges, path/content search, hash-checked writes,
exact-text edits, finite shell execution, HTTP fetch, artifact reads, historical
search, source-linked project memories, images, email and MCP.

The existing agent modes are enforced by the backend. Plan/deny agents receive
read-only tools. Ask mode pauses mutating tools for a one-time approval; YOLO
executes enabled tools directly. Optional image/delegation tools use an explicit
allowlist; an empty optional list enables neither. Delegated agents cannot gain
permissions beyond their parent. MCP schemas are discovered on demand rather
than injecting every server's tools into every prompt.

Shell timeouts/cancellation kill the process group on Unix. On Windows,
`kill_on_drop` terminates the spawned command; full descendant process-tree
isolation is not implemented. Shell execution uses the server user's OS access.

## History and interruption

The first native session for an agent imports its locally stored user/assistant
transcript once. Imported text is searchable but is not replayed in full to the
model. A new session subsequently archives the prior session and starts fresh.
No external application's history is queried.

Server restart marks unfinished runs/tool calls as interrupted. Missing tool
results are represented explicitly before the next requested run. Mutations are
never replayed automatically: the model is told to inspect effects before retrying.
Completed data remains available after a reconnect.

Tables: `agent_profiles`, `agent_sessions`, `agent_runs`, `agent_messages`,
`agent_history_fts`, `agent_checkpoints`, `agent_tool_calls`, `agent_model_calls`,
`agent_artifacts`, `agent_memories`. Full artifact data lives under the configured
data directory, with user/project ownership in SQLite.

## API

Project endpoints are below `/api/projects/:project/agent`:

- `POST /runs`: submit a request, selected agent and roster.
- `POST /runs/:run/cancel`: cancel an execution.
- `POST /cancel`: cancel this user's project/agent executions.
- `GET /events`: SSE notifications; `GET /snapshot?chatId=...` recovers state.
- `GET /sessions?agentId=...`, `POST /sessions`: list, activate or start sessions.
- `POST /approvals/:call`: approve/reject a waiting tool.
- `GET /usage?chatId=...`, `GET /artifacts/:id`: chat/Toph usage and owned artifacts.

Direct connections use `/api/ai/connections`; MCP uses `/api/mcp/servers`.

## Verification

`backend/tests/agents.rs` exercises model → tool → model, SSE disconnection,
idempotency, cancellation, approvals, planning mode, budget enforcement,
delegation, compaction, local history import and interrupted-call repair.
Provider protocol tests use local HTTP fixtures; MCP tests cover stdio and
Streamable HTTP session reuse. No paid model calls are required to run tests.
