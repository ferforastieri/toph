import { useEffect, useRef, useState } from "react";
import { Bot, X } from "@toph/icons";
import { api, type AIConfig } from "../api";
import { providerLabel, useAI } from "../ai";
import { useApp, type AiMessage, type Tab } from "../store";
import type { Project } from "../api";
import OpenCodePanelTab from "./OpenCodePanelTab";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Message, MessageContent, MessageGroup, MessageHeader } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Marker } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import { AgentComposer } from "../ui/AgentComposer";
import { notifyAiResponse } from "../aiNotifications";

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
  const [yolo, setYolo] = useState(true);

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
      notifyAiResponse({
        projectId: project.id,
        tabId: tab.id,
        sessionId: tab.sessionId,
        text: result.text,
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
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-background">
      <div className="flex shrink-0 flex-col gap-2 border-b p-2">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1.5"><Bot size={16} className="text-primary" /><strong className="truncate text-sm font-medium">{label}</strong></div>
          {onClose && <Button variant="ghost" size="icon-sm" aria-label="Fechar agente" onClick={onClose}><X size={15} /></Button>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{project.name}</span>
          <span className="flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] text-muted-foreground">YOLO <Switch checked={yolo} onCheckedChange={setYolo} className="scale-75" /></span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MessageGroup className="p-3">
          {messages.length === 0 && (
            <Empty className="border-0">
              <EmptyHeader><EmptyMedia variant="icon"><Bot size={20} /></EmptyMedia><EmptyTitle>Pergunte ao {label}</EmptyTitle><EmptyDescription>O agente pode ler {project.root} através do servidor.</EmptyDescription></EmptyHeader>
            </Empty>
          )}
          {messages.map((message) => {
            const isUser = message.role === "user";
            const isError = message.role === "error";
            return (
              <Message key={message.id} align={isUser ? "end" : "start"}>
                <MessageContent>
                  <MessageHeader>{isUser ? "Você" : isError ? "Erro" : label}</MessageHeader>
                  <Bubble align={isUser ? "end" : "start"} variant={isError ? "destructive" : isUser ? "default" : "muted"}>
                    <BubbleContent><pre className="whitespace-pre-wrap break-words font-sans text-sm">{message.text}</pre></BubbleContent>
                  </Bubble>
                </MessageContent>
              </Message>
            );
          })}
          {streaming && <Marker><Spinner /> Trabalhando...</Marker>}
          <div ref={bottomRef} />
        </MessageGroup>
      </div>
      {error && <div className="mx-2 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">{error}</div>}
      <AgentComposer value={input} onChange={setInput} onSend={(text) => void send(text)} busy={streaming} models={models} model={model} onModelChange={setModel} effort={effort} efforts={[]} onEffortChange={setEffort} placeholder={`Pergunte ao ${label} sobre este projeto...`} allowAttachments={false} />
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
