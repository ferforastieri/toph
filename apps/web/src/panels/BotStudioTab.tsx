import { useEffect, useMemo, useRef, useState } from "react";
import { OpenCode } from "@opencode/client";
import { connectClientMcp, type ClientMcpTool } from "@opencode/client/mcp";
import { Bot, MessageSquarePlus, Settings2, SlidersHorizontal, UserRound } from "@toph/icons";
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
import { Badge } from "@/boardui/base/badges/badge";
import { Button } from "@/boardui/base/buttons/button";
import { Modal } from "@/boardui/base/modal/modal";
import { cx } from "@/boardui/utils/cx";
import { AgentComposer, type AgentAttachment } from "../ui/AgentComposer";
import { Select, SelectItem } from "@/boardui/base/select/select";

interface Props {
  project: Project;
  mobile?: boolean;
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

function botPrompt(bot: MiniBot, bots: MiniBot[], messages: BotMessage[], userText: string, company: string, mode: "solo" | "team" | "unset"): string {
  const names = new Map(bots.map((item) => [item.id, item.name]));
  const coordinator = bots.find((item) => item.coordinator) ?? bots[0];
  const history = messages
    .filter((message) => !message.pending && (message.role === "user" || message.role === "assistant"))
    .slice(-14)
    .map((message) => `${message.role === "user" ? "Usuário" : names.get(message.botId ?? "") ?? "Bot"}: ${message.content}`)
    .join("\n\n");
  const teamRules = mode === "solo"
    ? "Você é o único agente deste projeto. Não há coordenador nem outros membros para acionar."
    : bot.coordinator
      ? "Você é o coordenador principal. Só você pode distribuir tarefas para os membros. Receba os retornos, consolide e responda ao usuário."
      : `Você é membro da equipe coordenada por ${coordinator?.name ?? "o coordenador"}. Receba tarefas apenas do coordenador e devolva o resultado apenas a ele. Nunca fale com outros membros. O usuário pode abrir uma conversa direta com você; nessa conversa, responda diretamente ao usuário sem acionar a equipe.`;
  return [
    `Você é ${bot.name}, ${bot.role || "especialista"} na empresa do projeto ${company}.`,
    bot.description ? `Sua função: ${bot.description}` : "",
    bot.personality ? `Sua personalidade: ${bot.personality}` : "",
    teamRules,
    mode === "team" ? `Equipe: ${bots.map((item) => `@${item.handle} (${item.name}${item.coordinator ? ", coordenador" : ""})`).join(", ")}.` : "",
    `MCPs habilitados para você: ${bot.mcpServers?.length ? bot.mcpServers.join(", ") : "nenhum"}.`,
    bot.emailAccountIds?.length ? "Você tem ferramentas de email habilitadas. Use-as apenas para as contas autorizadas." : "Você não tem contas de email habilitadas.",
    languageInstruction(bot),
    history ? `Contexto recente:\n${history}` : "",
    userText ? `Mensagem atual:\n${userText}` : "",
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

export default function BotStudioTab({ project, mobile = false }: Props) {
  const workspace = useBots((state) => state.byProject[project.id]);
  const ensure = useBots((state) => state.ensure);
  const addBot = useBots((state) => state.addBot);
  const setActiveBot = useBots((state) => state.setActiveBot);
  const setMode = useBots((state) => state.setMode);
  const createSolo = useBots((state) => state.createSolo);
  const createTeam = useBots((state) => state.createTeam);
  const addMessage = useBots((state) => state.addMessage);
  const updateMessage = useBots((state) => state.updateMessage);
  const updateBot = useBots((state) => state.updateBot);
  const aiConfig = useAI((state) => state.config);
  const models = useAI((state) => state.models);
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

  useEffect(() => {
    if (aiConfig?.provider !== "opencode") return;
    const toolResult = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
    const allowedAccounts = (sessionID?: string) => {
      const botId = sessionID ? sessionBotMap.current.get(sessionID) : undefined;
      const bot = Object.values(useBots.getState().byProject).flatMap((item) => item.bots).find((item) => item.id === botId);
      return { bot, ids: bot?.emailAccountIds ?? [] };
    };
    const tools: ClientMcpTool[] = [
      {
        name: "list_accounts",
        description: "Lista as contas de email que este Toph pode usar.",
        handler: async (_args, ctx) => {
          const { ids } = allowedAccounts(ctx.sessionID);
          const accounts = await api.emailAccounts();
          return toolResult(accounts.filter((account) => ids.includes(account.id)).map(({ id, name, email }) => ({ id, name, email })));
        },
      },
      {
        name: "list_messages",
        description: "Lista os emails recentes de uma conta permitida.",
        inputSchema: { type: "object", properties: { accountId: { type: "string" }, limit: { type: "number" } }, required: ["accountId"] },
        handler: async (args, ctx) => {
          const { ids } = allowedAccounts(ctx.sessionID);
          const accountId = String(args.accountId ?? "");
          if (!ids.includes(accountId)) throw new Error("Esta conta de email não está liberada para este Toph.");
          return toolResult(await api.emailMessages(accountId, Number(args.limit) || 20));
        },
      },
      {
        name: "read_message",
        description: "Lê o conteúdo completo de um email.",
        inputSchema: { type: "object", properties: { accountId: { type: "string" }, uid: { type: "string" } }, required: ["accountId", "uid"] },
        handler: async (args, ctx) => {
          const { ids } = allowedAccounts(ctx.sessionID);
          const accountId = String(args.accountId ?? "");
          if (!ids.includes(accountId)) throw new Error("Esta conta de email não está liberada para este Toph.");
          return toolResult(await api.emailMessage(accountId, String(args.uid ?? "")));
        },
      },
      {
        name: "send_email",
        description: "Envia um email a partir de uma conta permitida.",
        inputSchema: { type: "object", properties: { accountId: { type: "string" }, to: { type: "string" }, subject: { type: "string" }, text: { type: "string" }, inReplyTo: { type: "string" } }, required: ["accountId", "to", "subject", "text"] },
        handler: async (args, ctx) => {
          const { ids } = allowedAccounts(ctx.sessionID);
          const accountId = String(args.accountId ?? "");
          if (!ids.includes(accountId)) throw new Error("Esta conta de email não está liberada para este Toph.");
          await api.sendEmail(accountId, { to: String(args.to ?? ""), subject: String(args.subject ?? ""), text: String(args.text ?? ""), inReplyTo: args.inReplyTo ? String(args.inReplyTo) : undefined });
          return toolResult({ ok: true });
        },
      },
      {
        name: "delete_message",
        description: "Move um email para a lixeira.",
        inputSchema: { type: "object", properties: { accountId: { type: "string" }, uid: { type: "string" } }, required: ["accountId", "uid"] },
        handler: async (args, ctx) => {
          const { ids } = allowedAccounts(ctx.sessionID);
          const accountId = String(args.accountId ?? "");
          if (!ids.includes(accountId)) throw new Error("Esta conta de email não está liberada para este Toph.");
          await api.deleteEmailMessage(accountId, String(args.uid ?? ""));
          return toolResult({ ok: true });
        },
      },
    ];
    const connection = connectClientMcp({
      url: new URL(openCodeBase(), window.location.origin).toString(),
      name: "toph_email",
      directory: project.root,
      tools,
    });
    return () => { void connection.close(); };
  }, [aiConfig?.provider, project.root, ensure, project.id]);

  const mode = workspace?.mode ?? "unset";
  const bots = workspace?.bots ?? [];
  const messages = workspace?.messages ?? [];
  const activeBot = bots.find((bot) => bot.id === workspace?.activeBotId) ?? bots[0] ?? null;
  const coordinator = bots.find((bot) => bot.coordinator) ?? bots[0] ?? null;
  const activeWorker = mode === "team" && activeBot && activeBot.id !== coordinator?.id ? activeBot : null;
  const displayMessages = mode === "solo"
    ? messages
    : activeWorker
      ? messages.filter((message) => message.channel === `worker:${activeWorker.id}` || (!message.channel && message.botId === activeWorker.id))
      : messages.filter((message) => !message.channel || message.channel === "team");
  const activeModel = activeBot?.model || aiConfig?.model || models[0]?.id || "";
  const activeEfforts = models.find((model) => model.id === activeModel)?.variants ?? [];

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
          const eventChannel = state.byProject[project.id]?.mode === "solo" || bot.coordinator ? "team" : `worker:${botId}`;
          const ensure = (message: BotMessage) => {
            const list = useBots.getState().byProject[project.id]?.messages ?? [];
            if (!list.some((item) => item.id === message.id)) state.addMessage(project.id, { ...message, channel: message.channel ?? eventChannel });
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


  async function ensureSession(bot: MiniBot): Promise<string> {
    if (bot.sessionId) return bot.sessionId;
    const model = splitModel(bot.model || aiConfig?.model || models[0]?.id || "");
    const base = {
      title: `${bot.name} · ${project.name}`,
      location: { directory: project.root },
      agent: bot.agentMode ?? "build",
      metadata: { tophBotId: bot.id, tophBot: true },
      ...(model ? { model } : {}),
    };
    let session: { id: string };
    try {
      session = await client.session.create({
        ...base,
        ...(bot.permissionMode === "deny"
          ? { permissions: [{ action: "*", resource: "*", effect: "deny" }] }
          : bot.permissionMode === "ask"
            ? {}
            : { permissions: [{ action: "*", resource: "*", effect: "allow" }] }),
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

  async function applyMcpSelection(bot: MiniBot) {
    if (!Array.isArray(bot.mcpServers)) return;
    const location = { directory: project.root };
    const result = await client.mcp.list({ location } as never).catch(() => null) as { data?: Array<{ name: string }> } | null;
    const servers = result?.data ?? [];
    for (const server of servers) {
      if (server.name === "toph_email") continue;
      const selected = bot.mcpServers.includes(server.name);
      if (selected) {
        await client.mcp.connect({ server: server.name, location } as never).catch(() => undefined);
      } else {
        await client.mcp.disconnect({ server: server.name, location } as never).catch(() => undefined);
      }
    }
  }

  async function openCodeReply(bot: MiniBot, prompt: string, attachments: AgentAttachment[] = []): Promise<string> {
    await applyMcpSelection(bot);
    const sessionId = await ensureSession(bot);
    const model = splitModel(bot.model || aiConfig?.model || models[0]?.id || "");
    if (model) {
      await client.session.switchModel({
        sessionID: sessionId,
        model: { ...model, variant: bot.effort || undefined },
      } as never).catch(() => undefined);
    }
    await client.session.switchAgent({ sessionID: sessionId, agent: bot.agentMode ?? "build" } as never).catch(() => undefined);
    const before = lastAssistant(await client.session.context({ sessionID: sessionId } as never).catch(() => null))?.id ?? "";
    await client.session.prompt({
      sessionID: sessionId,
      text: prompt,
      files: attachments.map((file) => ({ uri: file.uri, name: file.name, description: file.mime })),
    } as never);
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
      { role: "system", content: botPrompt(bot, botsInTeam, [], "", project.name, mode) },
      ...history
        .filter((message) => !message.pending && (message.role === "user" || message.role === "assistant"))
        .slice(-14)
        .map((message) => ({
          role: message.role === "user" ? "user" as const : "assistant" as const,
          content: `${message.role === "user" ? "Usuário" : botsInTeam.find((item) => item.id === message.botId)?.name ?? "Bot"}: ${message.content}`,
        })),
      { role: "user", content: userText },
    ];
    const result = await api.aiChat(messages, {
      model: bot.model || aiConfig?.model || models[0]?.id,
      effort: bot.effort || undefined,
      yolo: (bot.permissionMode ?? "yolo") === "yolo",
    });
    return result.text;
  }

  async function respondAsBot(bot: MiniBot, userText: string, options: { attachments?: AgentAttachment[]; audience?: "user" | "coordinator"; channel?: string } = {}): Promise<string | null> {
    const workspaceNow = useBots.getState().byProject[project.id];
    const allHistory = workspaceNow?.messages ?? [];
    const channel = options.channel ?? (bot.coordinator || mode === "solo" ? "team" : `worker:${bot.id}`);
    const history = bot.coordinator || mode === "solo"
      ? allHistory.filter((message) => !message.channel || message.channel === "team")
      : allHistory.filter((message) => message.channel === channel && (message.role === "user" || message.botId === bot.id));
    const startedAt = Date.now();
    setRunningBots((current) => new Set(current).add(bot.id));
    try {
      const prompt = botPrompt(bot, bots, history, userText, project.name, mode);
      if (aiConfig?.provider === "opencode") {
        const reply = await openCodeReply(bot, prompt, options.attachments);
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
            channel,
            audience: options.audience ?? "user",
            status: "complete",
            createdAt: Date.now(),
          });
        }
        if (bot.notifications && options.audience !== "coordinator") {
          playBotResponseSound();
          notifyAiResponse({
            projectId: project.id,
            tabId: `bots:${project.id}`,
            sessionId: bot.sessionId,
            botId: bot.id,
            botName: bot.name,
            botRole: bot.role,
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
        channel,
        audience: options.audience ?? "user",
        pending: true,
        status: "running",
        createdAt: Date.now(),
      });
      const reply = await directReply(bot, bots, history, userText);
      if (!reply.trim()) throw new Error("O bot retornou uma resposta vazia.");
      updateMessage(project.id, pendingId, { content: reply.trim(), pending: false, status: "complete" });
      if (bot.notifications && options.audience !== "coordinator") {
        playBotResponseSound();
        notifyAiResponse({
          projectId: project.id,
          tabId: `bots:${project.id}`,
          sessionId: bot.sessionId,
          botId: bot.id,
          botName: bot.name,
          botRole: bot.role,
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

  async function stop() {
    if (!activeBot?.sessionId) {
      setSending(false);
      return;
    }
    await client.session.interrupt({ sessionID: activeBot.sessionId } as never).catch(() => undefined);
    setRunningBots((current) => { const next = new Set(current); next.delete(activeBot.id); return next; });
  }

  async function send(text: string, attachments: AgentAttachment[] = []) {
    if ((!text.trim() && attachments.length === 0) || sending || bots.length === 0) return;
    unlockBotSound();
    setInput("");
    stickToBottom.current = true;
    const direct = mentionedBots(bots, text);
    const activeWorker = mode === "team" && activeBot && activeBot.id !== coordinator?.id ? activeBot : null;
    const directWorker = mode === "team" ? direct.find((bot) => !bot.coordinator) ?? null : null;
    const targetWorker = activeWorker ?? directWorker;
    const channel = targetWorker ? `worker:${targetWorker.id}` : "team";
    if (directWorker && directWorker.id !== activeBot?.id) setActiveBot(project.id, directWorker.id);
    addMessage(project.id, {
      id: `bot-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      content: text || attachments.map((file) => file.name).join(", "),
      channel,
      createdAt: Date.now(),
    });
    setSending(true);
    try {
      const firstWave = targetWorker
        ? [targetWorker]
        : direct.length > 0
          ? direct
          : coordinator
            ? [coordinator]
            : bots.slice(0, 1);
      let coordinatorReply: string | null = null;
      for (const bot of firstWave) {
        const reply = await respondAsBot(bot, text, { attachments, channel });
        if (bot.id === coordinator?.id) coordinatorReply = reply;
      }

      // The coordinator is the only Toph allowed to delegate. Workers never
      // receive tasks from other workers and never mention each other.
      if (mode === "team" && !direct.length && !activeWorker && !targetWorker && coordinator && coordinatorReply) {
        const workers = mentionedBots(bots, coordinatorReply).filter((bot) => bot.id !== coordinator.id);
        if (workers.length > 0) {
          const results: string[] = [];
          for (const worker of workers) {
            const reply = await respondAsBot(
              worker,
              `Tarefa do coordenador ${coordinator.name}:\n\n${coordinatorReply}\n\nPedido original do usuário:\n${text}`,
              { attachments, audience: "coordinator", channel: `worker:${worker.id}` },
            );
            if (reply) results.push(`${worker.name}: ${reply}`);
          }
          if (results.length > 0) {
            await respondAsBot(
              coordinator,
              `Retornos dos membros da equipe:\n\n${results.join("\n\n")}\n\nConsolide esses retornos em uma resposta final para o usuário.`,
              { audience: "user", channel: "team" },
            );
          }
        }
      }
    } finally {
      setSending(false);
    }
  }

  if (!activeBot) {
    return (
      <>
        <div className="no-scrollbar flex h-full flex-col gap-3 overflow-y-auto p-4">
          <div className="rounded-3xl border border-border-button-white bg-background-secondary-default p-4">
            <span className="text-caption-2-semibold uppercase tracking-[0.16em] text-text-tertiary">Tophs</span>
            <h2 className="mt-1 text-title-3-medium text-text-primary">Como você quer trabalhar?</h2>
            <p className="mt-1 text-caption-1-regular text-text-secondary">Escolha um modo para este projeto. Você pode trocar depois sem perder as conversas.</p>
          </div>

          <button
            type="button"
            onClick={() => createSolo(project.id)}
            className="group flex w-full items-center gap-3 rounded-3xl border border-border-button-white bg-background-primary-default p-4 text-start shadow-xs transition-colors hover:border-accent-500/40 hover:bg-accent-500/5"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-500"><UserRound className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <strong className="block text-body-medium text-text-primary">Toph Solo</strong>
              <span className="mt-0.5 block text-caption-1-regular text-text-secondary">Um agente para conversar, programar e executar tarefas.</span>
              <span className="mt-2 flex flex-wrap gap-1 text-caption-2-regular text-text-tertiary"><span className="rounded-full border border-border-button-default px-2 py-0.5">modelo</span><span className="rounded-full border border-border-button-default px-2 py-0.5">esforço</span><span className="rounded-full border border-border-button-default px-2 py-0.5">plano</span><span className="rounded-full border border-border-button-default px-2 py-0.5">YOLO</span><span className="rounded-full border border-border-button-default px-2 py-0.5">MCP</span></span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => createTeam(project.id)}
            className="group flex w-full items-center gap-3 rounded-3xl border border-border-button-white bg-background-primary-default p-4 text-start shadow-xs transition-colors hover:border-accent-500/40 hover:bg-accent-500/5"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400"><Bot className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <strong className="block text-body-medium text-text-primary">Equipe</strong>
              <span className="mt-0.5 block text-caption-1-regular text-text-secondary">Um coordenador e membros especialistas trabalhando juntos.</span>
              <span className="mt-2 flex flex-wrap gap-1 text-caption-2-regular text-text-tertiary"><span className="rounded-full border border-border-button-default px-2 py-0.5">coordenador</span><span className="rounded-full border border-border-button-default px-2 py-0.5">membros</span><span className="rounded-full border border-border-button-default px-2 py-0.5">funções</span><span className="rounded-full border border-border-button-default px-2 py-0.5">MCP + email</span></span>
            </span>
          </button>

          <Button variant="ghost" leadingIcon={SlidersHorizontal} onClick={() => setSettingsOpen(true)} className="w-full justify-start">Configurações de IA</Button>
        </div>
        <AiSettingsModal open={settingsOpen} projectRoot={project.root} onClose={() => setSettingsOpen(false)} />
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 gap-1" onPointerDown={unlockBotSound}>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background-primary-default max-[900px]:rounded-none max-[900px]:border-0 max-[900px]:shadow-none min-[901px]:rounded-3xl min-[901px]:border min-[901px]:border-border-button-white min-[901px]:shadow-sidebar">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-separator-border bg-background-secondary-default px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <Badge color={mode === "solo" ? "primary" : "neutral"}>{mode === "solo" ? "Solo" : "Equipe"}</Badge>
            <span className="truncate text-caption-2-regular text-text-tertiary">{mode === "solo" ? "Agente único" : "Coordenador + membros"}</span>
          </div>
          <Button variant="ghost" size="xs" onClick={() => setMode(project.id, mode === "solo" ? "team" : "solo")}>
            {mode === "solo" ? "Usar equipe" : "Usar solo"}
          </Button>
        </div>
        {mobile ? (
          <>
            <div className={cx("grid shrink-0 gap-2 border-b border-separator-border bg-background-secondary-default p-2", mode === "solo" ? "grid-cols-2" : "grid-cols-3")}>
              <Button variant="secondary" size="small" leadingIcon={Settings2} onClick={() => setConfigOpen(true)} className="h-14 w-full flex-col justify-center gap-1 rounded-2xl px-1">
                <span className="text-caption-2-medium">{mode === "solo" ? "Configurar Toph" : "Configurar"}</span>
              </Button>
              <Button variant="secondary" size="small" leadingIcon={SlidersHorizontal} onClick={() => setSettingsOpen(true)} className="h-14 w-full flex-col justify-center gap-1 rounded-2xl px-1">
                <span className="text-caption-2-medium">IA</span>
              </Button>
              {mode === "team" ? (
                <Button variant="secondary" size="small" leadingIcon={MessageSquarePlus} onClick={newBot} className="h-14 w-full flex-col justify-center gap-1 rounded-2xl px-1">
                  <span className="text-caption-2-medium">Novo Toph</span>
                </Button>
              ) : null}
            </div>
            {mode === "team" && bots.length > 0 ? (
              <div className="shrink-0 border-b border-separator-border px-3 py-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-caption-2-semibold uppercase tracking-[0.16em] text-text-tertiary">Equipe Toph</span>
                  <span className="text-caption-2-regular text-text-tertiary">{bots.length} {bots.length === 1 ? "agente" : "agentes"}</span>
                </div>
                <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                  {bots.map((bot) => {
                    const active = bot.id === activeBot?.id;
                    return (
                      <button
                        key={bot.id}
                        type="button"
                        onClick={() => setActiveBot(project.id, bot.id)}
                        className={cx(
                          "flex min-w-[124px] shrink-0 items-center gap-2 rounded-2xl border p-2 text-start transition-colors",
                          active ? "border-accent-500/40 bg-accent-500/10" : "border-border-button-white bg-background-primary-default hover:bg-background-primary-hover",
                        )}
                      >
                        <span className="relative shrink-0">
                          <BotAvatar bot={bot} size={34} />
                          <span className={cx("absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background-primary-default", runningBots.has(bot.id) ? "bg-emerald-400" : active ? "bg-accent-500" : "bg-text-tertiary/40")} />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <strong className="truncate text-caption-1-semibold text-text-primary">{bot.name}</strong>
                          <span className="truncate text-caption-2-regular text-text-tertiary">{bot.role || "Toph"}</span>
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={newBot}
                    className="flex min-w-[82px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border-button-default p-2 text-text-tertiary transition-colors hover:bg-background-primary-hover hover:text-text-primary"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full bg-background-secondary-default"><MessageSquarePlus className="size-4" /></span>
                    <span className="text-caption-2-medium">Novo</span>
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
        <header className="flex shrink-0 flex-col items-stretch gap-2 border-b p-3 min-[901px]:h-11 min-[901px]:flex-row min-[901px]:items-center min-[901px]:gap-2 min-[901px]:px-3 min-[901px]:py-0">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Bot size={15} className="text-accent-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-medium text-text-primary">{mode === "solo" ? "Toph Solo" : "Equipe do projeto"}</p>
              <p className="truncate text-caption-2-regular text-text-secondary">{mode === "solo" ? `${activeBot.name} · ${activeBot.role || "agente solo"}` : `${bots.length} ${bots.length === 1 ? "bot" : "bots"} · ${bots.filter((bot) => bot.coordinator).map((bot) => bot.name).join(", ") || "sem coordenador"}`}</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-1 min-[901px]:hidden">
            <Button variant="ghost" className="w-full justify-start" leadingIcon={Settings2} onClick={() => setConfigOpen(true)}>Configurar bot</Button>
            <Button variant="ghost" className="w-full justify-start" leadingIcon={SlidersHorizontal} onClick={() => setSettingsOpen(true)}>Configurações de IA</Button>
            <Button variant="ghost" className="w-full justify-start" leadingIcon={MessageSquarePlus} onClick={newBot}>Novo bot</Button>
          </div>
          <div className="hidden items-center gap-2 min-[901px]:flex">
            <Button variant="ghost" size="xs" iconOnly leadingIcon={Settings2} aria-label="Configurar bot" title="Configurar bot" onClick={() => setConfigOpen(true)} className="lg:hidden" />
            <Button variant="ghost" size="xs" iconOnly leadingIcon={SlidersHorizontal} aria-label="Configurações de IA" title="Configurações de IA" onClick={() => setSettingsOpen(true)} />
            {mode === "team" ? <Button variant="ghost" size="xs" iconOnly leadingIcon={MessageSquarePlus} aria-label="Novo bot" title="Novo bot" onClick={newBot} /> : null}
          </div>
        </header>
        )}

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={(event) => {
            const element = event.currentTarget;
            stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          }}
        >
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 p-4">
            {displayMessages.length === 0 && (
              <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center">
                <div className="flex -space-x-2">
                  {(activeWorker ? [activeWorker] : mode === "solo" && activeBot ? [activeBot] : bots.slice(0, 4)).map((bot) => <BotAvatar key={bot.id} bot={bot} size={38} className="rounded-full bg-background-primary-default ring-2 ring-background-primary-default" />)}
                </div>
                <strong className="text-title-3-medium text-text-primary">{mode === "solo" ? "Seu Toph está pronto." : activeWorker ? `Converse com ${activeWorker.name}.` : "Algumas mentes, uma conversa."}</strong>
                <p className="max-w-md text-caption-1-regular leading-relaxed text-text-secondary">
                  {mode === "solo"
                    ? "Pergunte, programe, anexe arquivos ou peça para executar uma tarefa."
                    : activeWorker
                      ? "Esta é uma conversa direta. O coordenador não participa desta thread."
                      : `${bots.map((bot) => bot.name).join(", ")} estão aqui. Fale com o coordenador ou abra a conversa de um membro.`}
                </p>
              </div>
            )}

            {groupBotMessages(displayMessages).map((group, index) => {
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
              .filter((botId) => (!activeWorker || botId === activeWorker.id) && (activeWorker || botId === coordinator?.id))
              .filter((botId) => !displayMessages.some((message) => message.botId === botId && message.createdAt >= Date.now() - 120_000))
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

        <div className="shrink-0">
          <AgentComposer
            value={input}
            onChange={setInput}
            onSend={(value, attachments) => void send(value, attachments)}
            onStop={() => void stop()}
            busy={sending || runningBots.size > 0}
            models={models}
            model={activeModel}
            onModelChange={(value) => updateBot(project.id, activeBot.id, { model: value })}
            effort={activeBot.effort ?? ""}
            efforts={activeEfforts}
            onEffortChange={(value) => updateBot(project.id, activeBot.id, { effort: value })}
            placeholder={mode === "solo" ? "Pergunte ao seu Toph..." : activeBot.id === coordinator?.id ? "Fale com o coordenador ou @mencione um membro..." : `Pergunte para ${activeBot.name}...`}
            modeControls={
              <>
                <Select
                  selectedKey={activeBot.agentMode ?? "build"}
                  onSelectionChange={(key) => updateBot(project.id, activeBot.id, { agentMode: String(key) as "build" | "plan" })}
                  aria-label="Modo do agente"
                  className="w-auto [&_button]:text-text-secondary"
                  triggerClassName="h-7 gap-1 border-0 bg-transparent px-1.5 text-body-2-medium text-text-secondary shadow-none"
                >
                  <SelectItem id="build">Build</SelectItem>
                  <SelectItem id="plan">Plano</SelectItem>
                </Select>
                <Select
                  selectedKey={activeBot.permissionMode ?? "yolo"}
                  onSelectionChange={(key) => updateBot(project.id, activeBot.id, { permissionMode: String(key) as "yolo" | "ask" | "deny" })}
                  aria-label="Permissões"
                  className="w-auto [&_button]:text-text-secondary"
                  triggerClassName="h-7 gap-1 border-0 bg-transparent px-1.5 text-body-2-medium text-text-secondary shadow-none"
                >
                  <SelectItem id="yolo">YOLO</SelectItem>
                  <SelectItem id="ask">Perguntar</SelectItem>
                  <SelectItem id="deny">Negar</SelectItem>
                </Select>
              </>
            }
          />
        </div>
      </section>

      <aside className="hidden w-[300px] shrink-0 flex-col overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar lg:flex">
        {activeBot && <BotConfig projectId={project.id} projectRoot={project.root} bot={activeBot} mode={mode} />}
      </aside>

      <Modal isOpen={configOpen} onClose={() => setConfigOpen(false)} title={activeBot.name} description={mode === "solo" ? "Configure seu Toph." : "Configure o membro da equipe."} placement="bottom" size="lg" bodyClassName="p-0" swipeToClose={mobile}>
        {activeBot && <BotConfig projectId={project.id} projectRoot={project.root} bot={activeBot} mode={mode} />}
      </Modal>

      <AiSettingsModal open={settingsOpen} projectRoot={project.root} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
