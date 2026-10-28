import { useEffect, useMemo, useRef, useState } from "react";
import { OpenCode } from "@opencode/client";
import { Bot, Check, ChevronDown, History, Wrench, X } from "@toph/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openCodeBase, type Project } from "../api";
import { useAI } from "../ai";
import { useApp, type AiMessage, type Tab } from "../store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AgentComposer, type AgentAttachment } from "../ui/AgentComposer";
import AgentSessionsSheet from "../components/AgentSessionsSheet";
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
  const [yolo, setYolo] = useState(true);
  const yoloRef = useRef(yolo);
  const [agents, setAgents] = useState<Array<{ id: string; name: string; mode: string }>>([]);
  const [agent, setAgent] = useState("build");
  useEffect(() => { yoloRef.current = yolo; }, [yolo]);
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
              addMessage(tab.id, {
                id: `permission-${String(data.id)}`,
                role: "tool",
                text: `Permission requested: ${String(data.action)} ${JSON.stringify(data.resources ?? [])}`,
                title: yoloRef.current ? "Permission auto-approved" : "Permission",
                createdAt: Date.now(),
                permissionId: yoloRef.current ? undefined : String(data.id),
                permissionAction: String(data.action ?? ""),
              });
              if (yoloRef.current) {
                void client.permission.reply({
                  sessionID: sessionId,
                  requestID: String(data.id),
                  decision: "always",
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

  const usageText = (() => {
    if (!usage) return null;
    const tokens = usage.tokens as { input?: number; output?: number; reasoning?: number } | undefined;
    const total = tokens ? (tokens.input ?? 0) + (tokens.output ?? 0) + (tokens.reasoning ?? 0) : 0;
    const tokenLabel = total > 999 ? `${(total / 1000).toFixed(1)}k` : String(total);
    return { tokenLabel, cost: typeof usage.cost === "number" ? usage.cost : undefined };
  })();

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-background">
      <div className="flex shrink-0 flex-col gap-2 border-b p-2">
        <div className="flex items-center gap-2">
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-start hover:bg-accent" onClick={() => setSessionsOpen(true)} aria-label="Abrir listagem de sessões">
            <History size={14} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 max-w-[60%] truncate text-sm font-medium">{tab.sessionId ? tab.title || `Sessão ${tab.sessionId.slice(0, 8)}` : "Nova sessão"}</span>
            <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
            <span className="flex-1" />
          </button>
          {onClose && <Button variant="ghost" size="icon-sm" aria-label="Fechar agente" onClick={onClose}><X size={15} /></Button>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={agent} onValueChange={(value) => void chooseAgent(value)}>
            <SelectTrigger size="sm" className="h-7 w-auto min-w-[96px] gap-1 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {agents.length === 0 && (
                <>
                  <SelectItem value="build">Build</SelectItem>
                  <SelectItem value="plan">Plano</SelectItem>
                </>
              )}
              {agents.map((item) => <SelectItem key={item.id} value={item.id}>{item.id === "plan" ? "Plano" : item.name || item.id}</SelectItem>)}
              {!agents.some((item) => item.id === "plan") && <SelectItem value="plan">Plano</SelectItem>}
            </SelectContent>
          </Select>
          <label className="flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] text-muted-foreground">
            YOLO
            <Switch checked={yolo} onCheckedChange={setYolo} className="scale-75" aria-label="YOLO" />
          </label>
          {usageText && (
            <Badge variant="secondary" className="h-7 gap-1 px-2 text-[10px] font-normal">
              {usageText.tokenLabel} tokens{usageText.cost !== undefined ? ` · $${usageText.cost.toFixed(4)}` : ""}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Bot size={26} /><p className="text-sm">Pergunte ao OpenCode sobre este projeto.</p>
            <span className="max-w-[320px] text-xs">A sessão roda no servidor e pode ler {project.root}.</span>
          </div>
        )}
        {messages.map((message) => {
          if (message.role === "reasoning") {
            return <details className="rounded-lg border bg-card px-3 py-2" key={message.id}><summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">{message.title ?? "Reasoning"}</summary><pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-muted-foreground">{message.text}</pre></details>;
          }
          if (message.role === "step") return <div className="px-1 text-[11px] text-muted-foreground" key={message.id}>{message.text}</div>;
          if (message.role === "tool") {
            return (
              <div className="rounded-lg border bg-card" key={message.id}>
                <div className="flex items-center gap-2 border-b px-3 py-1.5"><Wrench size={13} className="text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-[11px] font-medium">{message.title ?? "Tool"}</span>{message.status && <span className="text-[10px] text-muted-foreground">{message.status}</span>}</div>
                {message.text && <pre className="whitespace-pre-wrap break-words px-3 py-2 text-[11px]">{message.text}</pre>}
                {message.detail && <pre className="max-h-48 overflow-auto border-t px-3 py-2 text-[10px] text-muted-foreground">{message.detail}</pre>}
                {message.permissionId && <div className="flex flex-wrap gap-1.5 border-t p-2"><Button variant="outline" size="xs" onClick={() => void replyPermission(message.id, message.permissionId!, "once")}>Allow once</Button><Button variant="outline" size="xs" onClick={() => void replyPermission(message.id, message.permissionId!, "always")}><Check size={13} /> Always</Button><Button variant="destructive" size="xs" onClick={() => void replyPermission(message.id, message.permissionId!, "reject")}><X size={13} /> Reject</Button></div>}
              </div>
            );
          }
          const isUser = message.role === "user";
          return (
            <div className={`flex max-w-[92%] flex-col gap-1 rounded-xl px-3 py-2 ${isUser ? "ms-auto bg-primary/15" : message.role === "error" ? "border border-destructive/40 bg-destructive/10 text-destructive" : "bg-card"}`} key={message.id}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{isUser ? "Você" : message.role === "assistant" ? "OpenCode" : message.role === "subagent" ? `Subagent · ${message.title ?? ""}` : "Erro"}</div>
              {isUser || message.role === "assistant" || message.role === "subagent" ? <div className="prose prose-sm max-w-none text-xs prose-a:text-primary prose-code:text-foreground prose-pre:bg-background"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown></div> : <pre className="whitespace-pre-wrap break-words text-xs">{message.text}</pre>}
              {message.permissionId && <div className="mt-1 flex flex-wrap gap-1.5"><Button variant="outline" size="xs" onClick={() => void replyPermission(message.id, message.permissionId!, "once")}>Allow once</Button><Button variant="outline" size="xs" onClick={() => void replyPermission(message.id, message.permissionId!, "always")}><Check size={13} /> Always</Button><Button variant="destructive" size="xs" onClick={() => void replyPermission(message.id, message.permissionId!, "reject")}><X size={13} /> Reject</Button></div>}
            </div>
          );
        })}
        {streaming && <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><span className="size-2 animate-pulse rounded-full bg-primary" /> OpenCode está trabalhando...</div>}
        <div ref={bottomRef} />
      </div>
      {error && <div className="mx-2 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">{error}</div>}
      <AgentComposer value={input} onChange={setInput} onSend={(text, attachments) => void send(text, attachments)} onStop={() => void stop()} busy={streaming} models={models} model={model} onModelChange={(next) => void chooseModel(next)} effort={effort} efforts={efforts} onEffortChange={(next) => void chooseEffort(next)} placeholder="Pergunte ao OpenCode... (/ comandos, @ contexto, ! shell)" allowAttachments />
      <AgentSessionsSheet open={sessionsOpen} project={project} activeSessionId={tab.sessionId} onClose={() => setSessionsOpen(false)} onSelect={selectSession} onNew={newSession} />
    </div>
  );
}
