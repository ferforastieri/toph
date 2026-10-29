import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OpenCode } from "@opencode/client";
import { Bot, ChevronDown, History, Settings2, X } from "@toph/icons";
import { openCodeBase, type Project } from "../api";
import { useAI } from "../ai";
import { useApp, type AiMessage, type Tab } from "../store";
import { Button } from "@/boardui/base/buttons/button";
import { Chip } from "@/boardui/base/badges/chip";
import { Select, SelectItem } from "@/boardui/base/select/select";
import { AgentComposer, type AgentAttachment } from "../ui/AgentComposer";
import AgentSessionsSheet from "../components/AgentSessionsSheet";
import AiSettingsModal, { type AiSettingsTab } from "../components/AiSettingsModal";
import AgentTranscript from "../components/AgentTranscript";
import OpenCodeFormCard, { type OpenCodeForm, type OpenCodeFormAnswer } from "../components/OpenCodeFormCard";
import type { OpenCodeSessionSummary } from "../opencodeSessions";
import { notifyAiResponse } from "../aiNotifications";
import { useIsMobile } from "../ui/useIsMobile";

const EMPTY_MESSAGES: AiMessage[] = [];

interface Props {
  tab: Tab;
  project: Project;
  onClose?: () => void;
}

function toolContent(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text ?? "");
      return JSON.stringify(part, null, 2);
    }).join("\n");
  }
  return JSON.stringify(value, null, 2);
}

function sameMessage(a: AiMessage, b: AiMessage): boolean {
  return a.role === b.role
    && a.text === b.text
    && a.title === b.title
    && a.detail === b.detail
    && a.status === b.status
    && a.permissionId === b.permissionId
    && a.permissionAction === b.permissionAction
    && a.createdAt === b.createdAt;
}

function restoreMessages(context: unknown): AiMessage[] {
  if (!Array.isArray(context)) return [];
  return (context as Array<Record<string, any>>).flatMap<AiMessage>((message) => {
    if (message.type === "user") {
      return [{
        id: `history-user-${message.id}`,
        role: "user",
        text: String(message.text ?? ""),
        createdAt: Number(message.time?.created ?? Date.now()),
      }];
    }
    if (message.type !== "assistant") return [];

    const parts = (message.content ?? []) as Array<Record<string, any>>;
    const restored: AiMessage[] = [];
    const text = parts
      .filter((part) => part.type === "text" && part.text)
      .map((part) => String(part.text))
      .join("");
    if (text) {
      restored.push({
        id: `assistant-${message.id}`,
        role: "assistant",
        text,
        createdAt: Number(message.time?.created ?? Date.now()),
      });
    }
    const reasoning = parts
      .filter((part) => part.type === "reasoning" && part.text)
      .map((part) => String(part.text))
      .join("");
    if (reasoning) {
      restored.push({
        id: `reasoning-${message.id}`,
        role: "reasoning",
        text: reasoning,
        createdAt: Number(message.time?.created ?? Date.now()),
      });
    }
    for (const part of parts) {
      if (part.type !== "tool") continue;
      restored.push({
        id: `tool-${part.id ?? part.name}`,
        role: "tool",
        title: `Tool · ${String(part.name ?? "call")}`,
        text: toolContent(part.input),
        detail: toolContent(part.content ?? part.output),
        status: part.state === "error" ? "error" : "complete",
        createdAt: Number(message.time?.created ?? Date.now()),
      });
    }
    return restored;
  });
}

export default function OpenCodePanelTab({ tab, project, onClose }: Props) {
  const updateTab = useApp((state) => state.updateTab);
  const addMessage = useApp((state) => state.addAiMessage);
  const appendText = useApp((state) => state.appendAiText);
  const updateMessage = useApp((state) => state.updateAiMessage);
  const setStreaming = useApp((state) => state.setAiStreaming);
  const setMessages = useApp((state) => state.setAiMessages);
  const emptyMessages = useApp((state) => state.aiMessages[tab.id]);
  const messages = emptyMessages ?? EMPTY_MESSAGES;
  const streaming = useApp((state) => state.aiStreaming[tab.id] ?? false);
  const mobile = useIsMobile();
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const aiConfig = useAI((state) => state.config);
  const models = useAI((state) => state.models);
  const loadModels = useAI((state) => state.loadModels);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [model, setModel] = useState(aiConfig?.model ?? "");
  const [effort, setEffort] = useState("");
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<AiSettingsTab>("general");
  const [forms, setForms] = useState<OpenCodeForm[]>([]);
  const [formBusy, setFormBusy] = useState<string | null>(null);

  function openSettings(tab: AiSettingsTab = "general") {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

  useEffect(() => {
    const handleContext = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path;
      if (!path) return;
      setInput((current) => `${current}${current.trim() ? " " : ""}@${path} `);
    };
    window.addEventListener("toph:ai-context", handleContext);
    return () => window.removeEventListener("toph:ai-context", handleContext);
  }, []);
  const [usage, setUsage] = useState<{ cost?: number; tokens?: unknown } | null>(null);
  const [permissionMode, setPermissionMode] = useState<"yolo" | "ask" | "deny">("yolo");
  const permissionModeRef = useRef(permissionMode);
  const [agents, setAgents] = useState<Array<{ id: string; name: string; mode: string }>>([]);
  const [agent, setAgent] = useState("build");
  useEffect(() => { permissionModeRef.current = permissionMode; }, [permissionMode]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const pendingDeltas = useRef(new Map<string, string>());
  const flushTimer = useRef<number | null>(null);
  const sendInFlight = useRef(false);
  const subagents = useRef(new Map<string, string>());
  const notifyPending = useRef(false);
  const client = useMemo(() => {
    const csrf = document.cookie.match(/(?:^|;\s*)toph_csrf=([^;]+)/)?.[1] ?? "";
    return OpenCode.make({
      baseUrl: openCodeBase(),
      headers: { "X-Toph-CSRF": csrf },
    });
  }, []);
  const selectedModel = models.find((item) => item.id === model);
  const efforts = selectedModel?.variants ?? [];

  const flushDeltas = useCallback(() => {
    flushTimer.current = null;
    const pending = pendingDeltas.current;
    pendingDeltas.current = new Map();
    for (const [messageId, delta] of pending) {
      appendText(tab.id, messageId, delta);
    }
  }, [appendText, tab.id]);

  const queueDelta = useCallback((messageId: string, delta: string) => {
    if (!delta) return;
    pendingDeltas.current.set(messageId, (pendingDeltas.current.get(messageId) ?? "") + delta);
    if (flushTimer.current !== null) return;
    const delay = window.matchMedia("(max-width: 900px)").matches ? 100 : 55;
    flushTimer.current = window.setTimeout(flushDeltas, delay);
  }, [flushDeltas]);

  const dropPending = useCallback((messageId: string) => {
    pendingDeltas.current.delete(messageId);
  }, []);

  const ensureMessage = useCallback((message: AiMessage) => {
    const existing = useApp.getState().aiMessages[tab.id]?.some((item) => item.id === message.id);
    if (!existing) addMessage(tab.id, message);
  }, [addMessage, tab.id]);

  const syncSession = useCallback(async (sessionId: string) => {
    const [contextResult, activeResult] = await Promise.allSettled([
      client.session.context({ sessionID: sessionId } as never),
      client.session.active(),
    ]);
    if (contextResult.status === "fulfilled") {
      if (flushTimer.current !== null) {
        window.clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      pendingDeltas.current.clear();
      const restored = restoreMessages(contextResult.value);
      const previous = useApp.getState().aiMessages[tab.id] ?? [];
      const byId = new Map(previous.map((message) => [message.id, message]));
      let changed = previous.length !== restored.length;
      const merged = restored.map((message, index) => {
        const existing = byId.get(message.id);
        if (existing && sameMessage(existing, message)) {
          if (previous[index] !== existing) changed = true;
          return existing;
        }
        changed = true;
        return message;
      });
      if (changed) setMessages(tab.id, merged);
    }
    if (activeResult.status === "fulfilled") {
      const active = activeResult.value as Record<string, { type?: string }>;
      setStreaming(tab.id, active[sessionId]?.type === "running");
    }
  }, [client, setMessages, setStreaming, tab.id]);

  useEffect(() => {
    return () => {
      if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!tab.sessionId) return;
    const sessionId = tab.sessionId;
    const refresh = () => {
      if (!document.hidden) void syncSession(sessionId);
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [syncSession, tab.sessionId]);

  useEffect(() => {
    if (!mobile || !tab.sessionId || !streaming) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void syncSession(tab.sessionId!);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [mobile, streaming, syncSession, tab.sessionId]);

  useEffect(() => {
    if (!mobile) return;
    let cancelled = false;
    (async () => {
      const active = await client.session.active().catch(() => null);
      if (!active || cancelled) return;
      const running = new Set(
        Object.entries(active)
          .filter(([, status]) => status.type === "running")
          .map(([sessionID]) => sessionID),
      );
      if (running.size === 0) return;
      const response = await client.session.list({
        directory: project.root,
        limit: 50,
        order: "desc",
      } as never).catch(() => null);
      if (!response || cancelled) return;
      const sessions = (response.data ?? []) as OpenCodeSessionSummary[];
      const current = sessions.find((session) => running.has(session.id) && !session.parentID && !session.metadata?.tophBotId);
      if (!current || current.id === tab.sessionId) return;
      setMessages(tab.id, []);
      setStreaming(tab.id, true);
      pendingDeltas.current.clear();
      stickToBottom.current = true;
      updateTab(tab.id, { sessionId: current.id, title: current.title ?? "OpenCode" });
    })();
    return () => { cancelled = true; };
  }, [client, mobile, project.root, setMessages, setStreaming, tab.id, tab.sessionId, updateTab]);

  useEffect(() => {
    const refreshConnection = () => {
      if (!document.hidden) setConnectionEpoch((epoch) => epoch + 1);
    };
    document.addEventListener("visibilitychange", refreshConnection);
    window.addEventListener("online", refreshConnection);
    return () => {
      document.removeEventListener("visibilitychange", refreshConnection);
      window.removeEventListener("online", refreshConnection);
    };
  }, []);

  useEffect(() => {
    if (!stickToBottom.current) return;
    const frame = window.requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (!element) return;
      element.scrollTop = element.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [forms.length, messages, streaming]);

  useEffect(() => {
    if (models.length === 0) void loadModels();
  }, [loadModels, models.length]);

  useEffect(() => {
    let cancelled = false;
    client.agent.list({ location: { directory: project.root } } as never)
      .then((result) => {
        if (cancelled) return;
        const list = (result as { data?: Array<{ id: string; name: string; mode: string; hidden?: boolean }> }).data ?? [];
        const visible = list.filter((item) => (!item.hidden || item.id === "plan") && item.mode !== "subagent");
        setAgents(visible);
        if (visible.length > 0 && !visible.some((item) => item.id === agent)) {
          setAgent(visible.find((item) => item.id === "build")?.id ?? visible[0].id);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [client, project.root]);

  useEffect(() => {
    if (!model && aiConfig?.model) setModel(aiConfig.model);
  }, [aiConfig?.model, model]);

  useEffect(() => {
    if (!tab.sessionId) { setUsage(null); return; }
    let cancelled = false;
    client.session.get({ sessionID: tab.sessionId } as never)
      .then((session) => {
        if (cancelled) return;
        const info = session as { cost?: number; tokens?: unknown };
        if (info.cost !== undefined || info.tokens) setUsage({ cost: info.cost, tokens: info.tokens });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [client, tab.sessionId]);

  useEffect(() => {
    if (!tab.sessionId) {
      setForms([]);
      return;
    }
    let cancelled = false;
    client.session.form.list({ sessionID: tab.sessionId } as never)
      .then((result) => {
        if (!cancelled) setForms((result as unknown as OpenCodeForm[]) ?? []);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [client, tab.sessionId]);

  useEffect(() => {
    if (efforts.length === 0) return;
    if (!efforts.includes(effort)) {
      setEffort(efforts.includes("max") ? "max" : efforts[efforts.length - 1]);
    }
  }, [effort, efforts]);

  useEffect(() => {
    if (!streaming) return;
    const timer = window.setTimeout(() => setStreaming(tab.id, false), 15 * 60_000);
    return () => window.clearTimeout(timer);
  }, [setStreaming, streaming, tab.id]);

  useEffect(() => {
    if (!tab.sessionId) return;
    const sessionId = tab.sessionId;
    const controller = new AbortController();
    let retry: number | undefined;
    const notifyCompletion = () => {
      if (!notifyPending.current) return;
      notifyPending.current = false;
      const all = useApp.getState().aiMessages[tab.id] ?? [];
      const last = [...all]
        .reverse()
        .find((message) => message.role === "assistant" && message.text.trim());
      notifyAiResponse({
        projectId: project.id,
        tabId: tab.id,
        sessionId,
        text: last?.text,
      });
    };
    (async () => {
      try {
        setError("");
        for await (const event of client.event.subscribe({ signal: controller.signal })) {
          const data = (event as { data?: Record<string, unknown> }).data;
          if (!data) continue;

          if (event.type === "session.created") {
            if (String(data.parentID ?? "") === sessionId && data.sessionID) {
              const childID = String(data.sessionID);
              const title = String(data.title ?? data.slug ?? "subagent");
              subagents.current.set(childID, title);
              addMessage(tab.id, {
                id: `subagent-${childID}`,
                role: "step",
                title: "Subagent",
                text: `Subagent started: ${title}`,
                status: "running",
                createdAt: Date.now(),
              });
            }
            continue;
          }

          if (event.type === "form.created") {
            const form = (data as { form?: OpenCodeForm }).form;
            if (form && form.sessionID === sessionId) {
              setForms((current) => current.some((item) => item.id === form.id) ? current : [...current, form]);
            }
            continue;
          }

          const sid = String(data.sessionID ?? "");
          if (!sid || (sid !== sessionId && !subagents.current.has(sid))) continue;
          const isSubagent = sid !== sessionId;
          const subagentTitle = isSubagent ? subagents.current.get(sid) ?? "subagent" : "";
          const prefix = isSubagent ? `sub-${sid.slice(0, 8)}-` : "";
          const assistantID = String(data.assistantMessageID ?? "");
          const messageID = (kind: string, id = assistantID) => `${prefix}${kind}-${id || Date.now()}`;

          switch (event.type) {
            case "session.text.started": {
              ensureMessage({
                id: messageID("assistant"),
                role: isSubagent ? "subagent" : "assistant",
                title: subagentTitle,
                text: "",
                status: "running",
                createdAt: Date.now(),
              });
              break;
            }
            case "session.text.delta": {
              const id = messageID("assistant");
              ensureMessage({
                id,
                role: isSubagent ? "subagent" : "assistant",
                title: subagentTitle,
                text: "",
                status: "running",
                createdAt: Date.now(),
              });
              queueDelta(id, String(data.delta ?? ""));
              break;
            }
            case "session.text.ended": {
              const id = messageID("assistant");
              dropPending(id);
              updateMessage(tab.id, id, { text: String(data.text ?? ""), status: "complete" });
              break;
            }
            case "session.reasoning.started": {
              ensureMessage({
                id: messageID("reasoning"),
                role: "reasoning",
                title: isSubagent ? `Reasoning · ${subagentTitle}` : "Reasoning",
                text: "",
                status: "running",
                createdAt: Date.now(),
              });
              break;
            }
            case "session.reasoning.delta": {
              const id = messageID("reasoning");
              ensureMessage({
                id,
                role: "reasoning",
                title: isSubagent ? `Reasoning · ${subagentTitle}` : "Reasoning",
                text: "",
                status: "running",
                createdAt: Date.now(),
              });
              queueDelta(id, String(data.delta ?? ""));
              break;
            }
            case "session.reasoning.ended": {
              const id = messageID("reasoning");
              dropPending(id);
              updateMessage(tab.id, id, { text: String(data.text ?? ""), status: "complete" });
              break;
            }
            case "session.tool.input.started": {
              ensureMessage({
                id: messageID("tool", String(data.id ?? "")),
                role: "tool",
                title: `Tool · ${String(data.name ?? "call")}`,
                text: "",
                detail: "",
                status: "running",
                createdAt: Date.now(),
              });
              break;
            }
            case "session.tool.input.delta": {
              const id = messageID("tool", String(data.id ?? ""));
              queueDelta(id, String(data.delta ?? ""));
              break;
            }
            case "session.tool.input.ended": {
              const id = messageID("tool", String(data.id ?? ""));
              dropPending(id);
              updateMessage(tab.id, id, {
                text: String(data.text ?? ""),
                status: "running",
              });
              break;
            }
            case "session.tool.called": {
              const id = messageID("tool", String(data.id ?? ""));
              const existing = useApp.getState().aiMessages[tab.id]?.some((message) => message.id === id);
              if (existing) {
                updateMessage(tab.id, id, { text: toolContent(data.input), status: "running" });
              } else {
                addMessage(tab.id, {
                  id,
                  role: "tool",
                  title: "Tool",
                  text: toolContent(data.input),
                  detail: "",
                  status: "running",
                  createdAt: Date.now(),
                });
              }
              break;
            }
            case "session.tool.success": {
              updateMessage(tab.id, messageID("tool", String(data.id ?? "")), {
                detail: toolContent(data.content ?? data.metadata),
                status: "complete",
              });
              break;
            }
            case "session.tool.failed": {
              updateMessage(tab.id, messageID("tool", String(data.id ?? "")), {
                detail: toolContent(data.error ?? data.content),
                status: "error",
              });
              break;
            }
            case "session.step.started": {
              ensureMessage({
                id: messageID("step"),
                role: "step",
                title: "Agent",
                text: `Step started · ${String(data.agent ?? "agent")}`,
                status: "running",
                createdAt: Date.now(),
              });
              break;
            }
            case "session.step.ended": {
              setUsage({ cost: Number(data.cost ?? 0), tokens: data.tokens });
              break;
            }
            case "session.usage.updated": {
              setUsage({ cost: Number(data.cost ?? 0), tokens: data.tokens });
              break;
            }
            case "session.synthetic":
            case "session.skill.activated":
            case "session.compaction.started":
            case "session.compaction.ended": {
              addMessage(tab.id, {
                id: `step-${String(event.type)}-${Date.now()}`,
                role: "step",
                title: "Agent",
                text: String(event.type).replace("session.", "").replaceAll(".", " "),
                status: "complete",
                createdAt: Date.now(),
              });
              break;
            }
            case "session.retry.scheduled": {
              addMessage(tab.id, {
                id: `retry-${Date.now()}`,
                role: "step",
                title: "Retry",
                text: `Retry scheduled (#${String(data.attempt ?? "")})`,
                status: "running",
                createdAt: Date.now(),
              });
              break;
            }
            case "form.replied":
            case "form.cancelled": {
              const formID = String(data.id ?? "");
              setForms((current) => current.filter((form) => form.id !== formID));
              break;
            }
            case "permission.asked": {
              const mode = permissionModeRef.current;
              const autoApprove = mode === "yolo";
              const autoDeny = mode === "deny";
              addMessage(tab.id, {
                id: `permission-${String(data.id)}`,
                role: "tool",
                text: `Permission requested: ${String(data.action)} ${JSON.stringify(data.resources ?? [])}`,
                title: autoApprove ? "Permission auto-approved" : autoDeny ? "Permission auto-denied" : "Permission",
                createdAt: Date.now(),
                permissionId: mode === "ask" ? String(data.id) : undefined,
                permissionAction: String(data.action ?? ""),
              });
              if (mode !== "ask") {
                void client.permission.reply({
                  sessionID: sessionId,
                  requestID: String(data.id),
                  decision: autoApprove ? "always" : "reject",
                } as never).catch(() => undefined);
              }
              break;
            }
            case "session.execution.started": {
              if (!isSubagent) notifyPending.current = true;
              setStreaming(tab.id, true);
              break;
            }
            case "session.execution.succeeded":
            case "session.execution.interrupted": {
              if (!isSubagent) {
                notifyCompletion();
              }
              setStreaming(tab.id, false);
              break;
            }
            case "session.execution.failed": {
              if (!isSubagent) {
                notifyCompletion();
              }
              addMessage(tab.id, {
                id: `error-${Date.now()}`,
                role: "error",
                text: "OpenCode could not complete this turn.",
                createdAt: Date.now(),
              });
              setStreaming(tab.id, false);
              break;
            }
            case "session.status": {
              const nextStatus = (data.status as { type?: string } | undefined)?.type;
              if (nextStatus === "idle") {
                if (!isSubagent) notifyCompletion();
                setStreaming(tab.id, false);
              } else if (nextStatus === "busy") {
                setStreaming(tab.id, true);
              }
              break;
            }
            case "session.idle": {
              if (!isSubagent) notifyCompletion();
              setStreaming(tab.id, false);
              break;
            }
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Event stream closed.");
          setStreaming(tab.id, false);
          retry = window.setTimeout(() => setConnectionEpoch((epoch) => epoch + 1), 2000);
        }
      }
    })();
    return () => {
      controller.abort();
      if (retry !== undefined) window.clearTimeout(retry);
    };
  }, [addMessage, client, connectionEpoch, dropPending, ensureMessage, project.id, queueDelta, setStreaming, tab.id, tab.sessionId, updateMessage]);

  function selectSession(session: OpenCodeSessionSummary) {
    setMessages(tab.id, []);
    setStreaming(tab.id, false);
    pendingDeltas.current.clear();
    stickToBottom.current = true;
    updateTab(tab.id, { sessionId: session.id, title: session.title ?? "OpenCode" });
    setSessionsOpen(false);
  }

  function newSession() {
    setMessages(tab.id, []);
    setStreaming(tab.id, false);
    pendingDeltas.current.clear();
    stickToBottom.current = true;
    updateTab(tab.id, { sessionId: undefined, title: "OpenCode" });
    setSessionsOpen(false);
  }

  async function applyModel(sessionID: string, nextModel = model, nextEffort = effort) {
    if (!nextModel) return;
    const split = nextModel.indexOf("/");
    if (split < 0) return;
    await client.session.switchModel({
      sessionID,
      model: {
        providerID: nextModel.slice(0, split),
        id: nextModel.slice(split + 1),
        variant: nextEffort || undefined,
      },
    } as never);
  }

  async function ensureSession(): Promise<string> {
    if (tab.sessionId) {
      await applyModel(tab.sessionId).catch(() => undefined);
      return tab.sessionId;
    }
    const session = await client.session.create({
      location: { directory: project.root },
      agent,
    } as never);
    updateTab(tab.id, {
      sessionId: session.id,
      title: (session as { title?: string }).title ?? "OpenCode",
    });
    await applyModel(session.id).catch(() => undefined);
    return session.id;
  }

  async function chooseModel(next: string) {
    setModel(next);
    const nextModel = models.find((item) => item.id === next);
    const variants = nextModel?.variants ?? [];
    const nextEffort = variants.includes(effort)
      ? effort
      : variants.includes("max")
        ? "max"
        : variants[variants.length - 1] ?? "";
    setEffort(nextEffort);
    if (tab.sessionId) await applyModel(tab.sessionId, next, nextEffort).catch(() => undefined);
  }

  async function chooseEffort(next: string) {
    setEffort(next);
    if (tab.sessionId) await applyModel(tab.sessionId, model, next).catch(() => undefined);
  }

  async function chooseAgent(next: string) {
    setAgent(next);
    if (tab.sessionId) {
      await client.session.switchAgent({ sessionID: tab.sessionId, agent: next } as never).catch(() => undefined);
    }
  }

  async function send(text: string, attachments: AgentAttachment[]) {
    if ((!text && attachments.length === 0) || streaming || sendInFlight.current) return;
    sendInFlight.current = true;
    if (tab.sessionId) {
      const active = await client.session.active().catch(() => null);
      if (active?.[tab.sessionId]?.type === "running") {
        setStreaming(tab.id, true);
        setError("O agente já está trabalhando nesta sessão. O progresso será sincronizado.");
        void syncSession(tab.sessionId);
        sendInFlight.current = false;
        return;
      }
    }
    setInput("");
    setError("");
    stickToBottom.current = true;
    addMessage(tab.id, {
      id: `user-${Date.now()}`,
      role: "user",
      text: text || attachments.map((file) => file.name).join(", "),
      createdAt: Date.now(),
    });
    notifyPending.current = true;
    setStreaming(tab.id, true);
    try {
      const sessionId = await ensureSession();
      await client.session.prompt({
        sessionID: sessionId,
        text: text || "See attached files.",
        files: attachments.map((file) => ({
          uri: file.uri,
          name: file.name,
          description: file.mime,
        })),
      } as never);
    } catch (err) {
      notifyPending.current = false;
      setStreaming(tab.id, false);
      const message = err instanceof Error ? err.message : "Could not reach OpenCode.";
      setError(message);
      addMessage(tab.id, {
        id: `error-${Date.now()}`,
        role: "error",
        text: message,
        createdAt: Date.now(),
      });
    } finally {
      sendInFlight.current = false;
    }
  }

  async function replyPermission(messageId: string, requestId: string, decision: "once" | "always" | "reject") {
    if (!tab.sessionId) return;
    try {
      await client.permission.reply({
        sessionID: tab.sessionId,
        requestID: requestId,
        decision,
      } as never);
      updateMessage(tab.id, messageId, {
        permissionId: undefined,
        text:
          decision === "reject"
            ? "Permission rejected."
            : decision === "always"
              ? "Permission allowed for this session."
              : "Permission allowed once.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reply to the permission request.");
    }
  }

  async function answerForm(form: OpenCodeForm, answer: OpenCodeFormAnswer) {
    if (!tab.sessionId) return;
    setFormBusy(form.id);
    setError("");
    try {
      await client.session.form.reply({
        sessionID: tab.sessionId,
        formID: form.id,
        answer,
      } as never);
      setForms((current) => current.filter((item) => item.id !== form.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível responder à pergunta.");
    } finally {
      setFormBusy(null);
    }
  }

  async function cancelForm(form: OpenCodeForm) {
    if (!tab.sessionId) return;
    setFormBusy(form.id);
    try {
      await client.session.form.cancel({
        sessionID: tab.sessionId,
        formID: form.id,
        message: "Cancelado pelo usuário",
      } as never);
      setForms((current) => current.filter((item) => item.id !== form.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível cancelar a pergunta.");
    } finally {
      setFormBusy(null);
    }
  }

  async function stop() {
    if (!tab.sessionId) return;
    try {
      await client.session.interrupt({ sessionID: tab.sessionId } as never);
    } catch {
      // The turn may already be finished.
    }
    setStreaming(tab.id, false);
  }

  const usageTokens = usage?.tokens as { input?: number; output?: number; reasoning?: number } | undefined;
  const usageTotal = (usageTokens?.input ?? 0) + (usageTokens?.output ?? 0) + (usageTokens?.reasoning ?? 0);
  const usageLabel = usageTotal >= 1_000_000
    ? `${(usageTotal / 1_000_000).toFixed(1)}M`
    : usageTotal >= 1_000
      ? `${(usageTotal / 1_000).toFixed(1)}k`
      : String(usageTotal);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="bg-background-secondary-default flex shrink-0 flex-col gap-2 border-b p-2">
        <div className="flex items-center gap-2">
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-start hover:bg-accent" onClick={() => setSessionsOpen(true)} aria-label="Abrir listagem de sessões">
            <History size={14} className="shrink-0 text-foreground-icon-secondary" />
            <span className="min-w-0 max-w-[60%] truncate text-body-medium text-text-primary">{tab.sessionId ? tab.title || `Sessão ${tab.sessionId.slice(0, 8)}` : "Nova sessão"}</span>
            <ChevronDown size={13} className="shrink-0 text-foreground-icon-secondary" />
            <span className="flex-1" />
          </button>
          <Button variant="ghost" size="xs" iconOnly leadingIcon={Settings2} aria-label="Configurações da IA" title="Configurações da IA" onClick={() => openSettings("general")} />
          {onClose && <Button variant="ghost" size="xs" iconOnly leadingIcon={X} aria-label="Fechar agente" onClick={onClose} />}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          const element = event.currentTarget;
          stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
      >
        <div className="flex min-h-full flex-col gap-4 p-3">
          {messages.length === 0 && (
            <div className="bg-background-secondary-default my-auto mx-auto flex w-full max-w-sm flex-col items-center gap-2 rounded-lg border p-6 text-center">
              <span className="flex size-9 items-center justify-center rounded-full bg-background-tertiary-default text-foreground-icon-secondary"><Bot size={20} /></span>
              <strong className="text-body-medium text-text-primary">Pergunte ao OpenCode</strong>
              <p className="text-caption-1-regular text-text-secondary">A sessão roda no servidor e pode ler {project.root}.</p>
              <Button variant="secondary" size="small" leadingIcon={Settings2} onClick={() => openSettings("connections")}>Gerenciar conexões de IA</Button>
            </div>
          )}
          <AgentTranscript
            messages={messages}
            streaming={streaming}
            onPermission={(messageId, permissionId, decision) => void replyPermission(messageId, permissionId, decision)}
          />
          {forms.map((form) => (
            <OpenCodeFormCard
              key={form.id}
              form={form}
              busy={formBusy === form.id}
              onSubmit={(answer) => void answerForm(form, answer)}
              onCancel={() => void cancelForm(form)}
            />
          ))}
        </div>
      </div>
      {usageTotal > 0 && !streaming && (
        <div className="flex items-center justify-end gap-1.5 px-3 pb-1 text-caption-2-regular text-text-tertiary">
          <span>{usageLabel} tokens</span>
          {typeof usage?.cost === "number" && <span>· ${usage.cost.toFixed(4)}</span>}
        </div>
      )}
      {error && <Chip color="rose" variant="subtle" className="mx-2 justify-start whitespace-normal px-2 py-1">{error}</Chip>}
      <AgentComposer
        value={input}
        onChange={setInput}
        onSend={(text, attachments) => void send(text, attachments)}
        onStop={() => void stop()}
        busy={streaming}
        models={models}
        model={model}
        onModelChange={(next) => void chooseModel(next)}
        effort={effort}
        efforts={efforts}
        onEffortChange={(next) => void chooseEffort(next)}
        placeholder="Pergunte qualquer coisa, / para comandos, @ para contexto..."
        allowAttachments
        modeControls={
          <>
            <Select selectedKey={agent} onSelectionChange={(key) => void chooseAgent(String(key))} aria-label="Modo" className="w-auto" triggerClassName="h-7 gap-1 border-0 bg-transparent px-1.5 text-body-2-medium shadow-none">
              {agents.length === 0 ? (
                <>
                  <SelectItem id="build">Build</SelectItem>
                  <SelectItem id="plan">Plano</SelectItem>
                </>
              ) : (
                <>
                  {agents.map((item) => <SelectItem key={item.id} id={item.id}>{item.id === "plan" ? "Plano" : item.name || item.id}</SelectItem>)}
                  {!agents.some((item) => item.id === "plan") && <SelectItem id="plan">Plano</SelectItem>}
                </>
              )}
            </Select>
            <Select selectedKey={permissionMode} onSelectionChange={(key) => setPermissionMode(String(key) as "yolo" | "ask" | "deny")} aria-label="Permissões" className="w-auto" triggerClassName="h-7 gap-1 border-0 bg-transparent px-1.5 text-body-2-medium shadow-none">
              <SelectItem id="yolo">YOLO</SelectItem>
              <SelectItem id="ask">Perguntar</SelectItem>
              <SelectItem id="deny">Negar</SelectItem>
            </Select>
          </>
        }
      />
      <AgentSessionsSheet open={sessionsOpen} project={project} activeSessionId={tab.sessionId} onClose={() => setSessionsOpen(false)} onSelect={selectSession} onNew={newSession} />
      <AiSettingsModal open={settingsOpen} initialTab={settingsTab} projectRoot={project.root} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
