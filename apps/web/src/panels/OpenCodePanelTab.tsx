import { useEffect, useMemo, useRef, useState } from "react";
import { OpenCode } from "@opencode/client";
import { Bot, Check, ChevronDown, History, Settings2, Wrench, X } from "@toph/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openCodeBase, type Project } from "../api";
import { useAI } from "../ai";
import { useApp, type AiMessage, type Tab } from "../store";
import { Button } from "@/boardui/base/buttons/button";
import { Badge } from "@/boardui/base/badges/badge";
import { Chip } from "@/boardui/base/badges/chip";
import { Select, SelectItem } from "@/boardui/base/select/select";
import { AgentMessage } from "@/boardui/application/agent-chat/agent-chat-message";
import { AgentThinking } from "@/boardui/application/agent-thinking/agent-thinking";
import { AgentProgress } from "@/boardui/application/agent-progress/agent-progress";
import { AgentLimitsCard } from "@/boardui/application/agent-limits-card/agent-limits-card";
import { AgentComposer, type AgentAttachment } from "../ui/AgentComposer";
import AgentSessionsSheet from "../components/AgentSessionsSheet";
import AiSettingsModal, { type AiSettingsTab } from "../components/AiSettingsModal";
import type { OpenCodeSessionSummary } from "../opencodeSessions";
import { notifyAiResponse } from "../aiNotifications";

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const subagents = useRef(new Map<string, string>());
  const notifyPending = useRef(false);
  const client = useMemo(() => {
    const csrf = document.cookie.match(/(?:^|;\s*)toph_csrf=([^;]+)/)?.[1] ?? "";
    return OpenCode.make({
      baseUrl: openCodeBase(),
      headers: { "X-Toph-CSRF": csrf },
    });
  }, []);
  const loadedHistory = useRef<string | null>(null);
  const selectedModel = models.find((item) => item.id === model);
  const efforts = selectedModel?.variants ?? [];

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
    if (efforts.length === 0) return;
    if (!efforts.includes(effort)) {
      setEffort(efforts.includes("max") ? "max" : efforts[efforts.length - 1]);
    }
  }, [effort, efforts]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming]);

  useEffect(() => {
    if (!streaming) return;
    const timer = window.setTimeout(() => setStreaming(tab.id, false), 15 * 60_000);
    return () => window.clearTimeout(timer);
  }, [setStreaming, streaming, tab.id]);

  useEffect(() => {
    if (!tab.sessionId || messages.length > 0 || loadedHistory.current === tab.sessionId) return;
    const sessionId = tab.sessionId;
    loadedHistory.current = sessionId;
    (async () => {
      try {
        const context = await client.session.context({ sessionID: sessionId } as never);
        const restored: AiMessage[] = (context as Array<Record<string, any>>).flatMap<AiMessage>((message) => {
          if (message.type === "user") {
            return [{
              id: `history-user-${message.id}`,
              role: "user",
              text: String(message.text ?? ""),
              createdAt: Number(message.time?.created ?? Date.now()),
            }];
          }
          if (message.type === "assistant") {
            const parts = (message.content ?? []) as Array<Record<string, any>>;
            return parts.flatMap<AiMessage>((part) => {
              if (part.type === "text" && part.text) {
                return [{
                  id: `history-assistant-${message.id}-${part.ordinal ?? part.text}`,
                  role: "assistant",
                  text: String(part.text),
                  createdAt: Number(message.time?.created ?? Date.now()),
                }];
              }
              if (part.type === "reasoning" && part.text) {
                return [{
                  id: `history-reasoning-${message.id}-${part.ordinal ?? part.text}`,
                  role: "reasoning",
                  text: String(part.text),
                  createdAt: Number(message.time?.created ?? Date.now()),
                }];
              }
              if (part.type === "tool") {
                return [{
                  id: `history-tool-${message.id}-${part.id ?? part.name}`,
                  role: "tool",
                  title: `Tool · ${String(part.name ?? "call")}`,
                  text: toolContent(part.input),
                  detail: toolContent(part.content ?? part.output),
                  status: part.state === "error" ? "error" : "complete",
                  createdAt: Number(message.time?.created ?? Date.now()),
                }];
              }
              return [];
            });
          }
          return [];
        });
        if (restored.length > 0) setMessages(tab.id, restored);
      } catch {
        // A session may have been archived or the server may still be starting.
      }
    })();
  }, [client, messages.length, setMessages, tab.id, tab.sessionId]);

  useEffect(() => {
    if (!tab.sessionId) return;
    const sessionId = tab.sessionId;
    const controller = new AbortController();
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

          const sid = String(data.sessionID ?? "");
          if (!sid || (sid !== sessionId && !subagents.current.has(sid))) continue;
          const isSubagent = sid !== sessionId;
          const subagentTitle = isSubagent ? subagents.current.get(sid) ?? "subagent" : "";
          const prefix = isSubagent ? `sub-${sid.slice(0, 8)}-` : "";
          const assistantID = String(data.assistantMessageID ?? "");
          const messageID = (kind: string, id = assistantID) => `${prefix}${kind}-${id || Date.now()}`;

          switch (event.type) {
            case "session.text.started": {
              addMessage(tab.id, {
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
              const existing = useApp.getState().aiMessages[tab.id]?.some((message) => message.id === id);
              if (!existing) {
                addMessage(tab.id, {
                  id,
                  role: isSubagent ? "subagent" : "assistant",
                  title: subagentTitle,
                  text: "",
                  status: "running",
                  createdAt: Date.now(),
                });
              }
              appendText(tab.id, id, String(data.delta ?? ""));
              break;
            }
            case "session.text.ended": {
              updateMessage(tab.id, messageID("assistant"), { text: String(data.text ?? ""), status: "complete" });
              break;
            }
            case "session.reasoning.started": {
              addMessage(tab.id, {
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
              const existing = useApp.getState().aiMessages[tab.id]?.some((message) => message.id === id);
              if (!existing) {
                addMessage(tab.id, {
                  id,
                  role: "reasoning",
                  title: isSubagent ? `Reasoning · ${subagentTitle}` : "Reasoning",
                  text: "",
                  status: "running",
                  createdAt: Date.now(),
                });
              }
              appendText(tab.id, id, String(data.delta ?? ""));
              break;
            }
            case "session.reasoning.ended": {
              updateMessage(tab.id, messageID("reasoning"), { text: String(data.text ?? ""), status: "complete" });
              break;
            }
            case "session.tool.input.started": {
              addMessage(tab.id, {
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
              appendText(tab.id, id, String(data.delta ?? ""));
              break;
            }
            case "session.tool.input.ended": {
              updateMessage(tab.id, messageID("tool", String(data.id ?? "")), {
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
              addMessage(tab.id, {
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
        }
      }
    })();
    return () => controller.abort();
  }, [addMessage, appendText, client, project.id, setMessages, setStreaming, tab.id, tab.sessionId, updateMessage]);

  function selectSession(session: OpenCodeSessionSummary) {
    setMessages(tab.id, []);
    setStreaming(tab.id, false);
    loadedHistory.current = null;
    updateTab(tab.id, { sessionId: session.id, title: session.title ?? "OpenCode" });
    setSessionsOpen(false);
  }

  function newSession() {
    setMessages(tab.id, []);
    setStreaming(tab.id, false);
    loadedHistory.current = null;
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
    if ((!text && attachments.length === 0) || streaming) return;
    setInput("");
    setError("");
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

  async function stop() {
    if (!tab.sessionId) return;
    try {
      await client.session.interrupt({ sessionID: tab.sessionId } as never);
    } catch {
      // The turn may already be finished.
    }
    setStreaming(tab.id, false);
  }

  const progressSteps = messages
    .filter((message) => message.role === "tool" || message.role === "step")
    .slice(-5)
    .map((message) => ({
      id: message.id,
      label: message.title || message.text || "Etapa",
      status: message.status === "complete" ? "done" as const : message.status === "running" ? "running" as const : "pending" as const,
    }));

  const usageTokens = usage?.tokens as { input?: number; output?: number; reasoning?: number } | undefined;
  const usageBuckets = [
    { label: "Entrada", value: usageTokens?.input ?? 0, color: "var(--color-chart-6)" },
    { label: "Saída", value: usageTokens?.output ?? 0, color: "var(--color-chart-5)" },
    { label: "Raciocínio", value: usageTokens?.reasoning ?? 0, color: "var(--color-chart-3)" },
  ];
  const usageTotal = usageBuckets.reduce((total, bucket) => total + bucket.value, 0);

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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col gap-4 p-3">
          {messages.length === 0 && (
            <div className="bg-background-secondary-default my-auto mx-auto flex w-full max-w-sm flex-col items-center gap-2 rounded-lg border p-6 text-center">
              <span className="flex size-9 items-center justify-center rounded-full bg-background-tertiary-default text-foreground-icon-secondary"><Bot size={20} /></span>
              <strong className="text-body-medium text-text-primary">Pergunte ao OpenCode</strong>
              <p className="text-caption-1-regular text-text-secondary">A sessão roda no servidor e pode ler {project.root}.</p>
              <Button variant="secondary" size="small" leadingIcon={Settings2} onClick={() => openSettings("connections")}>Gerenciar conexões de IA</Button>
            </div>
          )}
          {messages.map((message) => {
            if (message.role === "reasoning") {
              return (
                <details key={message.id} className="group rounded-lg border border-border-button-default bg-background-secondary-default px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center gap-1 text-caption-1-medium text-text-secondary">
                    <ChevronDown size={13} className="transition-transform group-open:rotate-180" /> {message.title ?? "Reasoning"}
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-caption-1-regular text-text-secondary">{message.text}</pre>
                </details>
              );
            }
            if (message.role === "step") {
              return <div key={message.id} className="flex items-center gap-2 text-caption-1-regular text-text-secondary"><span className="h-px flex-1 bg-separator-border" /><span>{message.text}</span><span className="h-px flex-1 bg-separator-border" /></div>;
            }
            if (message.role === "tool") {
              return (
                <div key={message.id} className="flex flex-col overflow-hidden rounded-2lg border border-border-button-default bg-background-primary-default">
                  <div className="flex items-center gap-2 border-b border-separator-border px-3 py-2">
                    <Wrench size={14} className="text-foreground-icon-secondary" />
                    <strong className="min-w-0 flex-1 truncate text-caption-1-medium text-text-primary">{message.title ?? "Tool"}</strong>
                    {message.status && <Badge color="neutral" className="text-caption-2-regular">{message.status}</Badge>}
                  </div>
                  {message.text && <pre className="whitespace-pre-wrap break-words px-3 py-2 text-caption-1-regular">{message.text}</pre>}
                  {message.detail && <pre className="max-h-48 overflow-auto border-t border-separator-border px-3 py-2 text-caption-2-regular text-text-secondary">{message.detail}</pre>}
                  {message.permissionId && (
                    <div className="flex flex-wrap gap-1.5 border-t border-separator-border px-3 py-2">
                      <Button variant="secondary" size="xs" onClick={() => void replyPermission(message.id, message.permissionId!, "once")}>Allow once</Button>
                      <Button variant="secondary" size="xs" leadingIcon={Check} onClick={() => void replyPermission(message.id, message.permissionId!, "always")}>Always</Button>
                      <Button variant="danger" size="xs" leadingIcon={X} onClick={() => void replyPermission(message.id, message.permissionId!, "reject")}>Reject</Button>
                    </div>
                  )}
                </div>
              );
            }
            const isUser = message.role === "user";
            const isError = message.role === "error";
            if (isError) return <Chip key={message.id} color="rose" variant="subtle" className="justify-start whitespace-normal px-2 py-1.5">{message.text}</Chip>;
            return (
              <div key={message.id} className="flex flex-col gap-1">
                <span className="px-1 text-caption-2-regular text-text-tertiary">{isUser ? "Você" : message.role === "assistant" ? "OpenCode" : `Subagent · ${message.title ?? ""}`}</span>
                {isUser ? <AgentMessage role="user" text={message.text} at={message.createdAt} /> : <div className="prose prose-sm max-w-none rounded-2lg border border-border-button-default bg-background-primary-default p-3 text-body-regular text-text-primary prose-a:text-accent-500 prose-code:text-text-primary prose-pre:bg-background-primary-default"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown></div>}
                {message.permissionId && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="secondary" size="xs" onClick={() => void replyPermission(message.id, message.permissionId!, "once")}>Allow once</Button>
                    <Button variant="secondary" size="xs" leadingIcon={Check} onClick={() => void replyPermission(message.id, message.permissionId!, "always")}>Always</Button>
                    <Button variant="danger" size="xs" leadingIcon={X} onClick={() => void replyPermission(message.id, message.permissionId!, "reject")}>Reject</Button>
                  </div>
                )}
              </div>
            );
          })}
          {streaming && <AgentThinking variant="wave" label="Pensar" tone="accent" shimmer showTimer />}
          <div ref={bottomRef} />
        </div>
      </div>
      {streaming && progressSteps.length > 0 && <AgentProgress steps={progressSteps} className="mx-2 mb-2" />}
      {usageTotal > 0 && !streaming && <AgentLimitsCard total={usageTotal} buckets={usageBuckets} cost={typeof usage?.cost === "number" ? usage.cost : undefined} className="mx-2 mb-2" />}
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
        placeholder="Pergunte ao OpenCode..."
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
