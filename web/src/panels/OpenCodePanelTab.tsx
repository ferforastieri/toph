import { useEffect, useMemo, useRef, useState } from "react";
import { OpenCode } from "@opencode/client";
import { Bot, Check, Sparkles, X } from "lucide-react";
import { openCodeBase, type Project } from "../api";
import { useAI } from "../ai";
import { useApp, type AiMessage, type Tab } from "../store";
import { Button } from "../ui/Button";
import { AgentComposer, type AgentAttachment } from "../ui/AgentComposer";

const EMPTY_MESSAGES: AiMessage[] = [];

interface Props {
  tab: Tab;
  project: Project;
}

export default function OpenCodePanelTab({ tab, project }: Props) {
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
  const yoloRef = useRef(yolo);
  yoloRef.current = yolo;
  const bottomRef = useRef<HTMLDivElement>(null);
  const client = useMemo(() => OpenCode.make({ baseUrl: openCodeBase() }), []);
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
            const text = (message.content ?? [])
              .filter((part: Record<string, unknown>) => part.type === "text")
              .map((part: Record<string, unknown>) => String(part.text ?? ""))
              .join("\n");
            if (!text) return [];
            return [{
              id: `history-assistant-${message.id}`,
              role: "assistant",
              text,
              createdAt: Number(message.time?.created ?? Date.now()),
            }];
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
          if (!data || data.sessionID !== sessionId) continue;
          switch (event.type) {
            case "session.text.started": {
              const messageId = `assistant-${String(data.assistantMessageID)}`;
              addMessage(tab.id, {
                id: messageId,
                role: "assistant",
                text: "",
                createdAt: Date.now(),
              });
              break;
            }
            case "session.text.delta": {
              const messageId = `assistant-${String(data.assistantMessageID)}`;
              const existing = useApp
                .getState()
                .aiMessages[tab.id]?.some((message) => message.id === messageId);
              if (!existing) {
                addMessage(tab.id, {
                  id: messageId,
                  role: "assistant",
                  text: "",
                  createdAt: Date.now(),
                });
              }
              appendText(tab.id, messageId, String(data.delta ?? ""));
              break;
            }
            case "session.tool.called": {
              addMessage(tab.id, {
                id: `tool-${String(data.id)}-${Date.now()}`,
                role: "tool",
                text: JSON.stringify(data.input ?? {}, null, 2),
                title: "Tool call",
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
  }, [addMessage, appendText, client, setStreaming, tab.id, tab.sessionId]);

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
    <div className="ai-tab">
      <div className="ai-toolbar">
        <div className="ai-title">
          <Sparkles size={16} />
          <strong>OpenCode</strong>
          <span className="ai-project">{project.name}</span>
        </div>
        <span className="ai-session">
          {tab.sessionId ? `session ${tab.sessionId.slice(0, 8)}` : "new session"}
        </span>
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
        {messages.map((message) => (
          <div className={`ai-message ${message.role}`} key={message.id}>
            <div className="ai-message-role">
              {message.role === "user"
                ? "You"
                : message.role === "assistant"
                  ? "OpenCode"
                  : message.role === "tool"
                    ? message.title ?? "Tool"
                    : "Error"}
            </div>
            <pre>{message.text}</pre>
            {message.permissionId && (
              <div className="ai-permission-actions">
                <Button
                  className="ghost small"
                  onClick={() =>
                    void replyPermission(
                      message.id,
                      message.permissionId!,
                      "once",
                    )
                  }
                >
                  <Check size={13} /> Allow once
                </Button>
                <Button
                  className="ghost small"
                  onClick={() =>
                    void replyPermission(
                      message.id,
                      message.permissionId!,
                      "always",
                    )
                  }
                >
                  <Check size={13} /> Always
                </Button>
                <Button
                  className="ghost small danger"
                  onClick={() =>
                    void replyPermission(
                      message.id,
                      message.permissionId!,
                      "reject",
                    )
                  }
                >
                  <X size={13} /> Reject
                </Button>
              </div>
            )}
          </div>
        ))}
        {streaming && (
          <div className="ai-thinking">
            <span className="pulse" />
            Working...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div className="ai-error">{error}</div>}

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
      />
    </div>
  );
}
