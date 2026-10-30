import { useEffect, useMemo, useRef, useState } from "react";
import { OpenCode } from "@opencode/client";
import { ArrowUp, Bot, MessageSquarePlus, Settings2, SlidersHorizontal } from "@toph/icons";
import { api, openCodeBase, type AIMessage, type Project } from "../api";
import { useAI } from "../ai";
import { useBots, type BotMessage, type MiniBot } from "../bots";
import { notifyAiResponse } from "../aiNotifications";
import { playBotResponseSound, unlockBotSound } from "../botSound";
import BotAvatar from "../components/BotAvatar";
import BotConfig from "../components/BotConfig";
import AiSettingsModal from "../components/AiSettingsModal";
import AgentTranscript from "../components/AgentTranscript";
import OpenCodeFormCard, { type OpenCodeForm, type OpenCodeFormAnswer } from "../components/OpenCodeFormCard";
import type { AiMessage } from "../store";
import { Button } from "@/boardui/base/buttons/button";
import { Modal } from "@/boardui/base/modal/modal";
import { Textarea } from "@/boardui/base/textarea/textarea";
import { useIsMobile } from "../ui/useIsMobile";

interface Props {
  project: Project;
}

function splitModel(model: string): { providerID: string; id: string } | null {
  const index = model.indexOf("/");
  if (index <= 0 || index >= model.length - 1) return null;
  return { providerID: model.slice(0, index), id: model.slice(index + 1) };
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

interface AssistantState {
  id: string;
  text: string;
  error: string;
}

function lastAssistant(context: unknown): AssistantState | null {
  if (!Array.isArray(context)) return null;
  for (let index = context.length - 1; index >= 0; index -= 1) {
    const message = context[index] as Record<string, any>;
    if (message?.type !== "assistant") continue;
    const text = (message.content ?? [])
      .filter((part: Record<string, any>) => part?.type === "text" && part.text)
      .map((part: Record<string, any>) => String(part.text))
      .join("")
      .trim();
    const error = message.error?.message
      ? String(message.error.message)
      : message.finish === "error"
        ? "O modelo configurado não conseguiu responder."
        : "";
    return { id: String(message.id ?? ""), text, error };
  }
  return null;
}

function mentionedBots(bots: MiniBot[], text: string): MiniBot[] {
  const mentions = new Set(
    [...text.matchAll(/@([a-z0-9-]+)/gi)].map((match) => match[1].toLowerCase()),
  );
  return bots.filter((bot) => mentions.has(bot.handle.toLowerCase()));
}

function languageInstruction(bot: MiniBot): string {
  switch (bot.language) {
    case "pt": return "Responda sempre em português do Brasil.";
    case "en": return "Always answer in English.";
    case "es": return "Responde siempre en español.";
    default: return "Responda no idioma da última mensagem do usuário.";
  }
}

function botPrompt(bot: MiniBot, bots: MiniBot[], messages: BotMessage[], userText: string, company: string): string {
  const names = new Map(bots.map((item) => [item.id, item.name]));
  const history = messages
    .filter((message) => !message.pending && (message.role === "user" || message.role === "assistant"))
    .slice(-14)
    .map((message) => `${message.role === "user" ? "Usuário" : names.get(message.botId ?? "") ?? "Bot"}: ${message.content}`)
    .join("\n\n");
  return [
    `Você é ${bot.name}, ${bot.role || "especialista"} na empresa do projeto ${company}.`,
    bot.description ? `Sua função: ${bot.description}` : "",
    bot.personality ? `Sua personalidade: ${bot.personality}` : "",
    `Você faz parte de uma equipe de bots. Não finja ser outro bot.`,
    `Se precisar passar uma tarefa para outro bot, escreva @handle do bot na resposta.`,
    `Bots disponíveis: ${bots.map((item) => `@${item.handle} (${item.name})`).join(", ")}.`,
    languageInstruction(bot),
    history ? `Contexto recente do grupo:\n${history}` : "",
    userText ? `Mensagem atual do usuário:\n${userText}` : "",
    `Responda apenas como ${bot.name}, de forma útil e direta.`,
  ].filter(Boolean).join("\n\n");
}

type BotChatGroup =
  | { kind: "user"; message: BotMessage }
  | { kind: "bot"; botId: string; messages: BotMessage[] }
  | { kind: "system"; messages: BotMessage[] };

function groupBotMessages(messages: BotMessage[]): BotChatGroup[] {
  const groups: BotChatGroup[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      groups.push({ kind: "user", message });
      continue;
    }
    if (message.botId) {
      const last = groups[groups.length - 1];
      if (last?.kind === "bot" && last.botId === message.botId) {
        last.messages.push(message);
      } else {
        groups.push({ kind: "bot", botId: message.botId, messages: [message] });
      }
      continue;
    }
    const last = groups[groups.length - 1];
    if (last?.kind === "system") last.messages.push(message);
    else groups.push({ kind: "system", messages: [message] });
  }
  return groups;
}

function toAiMessage(message: BotMessage): AiMessage {
  return {
    id: message.id,
    role: message.role === "reasoning" ? "reasoning" : message.role === "tool" ? "tool" : message.role === "error" ? "error" : "assistant",
    text: message.content,
    title: message.title,
    detail: message.detail,
    status: message.status,
    permissionId: message.permissionId,
    permissionAction: message.permissionAction,
    createdAt: message.createdAt,
  };
}

export default function BotStudioTab({ project }: Props) {
  const workspace = useBots((state) => state.byProject[project.id]);
  const ensure = useBots((state) => state.ensure);
  const addBot = useBots((state) => state.addBot);
  const setActiveBot = useBots((state) => state.setActiveBot);
  const addMessage = useBots((state) => state.addMessage);
  const updateMessage = useBots((state) => state.updateMessage);
  const updateBot = useBots((state) => state.updateBot);
  const aiConfig = useAI((state) => state.config);
  const models = useAI((state) => state.models);
  const mobile = useIsMobile();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [runningBots, setRunningBots] = useState<Set<string>>(new Set());
  const [forms, setForms] = useState<Array<{ form: OpenCodeForm; botId: string }>>([]);
  const [formBusy, setFormBusy] = useState<string | null>(null);
  const sessionBotMap = useRef(new Map<string, string>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const client = useMemo(() => {
    const csrf = document.cookie.match(/(?:^|;\s*)toph_csrf=([^;]+)/)?.[1] ?? "";
    return OpenCode.make({
      baseUrl: openCodeBase(),
      headers: { "X-Toph-CSRF": csrf },
    });
  }, []);

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  const bots = workspace?.bots ?? [];
  const messages = workspace?.messages ?? [];
  const activeBot = bots.find((bot) => bot.id === workspace?.activeBotId) ?? bots[0] ?? null;

  useEffect(() => {
    if (!workspace) return;
    if (bots.length > 0 && !bots.some((bot) => bot.id === workspace.activeBotId)) {
      setActiveBot(project.id, bots[0].id);
    }
  }, [bots, project.id, setActiveBot, workspace]);

  useEffect(() => {
    const fallback = aiConfig?.model || models[0]?.id;
    if (!fallback) return;
    for (const bot of bots) {
      if (!bot.model) updateBot(project.id, bot.id, { model: fallback });
    }
  }, [aiConfig?.model, bots, models, project.id, updateBot]);

  useEffect(() => {
    const map = sessionBotMap.current;
    map.clear();
    for (const bot of bots) {
      if (bot.sessionId) map.set(bot.sessionId, bot.id);
    }
  }, [bots]);

  useEffect(() => {
    if (!stickToBottom.current) return;
    const frame = window.requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, sending, forms.length]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        for await (const event of client.event.subscribe({ signal: controller.signal })) {
          const data = (event as { data?: Record<string, unknown> }).data;
          if (!data) continue;
          if (event.type === "form.created") {
            const form = (data as { form?: OpenCodeForm }).form;
            const botId = form ? sessionBotMap.current.get(form.sessionID) : undefined;
            if (form && botId) {
              setForms((current) => current.some((item) => item.form.id === form.id) ? current : [...current, { form, botId }]);
            }
            continue;
          }
          const sessionId = String(data.sessionID ?? "");
          const botId = sessionBotMap.current.get(sessionId);
          if (!botId) continue;
          const state = useBots.getState();
          const bot = state.byProject[project.id]?.bots.find((item) => item.id === botId);
          if (!bot) continue;
          const assistantID = String(data.assistantMessageID ?? "");
          const messageID = (kind: string, id = assistantID) => `bot-${botId}-${kind}-${id || Date.now()}`;
          const ensure = (message: BotMessage) => {
            const list = useBots.getState().byProject[project.id]?.messages ?? [];
            if (!list.some((item) => item.id === message.id)) state.addMessage(project.id, message);
          };
          switch (event.type) {
            case "session.text.started":
              ensure({ id: messageID("assistant"), role: "assistant", botId, content: "", status: "running", createdAt: Date.now() });
              break;
            case "session.text.delta": {
              const id = messageID("assistant");
              ensure({ id, role: "assistant", botId, content: "", status: "running", createdAt: Date.now() });
              state.appendMessage(project.id, id, String(data.delta ?? ""));
              break;
            }
            case "session.text.ended":
              state.updateMessage(project.id, messageID("assistant"), { content: String(data.text ?? ""), status: "complete" });
              break;
            case "session.reasoning.started":
              ensure({ id: messageID("reasoning"), role: "reasoning", botId, title: "Thought", content: "", status: "running", createdAt: Date.now() });
              break;
            case "session.reasoning.delta": {
              const id = messageID("reasoning");
              ensure({ id, role: "reasoning", botId, title: "Thought", content: "", status: "running", createdAt: Date.now() });
              state.appendMessage(project.id, id, String(data.delta ?? ""));
              break;
            }
            case "session.reasoning.ended":
              state.updateMessage(project.id, messageID("reasoning"), { content: String(data.text ?? ""), status: "complete" });
              break;
            case "session.tool.input.started":
              ensure({ id: messageID("tool", String(data.id ?? "")), role: "tool", botId, title: `Tool · ${String(data.name ?? "call")}`, content: "", detail: "", status: "running", createdAt: Date.now() });
              break;
            case "session.tool.input.delta": {
              const id = messageID("tool", String(data.id ?? ""));
              ensure({ id, role: "tool", botId, title: "Tool", content: "", detail: "", status: "running", createdAt: Date.now() });
              state.appendMessage(project.id, id, String(data.delta ?? ""));
              break;
            }
            case "session.tool.input.ended":
              state.updateMessage(project.id, messageID("tool", String(data.id ?? "")), { content: String(data.text ?? ""), status: "running" });
              break;
            case "session.tool.called": {
              const id = messageID("tool", String(data.id ?? ""));
              ensure({ id, role: "tool", botId, title: "Tool", content: toolContent(data.input), detail: "", status: "running", createdAt: Date.now() });
              break;
            }
            case "session.tool.success":
              state.updateMessage(project.id, messageID("tool", String(data.id ?? "")), { detail: toolContent(data.content ?? data.metadata), status: "complete" });
              break;
            case "session.tool.failed":
              state.updateMessage(project.id, messageID("tool", String(data.id ?? "")), { detail: toolContent(data.error ?? data.content), status: "error" });
              break;
            case "form.replied":
            case "form.cancelled": {
              const formId = String(data.id ?? "");
              setForms((current) => current.filter((item) => item.form.id !== formId));
              break;
            }
            case "permission.asked":
              ensure({
                id: `bot-${botId}-permission-${String(data.id)}`,
                role: "tool",
                botId,
                title: "Permission",
                content: `Permission requested: ${String(data.action)} ${JSON.stringify(data.resources ?? [])}`,
                status: "running",
                permissionId: String(data.id),
                permissionAction: String(data.action ?? ""),
                sessionId,
                createdAt: Date.now(),
              });
              break;
            case "session.execution.started":
            case "session.status": {
              const status = event.type === "session.status" ? (data.status as { type?: string } | undefined)?.type : "busy";
              if (status === "busy") setRunningBots((current) => new Set(current).add(botId));
              if (status === "idle") setRunningBots((current) => { const next = new Set(current); next.delete(botId); return next; });
              break;
            }
            case "session.execution.succeeded":
            case "session.execution.failed":
            case "session.execution.interrupted":
            case "session.idle":
              setRunningBots((current) => { const next = new Set(current); next.delete(botId); return next; });
              break;
          }
        }
      } catch {
        // The final response fallback still works if the event stream is unavailable.
      }
    })();
    return () => controller.abort();
  }, [client, project.id]);

  function newBot() {
    const bot = addBot(project.id, {
      name: "Novo bot",
      role: "Especialista",
      description: "Descreva o papel deste bot.",
      personality: "Direto, útil e focado em resultado.",
      model: aiConfig?.model || models[0]?.id || "",
    });
    setActiveBot(project.id, bot.id);
    setConfigOpen(true);
  }

  function insertMention(bot: MiniBot) {
    setInput((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}@${bot.handle} `);
  }

  async function ensureSession(bot: MiniBot): Promise<string> {
    if (bot.sessionId) return bot.sessionId;
    const model = splitModel(bot.model || aiConfig?.model || models[0]?.id || "");
    const base = {
      title: `${bot.name} · ${project.name}`,
      location: { directory: project.root },
      agent: "build",
      metadata: { tophBotId: bot.id, tophBot: true },
      ...(model ? { model } : {}),
    };
    let session: { id: string };
    try {
      session = await client.session.create({
        ...base,
        permissions: [{ action: "*", resource: "*", effect: "allow" }],
      } as never) as { id: string };
    } catch {
      session = await client.session.create(base as never) as { id: string };
    }
    updateBot(project.id, bot.id, { sessionId: session.id });
    sessionBotMap.current.set(session.id, bot.id);
    if (model) {
      await client.session.switchModel({
        sessionID: session.id,
        model: { ...model, variant: bot.effort || undefined },
      } as never).catch(() => undefined);
    }
    return session.id;
  }

  async function openCodeReply(bot: MiniBot, prompt: string): Promise<string> {
    const sessionId = await ensureSession(bot);
    const model = splitModel(bot.model || aiConfig?.model || models[0]?.id || "");
    if (model) {
      await client.session.switchModel({
        sessionID: sessionId,
        model: { ...model, variant: bot.effort || undefined },
      } as never).catch(() => undefined);
    }
    const before = lastAssistant(await client.session.context({ sessionID: sessionId } as never).catch(() => null))?.id ?? "";
    await client.session.prompt({ sessionID: sessionId, text: prompt } as never);
    const deadline = Date.now() + 90_000;
    let latest = "";
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 800));
      const [active, context] = await Promise.all([
        client.session.active().catch(() => null),
        client.session.context({ sessionID: sessionId } as never).catch(() => null),
      ]);
      const assistant = lastAssistant(context);
      if (!assistant || assistant.id === before) continue;
      if (assistant.error) throw new Error(assistant.error);
      latest = assistant.text || latest;
      if (!active?.[sessionId]) {
        if (latest) return latest;
        throw new Error("O bot terminou sem retornar texto.");
      }
    }
    if (latest) return latest;
    throw new Error("O bot não respondeu a tempo.");
  }

  async function directReply(bot: MiniBot, botsInTeam: MiniBot[], history: BotMessage[], userText: string): Promise<string> {
    const messages: AIMessage[] = [
      { role: "system", content: botPrompt(bot, botsInTeam, [], "", project.name) },
      ...history
        .filter((message) => !message.pending && (message.role === "user" || message.role === "assistant"))
        .slice(-14)
        .map((message) => ({
          role: message.role === "user" ? "user" as const : "assistant" as const,
          content: `${message.role === "user" ? "Usuário" : botsInTeam.find((item) => item.id === message.botId)?.name ?? "Bot"}: ${message.content}`,
        })),
      { role: "user", content: userText },
    ];
    const result = await api.aiChat(messages, { model: bot.model || aiConfig?.model || models[0]?.id, yolo: true });
    return result.text;
  }

  async function respondAsBot(bot: MiniBot, userText: string): Promise<string | null> {
    const workspaceNow = useBots.getState().byProject[project.id];
    const history = workspaceNow?.messages ?? [];
    const startedAt = Date.now();
    setRunningBots((current) => new Set(current).add(bot.id));
    try {
      const prompt = botPrompt(bot, bots, history, userText, project.name);
      if (aiConfig?.provider === "opencode") {
        const reply = await openCodeReply(bot, prompt);
        const currentMessages = useBots.getState().byProject[project.id]?.messages ?? [];
        const hasEventReply = currentMessages.some((message) =>
          message.botId === bot.id
          && message.role === "assistant"
          && message.createdAt >= startedAt
          && message.content.trim(),
        );
        if (!hasEventReply) {
          addMessage(project.id, {
            id: `bot-reply-${bot.id}-${Date.now()}`,
            role: "assistant",
            botId: bot.id,
            content: reply.trim(),
            status: "complete",
            createdAt: Date.now(),
          });
        }
        if (bot.notifications) {
          playBotResponseSound();
          notifyAiResponse({
            projectId: project.id,
            tabId: `bots:${project.id}`,
            sessionId: bot.sessionId,
            text: reply,
          });
        }
        return reply.trim();
      }

      const pendingId = `bot-reply-${bot.id}-${Date.now()}`;
      addMessage(project.id, {
        id: pendingId,
        role: "assistant",
        botId: bot.id,
        content: "",
        pending: true,
        status: "running",
        createdAt: Date.now(),
      });
      const reply = await directReply(bot, bots, history, userText);
      if (!reply.trim()) throw new Error("O bot retornou uma resposta vazia.");
      updateMessage(project.id, pendingId, { content: reply.trim(), pending: false, status: "complete" });
      if (bot.notifications) {
        playBotResponseSound();
        notifyAiResponse({
          projectId: project.id,
          tabId: `bots:${project.id}`,
          sessionId: bot.sessionId,
          text: reply,
        });
      }
      return reply.trim();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Não foi possível falar com este bot.";
      addMessage(project.id, {
        id: `bot-error-${bot.id}-${Date.now()}`,
        role: "error",
        botId: bot.id,
        content: text,
        createdAt: Date.now(),
      });
      return null;
    } finally {
      setRunningBots((current) => {
        const next = new Set(current);
        next.delete(bot.id);
        return next;
      });
    }
  }

  async function replyPermission(bot: MiniBot, messageId: string, requestId: string, decision: "once" | "always" | "reject") {
    if (!bot.sessionId) return;
    try {
      await client.permission.reply({ sessionID: bot.sessionId, requestID: requestId, decision } as never);
      updateMessage(project.id, messageId, {
        permissionId: undefined,
        content: decision === "reject" ? "Permission rejected." : decision === "always" ? "Permission allowed for this session." : "Permission allowed once.",
        status: "complete",
      });
    } catch {
      // The request may have been answered by another client.
    }
  }

  async function answerForm(form: OpenCodeForm, bot: MiniBot, answer: OpenCodeFormAnswer) {
    if (!bot.sessionId) return;
    setFormBusy(form.id);
    try {
      await client.session.form.reply({ sessionID: bot.sessionId, formID: form.id, answer } as never);
      setForms((current) => current.filter((item) => item.form.id !== form.id));
    } finally {
      setFormBusy(null);
    }
  }

  async function cancelForm(form: OpenCodeForm, bot: MiniBot) {
    if (!bot.sessionId) return;
    setFormBusy(form.id);
    try {
      await client.session.form.cancel({ sessionID: bot.sessionId, formID: form.id, message: "Cancelado pelo usuário" } as never);
      setForms((current) => current.filter((item) => item.form.id !== form.id));
    } finally {
      setFormBusy(null);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || bots.length === 0) return;
    unlockBotSound();
    setInput("");
    stickToBottom.current = true;
    addMessage(project.id, {
      id: `bot-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      content: text,
      createdAt: Date.now(),
    });
    setSending(true);
    try {
      const direct = mentionedBots(bots, text);
      const coordinator = bots.find((bot) => bot.coordinator) ?? bots[0];
      const firstWave = direct.length > 0 ? direct : coordinator ? [coordinator] : [];
      let coordinatorReply: string | null = null;
      for (const bot of firstWave) {
        const reply = await respondAsBot(bot, text);
        if (bot.id === coordinator?.id) coordinatorReply = reply;
      }
      if (direct.length === 0 && coordinatorReply) {
        const followUp = mentionedBots(bots, coordinatorReply).filter((bot) => bot.id !== coordinator?.id);
        for (const bot of followUp) await respondAsBot(bot, text);
      }
    } finally {
      setSending(false);
    }
  }

  if (!activeBot) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <BotAvatar bot={{ name: "Bots", color: "#FFB547", avatar: "shield" }} size={56} />
          <strong className="text-title-3-medium text-text-primary">Monte sua equipe de bots</strong>
          <p className="max-w-sm text-caption-1-regular text-text-secondary">Crie bots com funções, modelos e personalidades diferentes para trabalharem juntos neste projeto.</p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" leadingIcon={MessageSquarePlus} onClick={newBot}>Criar primeiro bot</Button>
            <Button variant="ghost" leadingIcon={SlidersHorizontal} onClick={() => setSettingsOpen(true)}>Configurações de IA</Button>
          </div>
        </div>
        <AiSettingsModal open={settingsOpen} projectRoot={project.root} onClose={() => setSettingsOpen(false)} />
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 gap-3" onPointerDown={unlockBotSound}>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
          <Bot size={15} className="text-accent-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-medium text-text-primary">Equipe do projeto</p>
            <p className="truncate text-caption-2-regular text-text-secondary">{bots.length} {bots.length === 1 ? "bot" : "bots"} · {bots.filter((bot) => bot.coordinator).map((bot) => bot.name).join(", ") || "sem coordenador"}</p>
          </div>
          <Button variant="ghost" size="xs" iconOnly leadingIcon={Settings2} aria-label="Configurar bot" title="Configurar bot" onClick={() => setConfigOpen(true)} className="lg:hidden" />
          <Button variant="ghost" size="xs" iconOnly leadingIcon={SlidersHorizontal} aria-label="Configurações de IA" title="Configurações de IA" onClick={() => setSettingsOpen(true)} />
          <Button variant="ghost" size="xs" iconOnly leadingIcon={MessageSquarePlus} aria-label="Novo bot" title="Novo bot" onClick={newBot} />
        </header>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={(event) => {
            const element = event.currentTarget;
            stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          }}
        >
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 p-4">
            {messages.length === 0 && (
              <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center">
                <div className="flex -space-x-2">
                  {bots.slice(0, 4).map((bot) => <BotAvatar key={bot.id} bot={bot} size={38} className="rounded-full bg-background-primary-default ring-2 ring-background-primary-default" />)}
                </div>
                <strong className="text-title-3-medium text-text-primary">Algumas mentes, uma conversa.</strong>
                <p className="max-w-md text-caption-1-regular leading-relaxed text-text-secondary">
                  {bots.map((bot) => bot.name).join(", ")} estão aqui. Envie uma mensagem para receber a perspectiva de cada um.
                </p>
              </div>
            )}

            {groupBotMessages(messages).map((group, index) => {
              if (group.kind === "user") {
                return (
                  <p key={`user-${group.message.id}`} className="ms-auto max-w-[88%] rounded-2xl border border-accent-500/20 bg-accent-500/10 px-3.5 py-2 text-[13.5px] leading-[1.5] whitespace-pre-wrap break-words text-text-primary">
                    {group.message.content}
                  </p>
                );
              }
              if (group.kind === "system") {
                return <AgentTranscript key={`system-${index}`} messages={group.messages.map(toAiMessage)} streaming={false} />;
              }
              const bot = bots.find((item) => item.id === group.botId);
              if (!bot) return null;
              return (
                <section key={`bot-${group.botId}-${index}`} className="flex flex-col gap-2">
                  <header className="flex items-center gap-2">
                    <BotAvatar bot={bot} size={28} />
                    <div className="flex min-w-0 items-baseline gap-2">
                      <strong className="truncate text-caption-1-semibold text-text-primary">{bot.name}</strong>
                      <span className="truncate text-caption-2-regular text-text-tertiary">{bot.role}</span>
                    </div>
                  </header>
                  <AgentTranscript
                    messages={group.messages.map(toAiMessage)}
                    streaming={runningBots.has(bot.id)}
                    onPermission={(messageId, permissionId, decision) => void replyPermission(bot, messageId, permissionId, decision)}
                  />
                </section>
              );
            })}

            {[...runningBots]
              .filter((botId) => !messages.some((message) => message.botId === botId && message.createdAt >= Date.now() - 120_000))
              .map((botId) => {
                const bot = bots.find((item) => item.id === botId);
                if (!bot) return null;
                return (
                  <section key={`pending-${botId}`} className="flex flex-col gap-2">
                    <header className="flex items-center gap-2">
                      <BotAvatar bot={bot} size={28} />
                      <div className="flex min-w-0 items-baseline gap-2">
                        <strong className="truncate text-caption-1-semibold text-text-primary">{bot.name}</strong>
                        <span className="truncate text-caption-2-regular text-text-tertiary">{bot.role}</span>
                      </div>
                    </header>
                    <AgentTranscript messages={[]} streaming onPermission={() => undefined} />
                  </section>
                );
              })}

            {forms.map(({ form, botId }) => {
              const bot = bots.find((item) => item.id === botId);
              if (!bot) return null;
              return (
                <section key={`form-${form.id}`} className="flex flex-col gap-2">
                  <header className="flex items-center gap-2">
                    <BotAvatar bot={bot} size={28} />
                    <strong className="truncate text-caption-1-semibold text-text-primary">{bot.name}</strong>
                  </header>
                  <OpenCodeFormCard
                    form={form}
                    busy={formBusy === form.id}
                    onSubmit={(answer) => void answerForm(form, bot, answer)}
                    onCancel={() => void cancelForm(form, bot)}
                  />
                </section>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 p-2">
          <form
            className="flex flex-col gap-2 rounded-[14px] border border-border-button-default bg-background-primary-default p-3 pb-2 shadow-xs"
            onSubmit={(event) => { event.preventDefault(); void send(); }}
            onKeyDownCapture={(event) => {
              if (event.key === "Enter" && !event.shiftKey && event.target instanceof HTMLTextAreaElement) {
                event.preventDefault();
                void send();
              }
            }}
          >
            <Textarea
              value={input}
              onChange={setInput}
              rows={1}
              autoResize
              maxRows={6}
              resize="none"
              aria-label="Mensagem para os bots"
              placeholder="Olá, o que vocês precisam hoje?"
              fieldClassName="flex min-h-[38px] items-start rounded-none bg-transparent p-0 ring-0 shadow-none"
              className="min-h-[38px] px-0 py-0 text-[13.5px] leading-[1.5]"
            />
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {bots.slice(0, 5).map((bot) => (
                  <button key={bot.id} type="button" onClick={() => insertMention(bot)} className="rounded-md px-1.5 py-1 text-caption-2-medium text-text-tertiary hover:bg-background-secondary-hover hover:text-text-primary">
                    @{bot.handle}
                  </button>
                ))}
              </div>
              <Button type="submit" size="small" iconOnly leadingIcon={ArrowUp} disabled={!input.trim() || sending || bots.length === 0} aria-label="Enviar" className="size-8 shrink-0 rounded-lg" />
            </div>
          </form>
        </div>
      </section>

      <aside className="hidden w-[300px] shrink-0 flex-col overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar lg:flex">
        {activeBot && <BotConfig projectId={project.id} bot={activeBot} />}
      </aside>

      <Modal isOpen={configOpen && mobile} onClose={() => setConfigOpen(false)} title={activeBot.name} description="Configure o bot da equipe." placement="bottom" size="lg" bodyClassName="p-0">
        {activeBot && <BotConfig projectId={project.id} bot={activeBot} />}
      </Modal>

      <AiSettingsModal open={settingsOpen} projectRoot={project.root} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
