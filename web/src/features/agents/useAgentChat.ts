import { useCallback, useEffect, useRef, useState } from "react";
import { agentApi, isActive, type AgentRun, type AgentSnapshot, type NativeMessage, type Approval, type AgentUsage } from "./api";

const empty = (): AgentSnapshot => ({ messages: [], drafts: [], runs: [], approvals: [], hasMore: false, cursor: null });
export function mergeNativeMessages(current: NativeMessage[], incoming: NativeMessage[]): NativeMessage[] {
  const items = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) {
    const old = items.get(m.id);
    if (old?.status === "complete" && m.status === "running") continue;
    if (old?.status === "running" && m.status === "running" && old.content.length > m.content.length) continue;
    items.set(m.id, { ...old, ...m, seq: m.seq ?? old?.seq });
  }
  return [...items.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}
export function mergeNativeRuns(current: AgentRun[], incoming: AgentRun[]): AgentRun[] {
  const runs = new Map(current.map((r) => [r.id, r]));
  for (const run of incoming) {
    const old = runs.get(run.id);
    if (old && !isActive(old) && isActive(run)) continue;
    runs.set(run.id, { ...old, ...run });
  }
  return [...runs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 64);
}

/// Snapshots are authoritative for active runs. Drop a stale "running" entry
/// that no longer exists there so a lost SSE completion cannot leave busy=true.
export function reconcileNativeRuns(current: AgentRun[], incoming: AgentRun[]): AgentRun[] {
  const ids = new Set(incoming.map((run) => run.id));
  return mergeNativeRuns(current, incoming).filter((run) => !isActive(run) || ids.has(run.id));
}

export function useAgentChat(project: string, chat: string | undefined) {
  const [state, setState] = useState<AgentSnapshot>(empty);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [usage, setUsage] = useState<AgentUsage>({ inputTokens: 0, outputTokens: 0, cachedTokens: 0, calls: 0 });
  const generation = useRef(0);
  const scope = `${project}:${chat ?? ""}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const busyRef = useRef(false);

  useEffect(() => { busyRef.current = state.runs.some(isActive); }, [state.runs]);

  const refresh = useCallback(async (replace = false) => {
    if (!chat) return;
    const start = scopeRef.current;
    const snapshot = await agentApi.snapshot(project, chat);
    if (start !== scopeRef.current) return;
    setState((current) => {
      const runs = reconcileNativeRuns(replace ? [] : current.runs, snapshot.runs);
      return { ...snapshot, runs, messages: mergeNativeMessages(replace ? [] : current.messages, [...snapshot.messages, ...snapshot.drafts]) };
    });
    const value = await agentApi.usage(project, chat);
    if (start === scopeRef.current) setUsage(value);
  }, [project, chat]);

  useEffect(() => {
    const epoch = ++generation.current;
    setState(empty()); setError(""); setCompacting(false);
    setUsage({ inputTokens: 0, outputTokens: 0, cachedTokens: 0, calls: 0, byAgent: [] });
    if (!chat) return;
    let stopped = false;
    let syncing = false;
    const sync = async () => {
      if (syncing || stopped) return;
      syncing = true;
      try {
        const snapshot = await agentApi.snapshot(project, chat);
        if (stopped || generation.current !== epoch) return;
        setState((current) => {
          const runs = reconcileNativeRuns(current.runs, snapshot.runs);
          return { ...snapshot, runs, messages: mergeNativeMessages(current.messages, [...snapshot.messages, ...snapshot.drafts]) };
        });
        setError("");
      } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : "Falha ao carregar conversa"); }
      finally { syncing = false; }
    };
    void sync();
    void agentApi.usage(project, chat).then((value) => { if (!stopped) setUsage(value); }).catch(() => undefined);
    const stream = new EventSource(agentApi.events(project), { withCredentials: true });
    stream.addEventListener("resync", () => { void sync(); });
    // A lost SSE connection must not leave the chat "thinking" forever: the
    // EventSource reconnects, and this also reconciles from the authoritative
    // snapshot. While a run is active we poll as a safety net for buffered or
    // dropped events.
    stream.onerror = () => { if (!stopped) void sync(); };
    const poll = window.setInterval(() => { if (busyRef.current) void sync(); }, 3000);
    stream.addEventListener("agent", (raw) => {
      if (stopped) return;
      const event = JSON.parse((raw as MessageEvent).data) as { chatId: string; type: string; data: unknown };
      if (event.chatId !== chat) return;
      if (event.type === "delta") {
        if (document.hidden) return;
        const delta = event.data as { id: string; offset: number; text: string };
        setState((current) => {
          const message = current.messages.find((m) => m.id === delta.id);
          if (!message || message.content.length < delta.offset) { queueMicrotask(() => { void sync(); }); return current; }
          if (message.status === "complete" || message.content.length >= delta.offset + delta.text.length) return current;
          const text = message.content + delta.text.slice(message.content.length - delta.offset);
          return { ...current, messages: current.messages.map((m) => m.id === delta.id ? { ...m, content: text } : m) };
        });
      } else if (event.type === "message" || event.type === "error") {
        setCompacting(false);
        setState((current) => ({ ...current, messages: mergeNativeMessages(current.messages, [event.data as NativeMessage]) }));
      } else if (event.type === "run") {
        const run = event.data as AgentRun;
        setState((current) => ({ ...current, runs: mergeNativeRuns(current.runs, [run]), approvals: isActive(run) ? current.approvals : current.approvals.filter((a) => a.runId !== run.id) }));
        if (!isActive(run)) { setCompacting(false); void sync(); void agentApi.usage(project, chat).then((value) => { if (!stopped) setUsage(value); }).catch(() => undefined); }
      } else if (event.type === "approval") {
        const approval = event.data as Approval;
        setState((current) => ({ ...current, approvals: [...current.approvals.filter((a) => a.id !== approval.id), approval] }));
      } else if (event.type === "approval.resolved") {
        const id = (event.data as { id: string }).id;
        setState((current) => ({ ...current, approvals: current.approvals.filter((a) => a.id !== id) }));
      } else if (event.type === "compacting") setCompacting(true);
      else if (event.type === "usage") {
        const value = event.data as { input: number; output: number; cached: number; agentId?: string; kind?: string; estimatedInput?: number };
        setUsage((current) => {
          const agents = new Map((current.byAgent ?? []).map((a) => [a.agentId, a]));
          if (value.agentId) {
            const old = agents.get(value.agentId) ?? { agentId: value.agentId, inputTokens: 0, outputTokens: 0, cachedTokens: 0, calls: 0 };
            agents.set(value.agentId, { ...old, inputTokens: old.inputTokens + value.input, outputTokens: old.outputTokens + value.output, cachedTokens: old.cachedTokens + value.cached, calls: old.calls + 1 });
          }
          return { ...current, inputTokens: current.inputTokens + value.input, outputTokens: current.outputTokens + value.output, cachedTokens: current.cachedTokens + value.cached, calls: current.calls + 1, byAgent: [...agents.values()], ...(value.kind === "turn" ? { contextTokens: value.estimatedInput, contextAgentId: value.agentId } : {}) };
        });
      }
    });
    const visible = () => { if (!document.hidden) void sync(); };
    document.addEventListener("visibilitychange", visible);
    return () => { stopped = true; stream.close(); window.clearInterval(poll); document.removeEventListener("visibilitychange", visible); };
  }, [project, chat]);

  const older = async () => {
    if (!chat || loading || !state.hasMore || state.cursor == null) return;
    setLoading(true); const start = scopeRef.current;
    try {
      const page = await agentApi.snapshot(project, chat, state.cursor);
      if (start === scopeRef.current) setState((current) => ({ ...current, messages: mergeNativeMessages(current.messages, page.messages), cursor: page.cursor, hasMore: page.hasMore }));
    } catch (e) { setError(e instanceof Error ? e.message : "Falha no histórico"); }
    finally { setLoading(false); }
  };
  return { ...state, error, setError, usage, loading, older, refresh, compacting, busy: state.runs.some(isActive) };
}
