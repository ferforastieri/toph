import { useEffect, useRef, useState } from "react";
import { Bot, CircleStop, Send } from "lucide-react";
import { api, type AIConfig } from "../api";
import { providerLabel, useAI } from "../ai";
import { useApp, type AiMessage, type Tab } from "../store";
import type { Project } from "../api";
import OpenCodePanelTab from "./OpenCodePanelTab";
import { useConfirm } from "../ui/Confirm";
import { Button } from "../ui/Button";

const EMPTY_MESSAGES: AiMessage[] = [];

interface Props {
  tab: Tab;
  project: Project;
}


function GenericAiPanel({ tab, project, config }: Props & { config: AIConfig }) {
  const updateTab = useApp((state) => state.updateTab);
  const addMessage = useApp((state) => state.addAiMessage);
  const setMessages = useApp((state) => state.setAiMessages);
  const setStreaming = useApp((state) => state.setAiStreaming);
  const emptyMessages = useApp((state) => state.aiMessages[tab.id]);
  const messages = emptyMessages ?? EMPTY_MESSAGES;
  const streaming = useApp((state) => state.aiStreaming[tab.id] ?? false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const label = providerLabel(config.provider);
  const confirm = useConfirm();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError("");
    const user = { id: `user-${Date.now()}`, role: "user" as const, text, createdAt: Date.now() };
    addMessage(tab.id, user);
    setStreaming(tab.id, true);
    try {
      const history = [...messages, user]
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({ role: message.role as "user" | "assistant", content: message.text }));
      const context = config.systemPrompt
        ? [{ role: "system" as const, content: config.systemPrompt }, ...history]
        : history;
      const result = await api.aiChat(context);
      addMessage(tab.id, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: result.text || "(empty response)",
        createdAt: Date.now(),
      });
      if (!tab.sessionId) updateTab(tab.id, { sessionId: `ai-${Date.now()}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : `Could not reach ${label}.`;
      setError(message);
      addMessage(tab.id, { id: `error-${Date.now()}`, role: "error", text: message, createdAt: Date.now() });
    } finally {
      setStreaming(tab.id, false);
    }
  }

  async function clear() {
    const ok = await confirm({
      title: "Clear conversation?",
      message: "All messages in this agent tab will be removed.",
      confirmLabel: "Clear",
      danger: true,
    });
    if (!ok) return;
    setMessages(tab.id, []);
    setError("");
  }

  return (
    <div className="ai-tab">
      <div className="ai-toolbar">
        <div className="ai-title">
          <Bot size={16} />
          <strong>{label}</strong>
          <span className="ai-project">{config.model || "default model"}</span>
        </div>
        <span className="ai-session">{project.name}</span>
      </div>
      <div className="ai-messages">
        {messages.length === 0 && (
          <div className="empty-hint">
            <Bot size={26} />
            <p>Ask {label} about this project.</p>
            <span className="muted">
              The agent is configured in Settings → AI and can read {project.root} through the server.
            </span>
          </div>
        )}
        {messages.map((message) => (
          <div className={`ai-message ${message.role}`} key={message.id}>
            <div className="ai-message-role">
              {message.role === "user" ? "You" : message.role === "assistant" ? label : "Error"}
            </div>
            <pre>{message.text}</pre>
          </div>
        ))}
        {streaming && <div className="ai-thinking"><span className="pulse" /> Working...</div>}
        <div ref={bottomRef} />
      </div>
      {error && <div className="ai-error">{error}</div>}
      <div className="ai-composer">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={`Ask ${label}... (Enter to send, Shift+Enter for newline)`}
          rows={3}
        />
        <div className="ai-composer-actions">
          {messages.length > 0 && <Button className="ghost small" onClick={() => void clear()}><CircleStop size={14} /> Clear</Button>}
          <Button className="primary small" onClick={() => void send()} disabled={!input.trim() || streaming}>
            <Send size={14} /> Send
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AiPanelTab({ tab, project }: Props) {
  const config = useAI((state) => state.config);
  const load = useAI((state) => state.load);
  const loading = useAI((state) => state.loading);

  useEffect(() => {
    if (!config) void load();
  }, [config, load]);

  if (!config) {
    return <div className="editor-loading">{loading ? "Loading agent configuration..." : "AI is not configured. Open Settings → AI."}</div>;
  }
  if (config.provider === "opencode") return <OpenCodePanelTab tab={tab} project={project} />;
  return <GenericAiPanel tab={tab} project={project} config={config} />;
}
