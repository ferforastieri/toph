import { useEffect, useMemo, useRef, useState } from "react";
import { OpenCode } from "@opencode/client";
import { Bot, Check, ChevronDown, Wrench, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openCodeBase, type Project } from "../api";
import { useAI } from "../ai";
import { useApp, type AiMessage, type Tab } from "../store";
import { Button } from "@toph/ui";
import { AgentComposer, type AgentAttachment } from "../ui/AgentComposer";

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
  const [yolo, setYolo] = useState(false);
  const [usage, setUsage] = useState<{ cost?: number; tokens?: unknown } | null>(null);
  const yoloRef = useRef(yolo);
  yoloRef.current = yolo;
  const bottomRef = useRef<HTMLDivElement>(null);
  const subagents = useRef(new Map<string, string>());
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
    if (!model && aiConfig?.model) setModel(aiConfig.model);
  }, [aiConfig?.model, model]);

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
            case "session.execution.failed": {
              addMessage(tab.id, {
                id: `error-${Date.now()}`,
                role: "error",
                text: "OpenCode could not complete this turn.",
                createdAt: Date.now(),
              });
              setStreaming(tab.id, false);
              break;
            }
            case "session.idle": {
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
  }, [addMessage, appendText, client, setMessages, setStreaming, tab.id, tab.sessionId, updateMessage]);

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
    } as never);
    updateTab(tab.id, { sessionId: session.id });
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

  return (
    <div className="ai-tab opencode-tab">
      <div className="ai-toolbar">
        <div className="ai-title">
          <Bot size={16} />
          <strong>OpenCode</strong>
          <span className="ai-project">{project.name}</span>
        </div>
        <span className="ai-session">
          {tab.sessionId ? `session ${tab.sessionId.slice(0, 8)}` : "new session"}
        </span>
        {onClose && <Button className="icon-button" title="Close agent" onClick={onClose}><X size={15} /></Button>}
      </div>

      <div className="ai-messages">
        {messages.length === 0 && (
          <div className="empty-hint">
            <Bot size={26} />
            <p>Ask OpenCode about this project.</p>
            <span className="muted">
              The session runs on the server and can read the project at {project.root}.
            </span>
          </div>
        )}
        {messages.map((message) => {
          if (message.role === "reasoning") {
            return (
              <details className="ai-reasoning" key={message.id}>
                <summary><ChevronDown size={12} /> {message.title ?? "Reasoning"}</summary>
                <pre>{message.text}</pre>
              </details>
            );
          }
          if (message.role === "step") {
            return <div className={`ai-step ${message.status ?? ""}`} key={message.id}>{message.text}</div>;
          }
          if (message.role === "tool") {
            return (
              <div className="ai-tool-card" key={message.id}>
                <div className="ai-tool-head">
                  <Wrench size={13} />
                  <span>{message.title ?? "Tool"}</span>
                  {message.status && <b className={message.status}>{message.status}</b>}
                </div>
                {message.text && <pre>{message.text}</pre>}
                {message.detail && <pre className="ai-tool-output">{message.detail}</pre>}
                {message.permissionId && (
                  <div className="ai-permission-actions">
                    <Button className="ghost small" onClick={() => void replyPermission(message.id, message.permissionId!, "once")}>Allow once</Button>
                    <Button className="ghost small" onClick={() => void replyPermission(message.id, message.permissionId!, "always")}><Check size={13} /> Always</Button>
                    <Button className="ghost small danger" onClick={() => void replyPermission(message.id, message.permissionId!, "reject")}><X size={13} /> Reject</Button>
                  </div>
                )}
              </div>
            );
          }
          return (
            <div className={`ai-message ${message.role}`} key={message.id}>
              <div className="ai-message-role">
                {message.role === "user" ? "You" : message.role === "assistant" ? "OpenCode" : message.role === "subagent" ? `Subagent · ${message.title ?? ""}` : "Error"}
              </div>
              {message.role === "user" || message.role === "assistant" || message.role === "subagent" ? (
                <div className="ai-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                </div>
              ) : <pre>{message.text}</pre>}
              {message.permissionId && (
                <div className="ai-permission-actions">
                  <Button className="ghost small" onClick={() => void replyPermission(message.id, message.permissionId!, "once")}>Allow once</Button>
                  <Button className="ghost small" onClick={() => void replyPermission(message.id, message.permissionId!, "always")}><Check size={13} /> Always</Button>
                  <Button className="ghost small danger" onClick={() => void replyPermission(message.id, message.permissionId!, "reject")}><X size={13} /> Reject</Button>
                </div>
              )}
            </div>
          );
        })}
        {streaming && <div className="ai-thinking"><span className="pulse" /> Working...</div>}
        <div ref={bottomRef} />
      </div>
      {error && <div className="ai-error">{error}</div>}
      {usage && (
        <div className="ai-usage">
          {usage.cost !== undefined && <span>${Number(usage.cost).toFixed(4)}</span>}
          {usage.tokens ? <span>{JSON.stringify(usage.tokens)}</span> : null}
        </div>
      )}
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
        yolo={yolo}
        onYoloChange={setYolo}
        placeholder="Pergunte ao OpenCode... (/ comandos, @ contexto, ! shell)"
        allowAttachments
      />
    </div>
  );
}
