import { useEffect, useRef, useState } from "react";
import { Bot, Settings2, X } from "@toph/icons";
import { api, type AIConfig } from "../api";
import { providerLabel, useAI } from "../ai";
import { useApp, type AiMessage, type Tab } from "../store";
import type { Project } from "../api";
import OpenCodePanelTab from "./OpenCodePanelTab";
import { Button } from "@/boardui/base/buttons/button";
import { Switch } from "@/boardui/base/switch/switch";
import { AgentComposer } from "../ui/AgentComposer";
import { notifyAiResponse } from "../aiNotifications";
import AiSettingsModal from "../components/AiSettingsModal";
import AgentTranscript from "../components/AgentTranscript";

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
  const [model, setModel] = useState(config.model);
  const [effort, setEffort] = useState("");
  const [yolo, setYolo] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const handleContext = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path;
      if (path) setInput((current) => `${current}${current.trim() ? " " : ""}@${path} `);
    };
    window.addEventListener("toph:ai-context", handleContext);
    return () => window.removeEventListener("toph:ai-context", handleContext);
  }, []);
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
      notifyAiResponse({
        projectId: project.id,
        tabId: tab.id,
        sessionId: tab.sessionId,
        text: result.text,
      });
      if (!tab.sessionId) updateTab(tab.id, { sessionId: `ai-${Date.now()}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : `Could not reach ${label}.`;
      addMessage(tab.id, { id: `error-${Date.now()}`, role: "error", text: message, createdAt: Date.now() });
    } finally {
      setStreaming(tab.id, false);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="bg-background-secondary-default flex shrink-0 flex-col gap-2 border-b p-2">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1.5"><Bot size={16} className="text-accent-500" /><strong className="truncate text-body-medium text-text-primary">{label}</strong></div>
          <Button variant="ghost" size="xs" iconOnly leadingIcon={Settings2} aria-label="Configurações da IA" title="Configurações da IA" onClick={() => setSettingsOpen(true)} />
          {onClose && <Button variant="ghost" size="xs" iconOnly leadingIcon={X} aria-label="Fechar agente" onClick={onClose} />}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-caption-1-regular text-text-secondary">{project.name}</span>
          <span className="flex items-center gap-1.5 rounded-lg border border-border-button-default px-2 py-1 text-caption-1-regular text-text-secondary">YOLO <Switch isSelected={yolo} onChange={setYolo} size="sm" /></span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col gap-4 p-3">
          {messages.length === 0 && (
            <div className="bg-background-secondary-default my-auto mx-auto flex w-full max-w-sm flex-col items-center gap-2 rounded-lg border p-6 text-center">
              <span className="flex size-9 items-center justify-center rounded-full bg-background-tertiary-default text-foreground-icon-secondary"><Bot size={20} /></span>
              <strong className="text-body-medium text-text-primary">Pergunte ao {label}</strong>
              <p className="text-caption-1-regular text-text-secondary">O agente pode ler {project.root} através do servidor.</p>
            </div>
          )}
          <AgentTranscript messages={messages} streaming={streaming} />
          <div ref={bottomRef} />
        </div>
      </div>
      <AgentComposer value={input} onChange={setInput} onSend={(text) => void send(text)} busy={streaming} models={models} model={model} onModelChange={setModel} effort={effort} efforts={[]} onEffortChange={setEffort} placeholder={`Pergunte ao ${label}...`} allowAttachments={false} />
      <AiSettingsModal open={settingsOpen} projectRoot={project.root} showConnections={false} onClose={() => setSettingsOpen(false)} />
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
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{loading ? "Loading agent configuration..." : "AI is not configured. Open Settings → AI."}</div>;
  }
  if (config.provider === "opencode") return <OpenCodePanelTab tab={tab} project={project} onClose={onClose} />;
  return <GenericAiPanel tab={tab} project={project} config={config} onClose={onClose} />;
}
