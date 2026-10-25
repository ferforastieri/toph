import { useEffect, useRef, useState } from "react";
import { Bot, X } from "lucide-react";
import { api, type AIConfig } from "../api";
import { providerLabel, useAI } from "../ai";
import { useApp, type AiMessage, type Tab } from "../store";
import type { Project } from "../api";
import OpenCodePanelTab from "./OpenCodePanelTab";
import { Button } from "@toph/ui";
import { AgentComposer } from "../ui/AgentComposer";

const EMPTY_MESSAGES: AiMessage[] = [];

interface Props {
  tab: Tab;
  project: Project;
  onClose?: () => void;
}


function GenericAiPanel({ tab, project, config, onClose }: Props & { config: AIConfig }) {
  const updateTab = useApp((state) => state.updateTab);
  const addMessage = useApp((state) => state.addAiMessage);
  const setStreaming = useApp((state) => state.setAiStreaming);
  const emptyMessages = useApp((state) => state.aiMessages[tab.id]);
  const messages = emptyMessages ?? EMPTY_MESSAGES;
  const streaming = useApp((state) => state.aiStreaming[tab.id] ?? false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [model, setModel] = useState(config.model);
  const [effort, setEffort] = useState("");
  const [yolo, setYolo] = useState(false);
  const models = useAI((state) => state.models);
  const loadModels = useAI((state) => state.loadModels);
  const bottomRef = useRef<HTMLDivElement>(null);
  const label = providerLabel(config.provider);

  useEffect(() => {
    if (models.length === 0) void loadModels();
  }, [loadModels, models.length]);

  useEffect(() => {
    if (!model && config.model) setModel(config.model);
  }, [config.model, model]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming]);

  async function send(text: string) {
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
      const result = await api.aiChat(context, { model, effort, yolo });
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

  return (
    <div className="ai-tab opencode-tab">
      <div className="ai-toolbar">
        <div className="ai-title">
          <Bot size={16} />
          <strong>{label}</strong>
        </div>
        <span className="ai-session">{project.name}</span>
        {onClose && <Button className="icon-button" title="Close agent" onClick={onClose}><X size={15} /></Button>}
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
      <AgentComposer
        value={input}
        onChange={setInput}
        onSend={(text) => void send(text)}
        busy={streaming}
        models={models}
        model={model}
        onModelChange={setModel}
        effort={effort}
        efforts={[]}
        onEffortChange={setEffort}
        yolo={yolo}
        onYoloChange={setYolo}
        placeholder={`Pergunte ao ${label} sobre este projeto...`}
        allowAttachments={false}
      />
    </div>
  );
}

export default function AiPanelTab({ tab, project, onClose }: Props) {
  const config = useAI((state) => state.config);
  const load = useAI((state) => state.load);
  const loading = useAI((state) => state.loading);

  useEffect(() => {
    if (!config) void load();
  }, [config, load]);

  if (!config) {
    return <div className="editor-loading">{loading ? "Loading agent configuration..." : "AI is not configured. Open Settings → AI."}</div>;
  }
  if (config.provider === "opencode") return <OpenCodePanelTab tab={tab} project={project} onClose={onClose} />;
  return <GenericAiPanel tab={tab} project={project} config={config} onClose={onClose} />;
}
