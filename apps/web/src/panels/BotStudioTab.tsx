import { useEffect, useMemo, useRef, useState } from "react";
import { OpenCode } from "@opencode/client";
import { connectClientMcp, type ClientMcpTool } from "@opencode/client/mcp";
import { Bot, ChevronDown, Copy, ListTree, LoaderCircle, MessageSquarePlus, Monitor, UserRound } from "@toph/icons";
import { api, ApiError, openCodeBase, type AIMessage, type AIMessageContentPart, type Project, type WorkspaceMessageCursor } from "../api";
import { modelDisplay, useAI } from "../ai";
import { TOPH_PRESETS, useBots, type BotMessage, type MiniBot } from "../bots";
import { notifyAiResponse } from "../aiNotifications";
import { playBotResponseSound, unlockBotSound } from "../botSound";
import BotAvatar from "../components/BotAvatar";
import BotConfig from "../components/BotConfig";
import AgentTranscript, { AgentImageGallery, agentImagesForMessages } from "../components/AgentTranscript";
import OpenCodeFormCard, { type OpenCodeForm, type OpenCodeFormAnswer } from "../components/OpenCodeFormCard";
import TophSessionsSheet from "../components/TophSessionsSheet";
import type { OpenCodeSessionSummary } from "../opencodeSessions";
import type { AiMessage } from "../store";
import { Button } from "@/boardui/base/buttons/button";
import { Modal } from "@/boardui/base/modal/modal";
import { cx } from "@/boardui/utils/cx";
import { useTophDrafts } from "../tophDrafts";
import { AgentComposer, type AgentAttachment } from "../ui/AgentComposer";
import { DropdownItem } from "@/boardui/base/dropdown/dropdown";
import ComposerMenu from "../ui/ComposerMenu";
import AiUsageMeter from "../ui/AiUsageMeter";
import ResizeHandle from "../ui/resize";
import { useSettings } from "../settings";
import { extractAgentFilePaths } from "../agentArtifacts";
import { answerOpenCodeQuestion } from "../opencodeQuestion";
import { recoverBotReply } from "../botReply";
import { restoredUserText } from "../botHistory";

interface Props {
  project: Project;
  mobile?: boolean;
}

const CONVERSATION_PAGE_SIZE = 30;
const ACTIVITY_PAGE_SIZE = 12;
const ASSISTANT_IMAGE_SCAN_LIMIT = 12;
const ASSISTANT_IMAGE_RENDER_LIMIT = 8;

interface HistoryPageState {
  cursor: WorkspaceMessageCursor | null;
  hasMore: boolean;
  loading: boolean;
  ready: boolean;
  error: string;
}

const EMPTY_HISTORY_PAGE: HistoryPageState = {
  cursor: null,
  hasMore: false,
  loading: false,
  ready: false,
  error: "",
};

function splitModel(model: string): { providerID: string; id: string } | null {
  const index = model.indexOf("/");
  if (index <= 0 || index >= model.length - 1) return null;
  return { providerID: model.slice(0, index), id: model.slice(index + 1) };
}

function formatMessageTime(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function MessageInfo({ agentMode, model, createdAt, content, copyLabel, align = "start" }: {
  agentMode?: "build" | "plan";
  model: string;
  createdAt: number;
  content: string;
  copyLabel: string;
  align?: "start" | "end";
}) {
  return (
    <div className={cx("flex items-center gap-1.5 px-1 text-[11px] text-text-tertiary", align === "end" && "justify-end")}>
      <span>{agentMode === "plan" ? "Plan" : "Build"}</span>
      <span>·</span>
      <span className="truncate">{model}</span>
      <span>·</span>
      <span className="shrink-0">{formatMessageTime(createdAt)}</span>
      <Button variant="ghost" size="xs" iconOnly leadingIcon={Copy} aria-label={copyLabel} title={copyLabel} className="size-5 text-text-tertiary" onClick={() => void navigator.clipboard.writeText(content).catch(() => undefined)} />
    </div>
  );
}

function toolContent(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const textOnly = value.every((part) => typeof part === "string" || (part && typeof part === "object" && (part as { type?: unknown }).type === "text"));
    if (!textOnly) return JSON.stringify(value, null, 2);
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

interface ToolFileSnapshot {
  path: string;
  before: Promise<{ exists: boolean; content: string | null }>;
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
      ? "Você é o coordenador do canal compartilhado. Distribua tarefas com @menções, acompanhe os retornos, peça revisão quando necessário e consolide a resposta final. O trabalho dos membros é visível no canal."
      : `Você é membro da equipe coordenada por ${coordinator?.name ?? "o coordenador"} e trabalha em um canal compartilhado. Responda ao usuário, colabore com os outros membros usando @menções, faça handoff e revise entregas quando fizer sentido. Não esconda seu trabalho dos outros.`;
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

function partTime(part: Record<string, any>, fallback: number, index: number): number {
  const time = part?.time ?? {};
  const value = Number(time.created ?? time.start ?? time.ran ?? time.completed);
  return Number.isFinite(value) && value > 0 ? value : fallback + index;
}

function partInput(part: Record<string, any>): unknown {
  return part?.state?.input ?? part?.input ?? part?.inputText ?? null;
}

function partOutput(part: Record<string, any>): unknown {
  return part?.state?.content ?? part?.content ?? part?.output ?? part?.state?.metadata ?? null;
}

function partStatus(part: Record<string, any>): "running" | "complete" | "error" {
  const status = part?.state?.status ?? part?.status;
  if (status === "error" || part?.state?.error) return "error";
  if (status === "running" || status === "pending") return "running";
  return "complete";
}

function restoreBotMessages(context: unknown, botId: string, channel: string, mode: "solo" | "team"): BotMessage[] {
  if (!Array.isArray(context)) return [];
  const restored: BotMessage[] = [];
  for (const raw of context as Array<Record<string, any>>) {
    const messageCreated = Number(raw.time?.created ?? Date.now());
    if (raw.type === "user") {
      const text = restoredUserText(String(raw.text ?? ""));
      if (!text) continue;
      restored.push({ id: `history-user-${raw.id}`, role: "user", content: text, channel, mode, createdAt: messageCreated });
      continue;
    }
    if (raw.type !== "assistant") continue;
    const parts = Array.isArray(raw.content) ? raw.content as Array<Record<string, any>> : [];
    let textRun = "";
    let textStartedAt = 0;
    const flushText = () => {
      if (!textRun.trim()) {
        textRun = "";
        return;
      }
      restored.push({
        id: `history-assistant-${raw.id}-${restored.length}`,
        role: "assistant",
        botId,
        content: textRun,
        channel,
        mode,
        status: "complete",
        createdAt: textStartedAt || messageCreated,
      });
      textRun = "";
    };
    parts.forEach((part, index) => {
      const createdAt = partTime(part, messageCreated, index);
      if (part.type === "text") {
        if (!textRun) textStartedAt = createdAt;
        textRun += String(part.text ?? "");
        return;
      }
      flushText();
      if (part.type === "reasoning") {
        const completed = Number(part.time?.completed ?? 0);
        const durationMs = completed > createdAt ? completed - createdAt : undefined;
        restored.push({
          id: `history-reasoning-${raw.id}-${index}`,
          role: "reasoning",
          botId,
          title: "Thought",
          content: String(part.text ?? ""),
          channel,
          mode,
          status: "complete",
          durationMs,
          createdAt,
        });
        return;
      }
      if (part.type !== "tool") return;
      restored.push({
        id: `history-tool-${raw.id}-${index}`,
        role: "tool",
        botId,
        title: `Tool · ${String(part.name ?? "call")}`,
        content: toolContent(partInput(part)),
        detail: toolContent(partOutput(part)),
        channel,
        mode,
        status: partStatus(part),
        createdAt,
      });
    });
    flushText();
  }
  return restored;
}

function visibleHistoryWindow(messages: BotMessage[]): BotMessage[] {
  const conversation = messages
    .filter((message) => message.role !== "tool" && message.role !== "reasoning")
    .slice(-CONVERSATION_PAGE_SIZE);
  const activity = messages
    .filter((message) => message.role === "tool" || message.role === "reasoning")
    .slice(-ACTIVITY_PAGE_SIZE);
  return [...conversation, ...activity].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
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
    durationMs: message.durationMs,
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
  const addMessage = useBots((state) => state.addMessage);
  const updateMessage = useBots((state) => state.updateMessage);
  const removeMessage = useBots((state) => state.removeMessage);
  const updateBot = useBots((state) => state.updateBot);
  const replaceChannelMessages = useBots((state) => state.replaceChannelMessages);
  const setBotSession = useBots((state) => state.setBotSession);
  const mergeMessages = useBots((state) => state.mergeMessages);
  const discardMessageWrites = useBots((state) => state.discardMessageWrites);
  const aiConfig = useAI((state) => state.config);
  const models = useAI((state) => state.models);
  const activityWidth = useSettings((state) => state.aiPanelWidth);
  const updateSettings = useSettings((state) => state.update);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const sendingRef = useRef(false);
  const runToken = useRef(0);
  const syncInFlight = useRef(false);
  const restoreToken = useRef(0);
  const [runningBots, setRunningBots] = useState<Set<string>>(new Set());
  const [forms, setForms] = useState<Array<{ form: OpenCodeForm; botId: string }>>([]);
  const [formBusy, setFormBusy] = useState<string | null>(null);
  const [conversationPage, setConversationPage] = useState<HistoryPageState>(EMPTY_HISTORY_PAGE);
  const [activityPage, setActivityPage] = useState<HistoryPageState>(EMPTY_HISTORY_PAGE);
  const [historyReloadToken, setHistoryReloadToken] = useState(0);
  const sessionBotMap = useRef(new Map<string, string>());
  const toolFileSnapshots = useRef(new Map<string, ToolFileSnapshot[]>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const activityScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const stickActivityToBottom = useRef(true);
  const client = useMemo(() => {
    const csrf = document.cookie.match(/(?:^|;\s*)toph_csrf=([^;]+)/)?.[1] ?? "";
    return OpenCode.make({
      baseUrl: openCodeBase(),
      headers: { "X-Toph-CSRF": csrf },
    });
  }, []);

  function relativeToolPath(value: string): string | null {
    let path = value.replace(/^file:\/\//i, "").replace(/\\/g, "/");
    const root = project.root.replace(/\\/g, "/").replace(/\/+$/, "");
    if (path.startsWith(`${root}/`)) path = path.slice(root.length + 1);
    else if (/^(?:[a-z]:\/|\/)/i.test(path)) return null;
    path = path.replace(/^\.\//, "");
    if (!path || path === ".." || path.startsWith("../")) return null;
    return path;
  }

  function readSnapshot(path: string): Promise<{ exists: boolean; content: string | null }> {
    return api.file(project.id, path)
      .then((file) => ({ exists: true, content: file.size <= 300_000 ? file.content : null }))
      .catch((error) => error instanceof ApiError && error.status === 404
        ? { exists: false, content: "" }
        : { exists: false, content: null });
  }

  function startToolFileSnapshot(sessionId: string, toolId: string, toolName: string, inputText: string) {
    const key = `${sessionId}:${toolId}`;
    if (toolFileSnapshots.current.has(key)) return;
    const paths = extractAgentFilePaths(toolName, inputText)
      .map(relativeToolPath)
      .filter((path): path is string => Boolean(path))
      .slice(0, 12);
    if (paths.length === 0) return;
    toolFileSnapshots.current.set(key, [...new Set(paths)].map((path) => ({ path, before: readSnapshot(path) })));
  }

  function finishToolFileSnapshot(sessionId: string, toolId: string, messageId: string, output: unknown) {
    const key = `${sessionId}:${toolId}`;
    const snapshots = toolFileSnapshots.current.get(key);
    toolFileSnapshots.current.delete(key);
    if (!snapshots?.length) return;
    void Promise.all(snapshots.map(async (snapshot) => {
      const [before, after] = await Promise.all([snapshot.before, readSnapshot(snapshot.path)]);
      if (before.content === null || after.content === null) return null;
      if (before.exists === after.exists && before.content === after.content) return null;
      return {
        path: snapshot.path,
        before: before.content,
        after: after.content,
        beforeExists: before.exists,
        afterExists: after.exists,
      };
    })).then((changes) => {
      const actual = changes.filter((change): change is NonNullable<typeof change> => Boolean(change));
      if (actual.length === 0) return;
      useBots.getState().updateMessage(project.id, messageId, {
        detail: JSON.stringify({ output, changes: actual }, null, 2),
        status: "complete",
      });
    });
  }

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
  const threadMode: "solo" | "team" = mode === "team" ? "team" : "solo";
  const bots = workspace?.bots ?? [];
  const messages = workspace?.messages ?? [];
  const activeBot = bots.find((bot) => bot.id === workspace?.activeBotId) ?? bots[0] ?? null;
  const coordinator = bots.find((bot) => bot.coordinator) ?? bots[0] ?? null;
  const activeWorker = mode === "team" && activeBot && activeBot.id !== coordinator?.id ? activeBot : null;
  const modeMessages = messages.filter((message) => message.mode === mode);
  const displayMessages = mode === "solo"
    ? modeMessages.filter((message) => !message.channel || message.channel === "solo")
    : activeWorker
      ? modeMessages.filter((message) => message.channel === `worker:${activeWorker.id}` || (!message.channel && message.botId === activeWorker.id))
      : modeMessages;
  const conversationMessages = mobile
    ? displayMessages
    : displayMessages.filter((message) => message.role !== "tool" && message.role !== "reasoning");
  const activityMessages = displayMessages.filter((message) => message.role === "tool" || message.role === "reasoning");
  const groupedMessages = groupBotMessages(conversationMessages);
  const activityGroups = groupBotMessages(activityMessages);
  const latestUserAt = [...conversationMessages].reverse().find((message) => message.role === "user")?.createdAt ?? 0;
  const lastBotGroupIndex = new Map<string, number>();
  groupedMessages.forEach((group, index) => {
    if (group.kind === "bot") lastBotGroupIndex.set(group.botId, index);
  });
  const lastActivityGroupIndex = new Map<string, number>();
  activityGroups.forEach((group, index) => {
    if (group.kind === "bot") lastActivityGroupIndex.set(group.botId, index);
  });
  const activeModel = activeBot?.model || aiConfig?.model || models[0]?.id || "";
  const activeEfforts = models.find((model) => model.id === activeModel)?.variants ?? [];
  const completedReplies = displayMessages.filter((message) => message.role === "assistant" && !message.pending && message.status !== "running").length;
  const visibleBotIds = new Set(
    mode === "solo"
      ? activeBot ? [activeBot.id] : []
      : activeWorker ? [activeWorker.id] : bots.map((bot) => bot.id),
  );
  const visibleRunningBots = [...runningBots].filter((botId) => visibleBotIds.has(botId));
  const visibleForms = forms.filter(({ botId }) => visibleBotIds.has(botId));
  const assistantImages = agentImagesForMessages(
    displayMessages.filter((message) => message.role === "assistant").slice(-ASSISTANT_IMAGE_SCAN_LIMIT).map(toAiMessage),
    project.id,
    project.root,
  ).slice(-ASSISTANT_IMAGE_RENDER_LIMIT);
  const historyChannel = threadMode === "solo" ? "solo" : activeWorker ? `worker:${activeWorker.id}` : undefined;
  const historyKey = `${project.id}:${threadMode}:${historyChannel ?? "all"}`;
  const draftKey = `${project.id}:${mode}:${activeBot?.id ?? "none"}:${activeBot?.sessionId ?? "new"}`;
  const savedDraft = useTophDrafts((state) => state.drafts[draftKey] ?? "");
  const setDraft = useTophDrafts((state) => state.setDraft);
  const clearDraft = useTophDrafts((state) => state.clearDraft);

  useEffect(() => {
    if (!workspace?.hydrated) return;
    let cancelled = false;
    setConversationPage({ ...EMPTY_HISTORY_PAGE, loading: true });
    setActivityPage({ ...EMPTY_HISTORY_PAGE, loading: true });
    const base = { mode: threadMode, channel: historyChannel };
    void Promise.all([
      api.workspaceMessages<BotMessage>(project.id, { ...base, scope: "conversation", limit: CONVERSATION_PAGE_SIZE }),
      api.workspaceMessages<BotMessage>(project.id, { ...base, scope: "activity", limit: ACTIVITY_PAGE_SIZE }),
    ]).then(([conversation, activity]) => {
      if (cancelled) return;
      mergeMessages(project.id, [...conversation.items, ...activity.items]);
      setConversationPage({ cursor: conversation.nextCursor, hasMore: conversation.hasMore, loading: false, ready: true, error: "" });
      setActivityPage({ cursor: activity.nextCursor, hasMore: activity.hasMore, loading: false, ready: true, error: "" });
    }).catch((error) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : "Não foi possível carregar o histórico.";
      setConversationPage({ ...EMPTY_HISTORY_PAGE, ready: true, error: message });
      setActivityPage({ ...EMPTY_HISTORY_PAGE, ready: true, error: message });
    });
    return () => { cancelled = true; };
  }, [historyKey, workspace?.hydrated, mergeMessages, project.id, historyReloadToken]);

  async function loadOlderHistory(scope: "conversation" | "activity") {
    const state = scope === "conversation" ? conversationPage : activityPage;
    const setState = scope === "conversation" ? setConversationPage : setActivityPage;
    if (state.loading || !state.hasMore || !state.cursor) return;
    const element = scope === "conversation" ? scrollRef.current : activityScrollRef.current;
    const previousHeight = element?.scrollHeight ?? 0;
    const previousTop = element?.scrollTop ?? 0;
    if (scope === "conversation") stickToBottom.current = false;
    else stickActivityToBottom.current = false;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const page = await api.workspaceMessages<BotMessage>(project.id, {
        mode: threadMode,
        channel: historyChannel,
        scope,
        before: state.cursor,
        limit: scope === "conversation" ? CONVERSATION_PAGE_SIZE : ACTIVITY_PAGE_SIZE,
      });
      mergeMessages(project.id, page.items);
      setState({ cursor: page.nextCursor, hasMore: page.hasMore, loading: false, ready: true, error: "" });
      window.requestAnimationFrame(() => {
        if (element) element.scrollTop = previousTop + Math.max(0, element.scrollHeight - previousHeight);
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Não foi possível carregar o histórico." }));
    }
  }

  useEffect(() => {
    if (!workspace || mode === "team" || bots.length > 0) return;
    createSolo(project.id);
  }, [workspace, mode, bots.length, createSolo, project.id]);

  useEffect(() => {
    const handler = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (action === "config") setConfigOpen(true);
      else if (action === "sessions") setSessionsOpen(true);
      else if (action === "new") newBot();
    };
    window.addEventListener("toph:tophs-action", handler);
    return () => window.removeEventListener("toph:tophs-action", handler);
  }, [project.id, mode, activeBot?.id]);

  useEffect(() => {
    setInput(savedDraft);
  }, [draftKey]);

  function updateInput(value: string) {
    setInput(value);
    setDraft(draftKey, value);
  }

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
    if (!stickActivityToBottom.current) return;
    const frame = window.requestAnimationFrame(() => {
      const element = activityScrollRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, runningBots.size, forms.length]);

  const sessionKey = bots.map((bot) => bot.sessionId ?? "").join("|");

  useEffect(() => {
    if (!sessionKey || sendingRef.current) return;
    void syncFromOpenCode();
  }, [project.id, sessionKey, activeBot?.id]);

  useEffect(() => {
    const refresh = () => {
      if (document.hidden) return;
      setConnectionEpoch((value) => value + 1);
      void syncFromOpenCode();
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [project.id]);

  useEffect(() => {
    if (runningBots.size === 0 || sendingRef.current) return;
    let cancelled = false;
    const check = async () => {
      if (cancelled || document.hidden) return;
      const active = await client.session.active().catch(() => null);
      if (!active || cancelled) return;
      // With no local polling loop (for example after the WebView was
      // recreated), refresh from the authoritative context while the turn is
      // running too. The final refresh runs as soon as the session is idle.
      await syncFromOpenCode();
    };
    const timer = window.setInterval(() => { void check(); }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [project.id, runningBots.size]);

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
          const eventChannel = state.byProject[project.id]?.mode === "solo" ? "solo" : bot.coordinator ? "team" : `worker:${botId}`;
          const ensure = (message: BotMessage) => {
            const list = useBots.getState().byProject[project.id]?.messages ?? [];
            if (!list.some((item) => item.id === message.id)) state.addMessage(project.id, { ...message, mode: state.byProject[project.id]?.mode === "solo" ? "solo" : "team", channel: message.channel ?? eventChannel });
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
            case "session.reasoning.ended": {
              const reasoningId = messageID("reasoning");
              const startedAt = state.byProject[project.id]?.messages.find((item) => item.id === reasoningId)?.createdAt;
              state.updateMessage(project.id, reasoningId, {
                content: String(data.text ?? ""),
                status: "complete",
                durationMs: startedAt ? Math.max(0, Date.now() - startedAt) : undefined,
              });
              break;
            }
            case "session.tool.input.started":
              ensure({ id: messageID("tool", String(data.id ?? "")), role: "tool", botId, title: `Tool · ${String(data.name ?? "call")}`, content: "", detail: "", status: "running", createdAt: Date.now() });
              break;
            case "session.tool.input.delta": {
              const id = messageID("tool", String(data.id ?? ""));
              ensure({ id, role: "tool", botId, title: "Tool", content: "", detail: "", status: "running", createdAt: Date.now() });
              state.appendMessage(project.id, id, String(data.delta ?? ""));
              break;
            }
            case "session.tool.input.ended": {
              const toolId = String(data.id ?? "");
              const id = messageID("tool", toolId);
              const inputText = String(data.text ?? "");
              state.updateMessage(project.id, id, { content: inputText, status: "running" });
              const title = state.byProject[project.id]?.messages.find((message) => message.id === id)?.title ?? "";
              startToolFileSnapshot(sessionId, toolId, title.replace(/^Tool\s*·\s*/i, ""), inputText);
              break;
            }
            case "session.tool.called": {
              const toolId = String(data.id ?? "");
              const id = messageID("tool", toolId);
              const existingTitle = state.byProject[project.id]?.messages.find((message) => message.id === id)?.title ?? "";
              const name = typeof data.name === "string" && data.name
                ? data.name
                : existingTitle.replace(/^Tool\s*·\s*/i, "") || "call";
              const inputText = toolContent(data.input);
              ensure({ id, role: "tool", botId, title: `Tool · ${name}`, content: inputText, detail: "", status: "running", createdAt: Date.now() });
              state.updateMessage(project.id, id, { title: `Tool · ${name}`, content: inputText, status: "running" });
              startToolFileSnapshot(sessionId, toolId, name, inputText);
              break;
            }
            case "session.tool.success": {
              const toolId = String(data.id ?? "");
              const id = messageID("tool", toolId);
              const output = data.content ?? data.metadata;
              state.updateMessage(project.id, id, { detail: toolContent(output), status: "complete" });
              finishToolFileSnapshot(sessionId, toolId, id, output);
              break;
            }
            case "session.tool.failed": {
              toolFileSnapshots.current.delete(`${sessionId}:${String(data.id ?? "")}`);
              state.updateMessage(project.id, messageID("tool", String(data.id ?? "")), { detail: toolContent(data.error ?? data.content), status: "error" });
              break;
            }
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
                mode: state.byProject[project.id]?.mode === "solo" ? "solo" : "team",
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
    return () => {
      controller.abort();
      toolFileSnapshots.current.clear();
    };
  }, [client, project.id, connectionEpoch]);

  function newBot() {
    const used = new Set(bots.map((bot) => bot.name));
    const teamPresets = TOPH_PRESETS.filter((item) => item.name !== "Toph");
    const preset = teamPresets.find((item) => !used.has(item.name))
      ?? teamPresets[Math.floor(Math.random() * teamPresets.length)];
    let name = preset.name;
    let suffix = 2;
    while (used.has(name)) {
      name = `${preset.name} ${suffix}`;
      suffix += 1;
    }
    const bot = addBot(project.id, {
      name,
      role: preset.role,
      description: preset.description,
      personality: preset.personality,
      color: preset.color,
      avatar: preset.avatar,
      model: aiConfig?.model || models[0]?.id || "",
      coordinator: bots.length === 0 || preset.coordinator === true,
    });
    setActiveBot(project.id, bot.id);
    setConfigOpen(true);
  }


  function storedBot(bot: MiniBot): MiniBot {
    return useBots.getState().byProject[project.id]?.bots.find((item) => item.id === bot.id) ?? bot;
  }

  async function ensureSession(bot: MiniBot): Promise<string> {
    const current = storedBot(bot);
    if (current.sessionId) return current.sessionId;
    const model = splitModel(current.model || aiConfig?.model || models[0]?.id || "");
    const base = {
      title: `${current.name} · ${project.name}`,
      location: { directory: project.root },
      agent: current.agentMode ?? "build",
      metadata: { tophBotId: current.id, tophBot: true },
      ...(model ? { model } : {}),
    };
    let session: { id: string };
    try {
      session = await client.session.create({
        ...base,
        ...(current.permissionMode === "deny"
          ? { permissions: [{ action: "*", resource: "*", effect: "deny" }] }
          : current.permissionMode === "ask"
            ? {}
            : { permissions: [{ action: "*", resource: "*", effect: "allow" }] }),
      } as never) as { id: string };
    } catch {
      session = await client.session.create(base as never) as { id: string };
    }
    updateBot(project.id, current.id, { sessionId: session.id, sessionPrimed: false });
    sessionBotMap.current.set(session.id, current.id);
    if (model) {
      await client.session.switchModel({
        sessionID: session.id,
        model: { ...model, variant: current.effort || undefined },
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

  async function openCodeReply(bot: MiniBot, userText: string, attachments: AgentAttachment[] = [], token = runToken.current): Promise<string> {
    const current = storedBot(bot);
    await applyMcpSelection(current);
    const sessionId = await ensureSession(current);
    const model = splitModel(current.model || aiConfig?.model || models[0]?.id || "");
    if (model) {
      await client.session.switchModel({
        sessionID: sessionId,
        model: { ...model, variant: current.effort || undefined },
      } as never).catch(() => undefined);
    }
    await client.session.switchAgent({ sessionID: sessionId, agent: current.agentMode ?? "build" } as never).catch(() => undefined);
    if (token !== runToken.current) throw new Error("__stopped__");
    const context = await client.session.context({ sessionID: sessionId } as never).catch(() => null);
    const contextMessages = Array.isArray(context) ? context as Array<Record<string, any>> : [];
    const hasHistory = contextMessages.some((message) => message?.type === "user" || message?.type === "assistant") || (!Array.isArray(context) && Boolean(current.sessionPrimed));
    const prompt = hasHistory
      ? userText
      : botPrompt(current, bots, [], userText, project.name, mode);
    const before = lastAssistant(context)?.id ?? "";
    await client.session.prompt({
      sessionID: sessionId,
      text: prompt,
      files: attachments.map((file) => ({ uri: file.uri, name: file.name, description: file.mime })),
    } as never);
    const deadline = Date.now() + 90_000;
    let latest = "";
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      if (token !== runToken.current) throw new Error("__stopped__");
      const active = await client.session.active().catch(() => null);
      // While OpenCode is working, the event stream updates the transcript.
      // Fetching the full session context on every poll duplicates every
      // message and image in memory, so read it only after the session idles.
      if (!active || active[sessionId]) continue;
      const context = await client.session.context({ sessionID: sessionId } as never).catch(() => null);
      const assistant = lastAssistant(context);
      if (!assistant || assistant.id === before) continue;
      latest = assistant.text || latest;
      if (latest) return latest;
      if (assistant.error) throw new Error(assistant.error);
    }
    if (latest) return latest;
    throw new Error("O bot não respondeu a tempo.");
  }

  async function directReply(bot: MiniBot, botsInTeam: MiniBot[], history: BotMessage[], userText: string, attachments: AgentAttachment[] = []): Promise<string> {
    let currentContent: AIMessage["content"] = userText;
    if (["openai", "codex", "custom"].includes(aiConfig?.provider ?? "") && attachments.length > 0) {
      const parts: AIMessageContentPart[] = [{ type: "text", text: userText || "Analise os anexos enviados." }];
      for (const attachment of attachments) {
        if (attachment.mime.startsWith("image/")) {
          parts.push({ type: "image_url", image_url: { url: attachment.uri } });
          continue;
        }
        if (attachment.mime === "audio/wav" || attachment.mime === "audio/mpeg" || attachment.mime === "audio/mp3") {
          const data = attachment.uri.split(",", 2)[1] ?? "";
          if (data) parts.push({ type: "input_audio", input_audio: { data, format: attachment.mime === "audio/wav" ? "wav" : "mp3" } });
        }
      }
      currentContent = parts;
    }
    const messages: AIMessage[] = [
      { role: "system", content: botPrompt(bot, botsInTeam, [], "", project.name, mode) },
      ...history
        .filter((message) => !message.pending && (message.role === "user" || message.role === "assistant"))
        .slice(-14)
        .map((message) => ({
          role: message.role === "user" ? "user" as const : "assistant" as const,
          content: `${message.role === "user" ? "Usuário" : botsInTeam.find((item) => item.id === message.botId)?.name ?? "Bot"}: ${message.content}`,
        })),
      { role: "user", content: currentContent },
    ];
    const result = await api.aiChat(messages, {
      model: bot.model || aiConfig?.model || models[0]?.id,
      effort: bot.effort || undefined,
      yolo: (bot.permissionMode ?? "yolo") === "yolo",
    });
    return result.text;
  }

  async function respondAsBot(bot: MiniBot, userText: string, options: { attachments?: AgentAttachment[]; audience?: "user" | "coordinator"; channel?: string; token?: number } = {}): Promise<string | null> {
    const workspaceNow = useBots.getState().byProject[project.id];
    const allHistory = (workspaceNow?.messages ?? []).filter((message) => message.mode === threadMode);
    const channel = options.channel ?? (bot.coordinator || mode === "solo" ? (mode === "solo" ? "solo" : "team") : `worker:${bot.id}`);
    const history = bot.coordinator || mode === "solo"
      ? allHistory.filter((message) => !message.channel || message.channel === channel)
      : allHistory.filter((message) => message.channel === channel && (message.role === "user" || message.botId === bot.id));
    const startedAt = Date.now();
    setRunningBots((current) => new Set(current).add(bot.id));
    try {
      if (aiConfig?.provider === "opencode") {
        const current = storedBot(bot);
        const reply = await openCodeReply(current, userText, options.attachments, options.token);
        if (options.token !== undefined && options.token !== runToken.current) return null;
        if (!current.sessionPrimed) updateBot(project.id, current.id, { sessionPrimed: true });
        const currentMessages = useBots.getState().byProject[project.id]?.messages ?? [];
        const eventReplies = currentMessages
          .filter((message) => message.botId === bot.id
            && message.role === "assistant"
            && message.createdAt >= startedAt)
          .sort((a, b) => a.createdAt - b.createdAt);
        const latestEventReply = eventReplies[eventReplies.length - 1];
        // The OpenCode event stream can miss the final `text.ended`/`idle`
        // events while the WebView is suspended. The polling result is the
        // authoritative final text, so update the partial event message
        // instead of assuming that any event reply is already complete.
        if (latestEventReply) {
          updateMessage(project.id, latestEventReply.id, {
            content: reply.trim(),
            status: "complete",
            pending: false,
          });
        } else {
          addMessage(project.id, {
            id: `bot-reply-${bot.id}-${Date.now()}`,
            role: "assistant",
            botId: bot.id,
            content: reply.trim(),
            channel,
            mode: threadMode,
            audience: options.audience ?? "user",
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
        mode: threadMode,
        audience: options.audience ?? "user",
        pending: true,
        status: "running",
        createdAt: Date.now(),
      });
      const reply = await directReply(bot, bots, history, userText, options.attachments);
      if (options.token !== undefined && options.token !== runToken.current) {
        removeMessage(project.id, pendingId);
        return null;
      }
      if (!reply.trim()) throw new Error("O bot retornou uma resposta vazia.");
      updateMessage(project.id, pendingId, { content: reply.trim(), pending: false, status: "complete" });
      if (bot.notifications) {
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
      if (error instanceof Error && error.message === "__stopped__") return null;
      if (options.token !== undefined && options.token !== runToken.current) return null;
      const recovered = recoverBotReply(useBots.getState().byProject[project.id]?.messages ?? [], bot.id, channel, startedAt);
      if (recovered) {
        updateMessage(project.id, recovered.id, { pending: false, status: "complete" });
        return recovered.content.trim();
      }
      const text = error instanceof Error ? error.message : "Não foi possível falar com este bot.";
      addMessage(project.id, {
        id: `bot-error-${bot.id}-${Date.now()}`,
        role: "error",
        botId: bot.id,
        content: text,
        mode: threadMode,
        channel,
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

  async function answerToolQuestion(bot: MiniBot, messageId: string, answer: string) {
    if (!bot.sessionId) throw new Error("A sessão desta pergunta não está mais ativa.");
    const currentMessage = useBots.getState().byProject[project.id]?.messages.find((message) => message.id === messageId);
    const channel = currentMessage?.channel ?? channelForBot(bot);
    await answerOpenCodeQuestion(client, bot.sessionId, answer);
    updateMessage(project.id, messageId, { detail: answer, status: "complete" });
    addMessage(project.id, {
      id: `bot-user-question-${Date.now()}`,
      role: "user",
      content: answer,
      channel,
      mode: threadMode,
      createdAt: Date.now(),
    });
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

  function channelForBot(bot: MiniBot): string {
    return mode === "solo" ? "solo" : bot.coordinator ? "team" : `worker:${bot.id}`;
  }

  function cancelActiveTurn() {
    runToken.current += 1;
    sendingRef.current = false;
    setSending(false);
    setRunningBots(new Set());
    setForms([]);
  }

  async function restoreSession(session: OpenCodeSessionSummary) {
    if (!activeBot) return;
    const botId = activeBot.id;
    const channel = channelForBot(activeBot);
    const restoreMode = threadMode;
    const token = ++restoreToken.current;
    cancelActiveTurn();
    setSessionsOpen(false);
    // Switch the thread and clear it atomically before hydrating it. This
    // prevents a slow context request from leaving the previous session's
    // messages visible (or persisting them under the new session id).
    if (activeBot.sessionId) sessionBotMap.current.delete(activeBot.sessionId);
    discardMessageWrites(project.id, restoreMode, channel);
    setBotSession(project.id, botId, session.id, { sessionPrimed: true, channel, messages: [] });
    sessionBotMap.current.set(session.id, botId);
    try {
      const context = await client.session.context({ sessionID: session.id } as never);
      if (token !== restoreToken.current) return;
      const workspaceNow = useBots.getState().byProject[project.id];
      const currentMode = workspaceNow?.mode === "solo" ? "solo" : "team";
      if (!workspaceNow || workspaceNow.activeBotId !== botId || currentMode !== restoreMode) return;
      const restored = restoreBotMessages(context, botId, channel, restoreMode);
      await api.replaceWorkspaceMessages(project.id, { mode: restoreMode, channel }, restored);
      setBotSession(project.id, botId, session.id, {
        sessionPrimed: true,
        channel,
        messages: visibleHistoryWindow(restored),
      });
      discardMessageWrites(project.id, restoreMode, channel);
    } catch (err) {
      if (token !== restoreToken.current) return;
      addMessage(project.id, { id: `session-error-${Date.now()}`, role: "error", content: err instanceof Error ? err.message : "Não foi possível recuperar a sessão.", channel, mode: restoreMode, createdAt: Date.now() });
    }
  }

  async function newSession() {
    if (!activeBot) return;
    restoreToken.current += 1;
    cancelActiveTurn();
    if (activeBot.sessionId) sessionBotMap.current.delete(activeBot.sessionId);
    const channel = channelForBot(activeBot);
    discardMessageWrites(project.id, threadMode, channel);
    await api.deleteWorkspaceMessages(project.id, { mode: threadMode, channel }).catch(() => undefined);
    setBotSession(project.id, activeBot.id, undefined, { sessionPrimed: false, channel, messages: [] });
  }

  async function syncFromOpenCode() {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    try {
      // Read the live store instead of the closure captured when the effect
      // was registered. A Tophs session can be created long after the first
      // render, and the stale closure used to skip the resume sync entirely.
      const currentBots = useBots.getState().byProject[project.id]?.bots ?? [];
      if (!currentBots.some((bot) => bot.sessionId)) return;
      const active = await client.session.active().catch(() => null);
      if (!active) return;
      const running = new Set(
        currentBots.filter((bot) => bot.sessionId && active[bot.sessionId]?.type === "running").map((bot) => bot.id),
      );
      setRunningBots(running);

      // While a turn is genuinely running, keep the local streaming timeline.
      // It is more complete than the last committed context and the event
      // stream will keep it updated after reconnecting.
      if (sendingRef.current && running.size > 0) return;

      if (sendingRef.current && running.size === 0) {
        // Give the server a moment to flip the session to running after a
        // foreground transition before aborting the in-flight local poll.
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        const confirmed = await client.session.active().catch(() => null);
        if (!confirmed) return;
        const stillRunning = currentBots
          .filter((bot) => bot.sessionId && confirmed[bot.sessionId]?.type === "running")
          .map((bot) => bot.id);
        if (stillRunning.length > 0) {
          setRunningBots(new Set(stillRunning));
          return;
        }
      }

      // If the session finished while the app was backgrounded, cancel the
      // local polling loop before restoring the authoritative final timeline.
      // Otherwise the old loop could append a duplicate answer afterwards.
      if (sendingRef.current) {
        runToken.current += 1;
        sendingRef.current = false;
        setSending(false);
      }

      const selectedBotId = useBots.getState().byProject[project.id]?.activeBotId;
      for (const bot of currentBots) {
        if (!bot.sessionId || (bot.id !== selectedBotId && !running.has(bot.id))) continue;
        const context = await client.session.context({ sessionID: bot.sessionId } as never).catch(() => null);
        // A failed context request must not erase the local transcript. An
        // empty array, however, is a valid empty session and must replace the
        // previous session's messages.
        if (!Array.isArray(context)) continue;
        const workspaceNow = useBots.getState().byProject[project.id];
        const currentBot = workspaceNow?.bots.find((item) => item.id === bot.id);
        // The user may have selected another session while this request was
        // in flight. Never let the old response overwrite the new thread.
        if (!currentBot || currentBot.sessionId !== bot.sessionId) continue;
        const currentMode = workspaceNow?.mode === "solo" ? "solo" : "team";
        const channel = currentMode === "solo" ? "solo" : bot.coordinator ? "team" : `worker:${bot.id}`;
        const restored = visibleHistoryWindow(restoreBotMessages(context, bot.id, channel, currentMode));
        replaceChannelMessages(project.id, channel, restored);
      }
    } finally {
      syncInFlight.current = false;
    }
  }

  async function stop() {
    runToken.current += 1;
    sendingRef.current = false;
    setSending(false);
    setRunningBots(new Set());
    for (const bot of bots) {
      if (bot.sessionId) await client.session.interrupt({ sessionID: bot.sessionId } as never).catch(() => undefined);
    }
  }

  async function send(text: string, attachments: AgentAttachment[] = []) {
    if ((!text.trim() && attachments.length === 0) || sendingRef.current || sending || bots.length === 0) return;
    sendingRef.current = true;
    unlockBotSound();
    stickToBottom.current = true;
    const token = ++runToken.current;
    const direct = mentionedBots(bots, text);
    const activeWorker = mode === "team" && activeBot && activeBot.id !== coordinator?.id ? activeBot : null;
    const targetWorker = activeWorker;
    const channel = targetWorker ? `worker:${targetWorker.id}` : mode === "solo" ? "solo" : "team";
    const userMessageId = `bot-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    addMessage(project.id, {
      id: userMessageId,
      role: "user",
      content: text || attachments.map((file) => file.name).join(", "),
      channel,
      mode: threadMode,
      createdAt: Date.now(),
    });
    const accepted = useBots.getState().byProject[project.id]?.messages.some((message) => message.id === userMessageId);
    if (!accepted) {
      sendingRef.current = false;
      return;
    }
    setInput("");
    clearDraft(draftKey);
    setSending(true);
    try {
      const firstWave = targetWorker
        ? [targetWorker]
        : direct.length > 0
          ? direct
          : coordinator
            ? [coordinator]
            : bots.slice(0, 1);
      const firstReplies = await Promise.all(firstWave.map(async (bot) => {
        if (token !== runToken.current) return null;
        const reply = await respondAsBot(bot, text, { attachments, channel, token });
        return reply === null ? null : { botId: bot.id, reply };
      }));
      const coordinatorReply = firstReplies.find((item) => item?.botId === coordinator?.id)?.reply ?? null;

      // The coordinator delegates in the shared channel and the team replies
      // are visible to the user. Workers may also mention each other for
      // review/handoff in their own response.
      if (mode === "team" && !direct.length && !activeWorker && !targetWorker && coordinator && coordinatorReply) {
        const workers = mentionedBots(bots, coordinatorReply).filter((bot) => bot.id !== coordinator.id);
        if (workers.length > 0) {
          const workerReplies = await Promise.all(workers.map(async (worker) => {
            if (token !== runToken.current) return null;
            const reply = await respondAsBot(
              worker,
              `Tarefa do coordenador ${coordinator.name}:\n\n${coordinatorReply}\n\nPedido original do usuário:\n${text}`,
              { attachments, audience: "coordinator", channel: `worker:${worker.id}`, token },
            );
            return reply ? `${worker.name}: ${reply}` : null;
          }));
          const results = workerReplies.filter((item): item is string => Boolean(item));
          if (results.length > 0) {
            await respondAsBot(
              coordinator,
              `Retornos dos membros da equipe:\n\n${results.join("\n\n")}\n\nConsolide esses retornos em uma resposta final para o usuário.`,
              { audience: "user", channel: "team", token },
            );
          }
        }
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function selectConversation(next: "solo" | "team") {
    if (mode !== next) setMode(project.id, next);
    if (next === "solo") createSolo(project.id);
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 gap-0 overflow-hidden" onPointerDown={unlockBotSound}>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background-full max-[900px]:rounded-none max-[900px]:border-0 max-[900px]:shadow-none min-[901px]:rounded-3xl min-[901px]:border min-[901px]:border-border-button-white min-[901px]:shadow-sidebar">
        {mobile ? (
          <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-separator-border bg-background-secondary-default p-1.5">
            <Button variant={mode === "solo" ? "secondary" : "ghost"} size="small" leadingIcon={UserRound} onClick={() => selectConversation("solo")}>Individual</Button>
            <Button variant={mode === "team" ? "secondary" : "ghost"} size="small" leadingIcon={Bot} onClick={() => selectConversation("team")}>Equipe</Button>
          </div>
        ) : null}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-x-none"
          onScroll={(event) => {
            const element = event.currentTarget;
            stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          }}
          >
          <div className="mx-auto flex min-h-full w-full min-w-0 max-w-[760px] flex-col gap-4 overflow-x-hidden p-4 [&_img]:max-w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
            {(conversationPage.hasMore || (mobile && activityPage.hasMore)) ? (
              <Button
                variant="ghost"
                size="small"
                className="self-center"
                disabled={conversationPage.loading || (mobile && activityPage.loading)}
                onClick={() => {
                  void loadOlderHistory("conversation");
                  if (mobile) void loadOlderHistory("activity");
                }}
              >
                {conversationPage.loading || (mobile && activityPage.loading) ? "Carregando..." : "Carregar mensagens anteriores"}
              </Button>
            ) : null}
            {!conversationPage.ready && conversationPage.loading ? (
              <div className="my-auto flex items-center justify-center gap-2 py-8 text-caption-1-regular text-text-tertiary"><LoaderCircle className="size-4 animate-spin" /> Carregando conversa...</div>
            ) : null}
            {conversationPage.error ? (
              <div className="flex flex-col items-center gap-2 text-center text-caption-2-regular text-status-rose-text">
                <p>{conversationPage.error}</p>
                <Button variant="secondary" size="small" onClick={() => setHistoryReloadToken((value) => value + 1)}>Tentar novamente</Button>
              </div>
            ) : null}
            {!activeBot ? (
              <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center">
                {mode === "team" ? (
                  <>
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-500"><Bot size={22} /></span>
                    <strong className="text-title-3-medium text-text-primary">Sua equipe começa aqui.</strong>
                    <p className="max-w-sm text-caption-1-regular leading-relaxed text-text-secondary">Adicione um Toph pela coluna da esquerda. A conversa e o acompanhamento continuarão sempre nesta mesma tela.</p>
                    <Button variant="secondary" size="small" leadingIcon={MessageSquarePlus} onClick={newBot}>Adicionar primeiro Toph</Button>
                  </>
                ) : (
                  <>
                    <LoaderCircle className="size-4 animate-spin text-accent-500" />
                    <span className="text-caption-1-regular text-text-tertiary">Preparando seu Toph...</span>
                  </>
                )}
              </div>
            ) : conversationPage.ready && conversationMessages.length === 0 ? (
              <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center">
                <div className="flex -space-x-2">
                  {(activeWorker ? [activeWorker] : mode === "solo" ? [activeBot] : bots.slice(0, 4)).map((bot) => <BotAvatar key={bot.id} bot={bot} size={38} className="rounded-full bg-background-primary-default ring-2 ring-background-primary-default" />)}
                </div>
                <strong className="text-title-3-medium text-text-primary">{mode === "solo" ? `${activeBot.name} está pronto.` : activeWorker ? `Converse com ${activeWorker.name}.` : "A equipe está pronta."}</strong>
                <p className="max-w-md text-caption-1-regular leading-relaxed text-text-secondary">
                  {mode === "solo"
                    ? "Pergunte, programe, anexe arquivos ou peça para executar uma tarefa."
                    : activeWorker
                      ? "Esta conversa é direta com este membro da equipe."
                      : "Fale com a equipe; o coordenador distribui o trabalho e consolida a resposta."}
                </p>
              </div>
            ) : null}

            {groupedMessages.map((group, index) => {
              if (group.kind === "user") {
                const messageBot = group.message.channel?.startsWith("worker:")
                  ? bots.find((item) => `worker:${item.id}` === group.message.channel)
                  : mode === "team" ? coordinator : activeBot;
                const messageModel = messageBot?.model || activeModel;
                return (
                  <div key={`user-${group.message.id}`} className="ms-auto flex min-w-0 max-w-[88%] flex-col items-end gap-1">
                    <p className="min-w-0 max-w-full overflow-hidden rounded-2xl bg-accent-500 px-3.5 py-2 text-[14px] leading-[1.55] whitespace-pre-wrap break-words text-text-on-accent">{group.message.content}</p>
                    <MessageInfo
                      agentMode={messageBot?.agentMode}
                      model={modelDisplay(models.find((item) => item.id === messageModel) ?? (messageModel ? { id: messageModel, label: messageModel.split("/").pop() ?? messageModel } : undefined))}
                      createdAt={group.message.createdAt}
                      content={group.message.content}
                      copyLabel="Copiar mensagem"
                      align="end"
                    />
                  </div>
                );
              }
              if (group.kind === "system") return <AgentTranscript key={`system-${index}`} messages={group.messages.map(toAiMessage)} streaming={false} projectId={project.id} projectRoot={project.root} />;
              const bot = bots.find((item) => item.id === group.botId);
              if (!bot) return null;
              const footerAssistant = [...group.messages].reverse().find((message) => message.role === "assistant" && !message.pending);
              const isLatestBotGroup = lastBotGroupIndex.get(bot.id) === index;
              const belongsToCurrentTurn = latestUserAt === 0 || group.messages.some((message) => message.createdAt >= latestUserAt);
              const groupStreaming = belongsToCurrentTurn && isLatestBotGroup && runningBots.has(bot.id);
              const footerBusy = belongsToCurrentTurn && isLatestBotGroup && (runningBots.has(bot.id) || group.messages.some((message) => message.status === "running"));
              return (
                <section key={`bot-${group.botId}-${index}`} className="flex min-w-0 max-w-full flex-col gap-1.5 overflow-x-hidden">
                  {mode === "team" ? (
                    <header className="flex items-center gap-2">
                      <BotAvatar bot={bot} size={28} />
                      <div className="flex min-w-0 items-baseline gap-2">
                        <strong className="truncate text-caption-1-semibold text-text-primary">{bot.name}</strong>
                        <span className="truncate text-caption-2-regular text-text-tertiary">{bot.role}</span>
                      </div>
                    </header>
                  ) : null}
                  <AgentTranscript
                    messages={group.messages.map(toAiMessage)}
                    streaming={groupStreaming}
                    onPermission={(messageId, permissionId, decision) => void replyPermission(bot, messageId, permissionId, decision)}
                    onQuestion={(messageId, answer) => void answerToolQuestion(bot, messageId, answer)}
                    projectId={project.id}
                    projectRoot={project.root}
                  />
                  {mode === "solo" && !footerBusy && footerAssistant ? (
                    <MessageInfo
                      agentMode={bot.agentMode}
                      model={modelDisplay(models.find((item) => item.id === (bot.model || activeModel)) ?? ((bot.model || activeModel) ? { id: bot.model || activeModel, label: (bot.model || activeModel).split("/").pop() ?? (bot.model || activeModel) } : undefined))}
                      createdAt={footerAssistant.createdAt}
                      content={footerAssistant.content}
                      copyLabel="Copiar resposta"
                    />
                  ) : null}
                </section>
              );
            })}

            {visibleRunningBots
              .filter((botId) => !groupedMessages.some((group) => group.kind === "bot" && group.botId === botId && (latestUserAt === 0 || group.messages.some((message) => message.createdAt >= latestUserAt))))
              .map((botId) => {
                const bot = bots.find((item) => item.id === botId);
                if (!bot) return null;
                return (
                  <section key={`pending-${botId}`} className="flex flex-col gap-2">
                    <header className="flex items-center gap-2"><BotAvatar bot={bot} size={28} /><strong className="truncate text-caption-1-semibold text-text-primary">{bot.name}</strong></header>
                    <AgentTranscript messages={[]} streaming projectId={project.id} projectRoot={project.root} />
                  </section>
                );
              })}

            {mobile ? visibleForms.map(({ form, botId }) => {
              const bot = bots.find((item) => item.id === botId);
              if (!bot) return null;
              return (
                <section key={`form-${form.id}`} className="flex flex-col gap-2">
                  <header className="flex items-center gap-2"><BotAvatar bot={bot} size={28} /><strong className="truncate text-caption-1-semibold text-text-primary">{bot.name}</strong></header>
                  <OpenCodeFormCard form={form} busy={formBusy === form.id} onSubmit={(answer) => void answerForm(form, bot, answer)} onCancel={() => void cancelForm(form, bot)} />
                </section>
              );
            }) : null}
          </div>
        </div>

        {activeBot ? <div className="shrink-0">
          <AgentComposer
            value={input}
            onChange={updateInput}
            onSend={(value, attachments) => void send(value, attachments)}
            onStop={() => void stop()}
            busy={sending || runningBots.size > 0}
            models={models}
            model={activeModel}
            onModelChange={(value) => updateBot(project.id, activeBot.id, { model: value })}
            effort={activeBot.effort ?? ""}
            efforts={activeEfforts}
            onEffortChange={(value) => updateBot(project.id, activeBot.id, { effort: value })}
            placeholder={mode === "solo" ? `Pergunte para ${activeBot.name}...` : activeBot.id === coordinator?.id ? "Fale com o coordenador ou @mencione um membro..." : `Pergunte para ${activeBot.name}...`}
            modeControls={
              <>
                <ComposerMenu
                  label="Modo do agente"
                  trigger={
                    <>
                      <span>{activeBot.agentMode === "plan" ? "Plano" : "Build"}</span>
                      <ChevronDown size={12} className="size-3 text-foreground-icon-tertiary" />
                    </>
                  }
                  popoverClassName="w-[300px] p-0"
                  contentClassName="flex flex-col gap-1 p-1.5"
                >
                  {(close) => (
                    <>
                      <DropdownItem selected={activeBot.agentMode !== "plan"} onSelect={() => { updateBot(project.id, activeBot.id, { agentMode: "build" }); close(); }}>Build</DropdownItem>
                      <DropdownItem selected={activeBot.agentMode === "plan"} onSelect={() => { updateBot(project.id, activeBot.id, { agentMode: "plan" }); close(); }}>Plano</DropdownItem>
                    </>
                  )}
                </ComposerMenu>
                <AiUsageMeter client={client} refreshKey={`${sessionKey}:${completedReplies}`} />
              </>
            }
            history={conversationMessages.filter((message) => message.role === "user").map((message) => message.content)}
          />
        </div> : null}
      </section>

      {!mobile ? (
        <>
          <ResizeHandle
            orientation="vertical"
            value={activityWidth}
            min={300}
            max={620}
            invert
            label="Redimensionar acompanhamento"
            onChange={(width) => document.documentElement.style.setProperty("--ai-panel-width", `${width}px`)}
            onCommit={(width) => updateSettings({ aiPanelWidth: width })}
          />
          <aside className="flex min-h-0 w-[clamp(300px,34vw,var(--ai-panel-width))] shrink-0 flex-col overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-separator-border bg-background-secondary-default px-3">
              <span className="flex size-8 items-center justify-center rounded-xl bg-accent-500/10 text-accent-500"><Monitor size={15} /></span>
              <div className="flex min-w-0 flex-1 flex-col">
                <strong className="truncate text-caption-1-semibold text-text-primary">Acompanhamento</strong>
                <span className="truncate text-caption-2-regular text-text-tertiary">Arquivos, navegador, terminal e ferramentas</span>
              </div>
              {visibleRunningBots.length > 0 ? (
                <span className="flex items-center gap-1.5 rounded-full bg-accent-500/10 px-2 py-1 text-[10px] font-medium text-accent-600"><LoaderCircle className="size-3 animate-spin" /> Ao vivo</span>
              ) : activityMessages.length + assistantImages.length > 0 ? (
                <span className="rounded-full bg-background-tertiary-default px-2 py-1 text-[10px] text-text-tertiary">{activityMessages.length + assistantImages.length}</span>
              ) : null}
            </header>
            <div
              ref={activityScrollRef}
              className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3"
              onScroll={(event) => {
                const element = event.currentTarget;
                stickActivityToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
              }}
            >
              {activityPage.hasMore ? (
                <Button variant="ghost" size="small" className="mb-3 w-full" disabled={activityPage.loading} onClick={() => void loadOlderHistory("activity")}>
                  {activityPage.loading ? "Carregando..." : "Carregar atividades anteriores"}
                </Button>
              ) : null}
              {!activityPage.ready && activityPage.loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-caption-1-regular text-text-tertiary"><LoaderCircle className="size-4 animate-spin" /> Carregando atividades...</div>
              ) : null}
              {activityPage.error ? (
                <div className="mb-3 flex flex-col items-center gap-2 text-center text-caption-2-regular text-status-rose-text">
                  <p>{activityPage.error}</p>
                  <Button variant="secondary" size="small" onClick={() => setHistoryReloadToken((value) => value + 1)}>Tentar novamente</Button>
                </div>
              ) : null}
              {!activeBot ? (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 px-5 text-center">
                  <ListTree className="size-6 text-text-tertiary" />
                  <strong className="text-caption-1-semibold text-text-primary">Nenhuma atividade ainda</strong>
                  <p className="max-w-xs text-caption-2-regular leading-relaxed text-text-tertiary">Quando um Toph começar a trabalhar, cada ação aparecerá aqui.</p>
                </div>
              ) : activityPage.ready && activityGroups.length === 0 && visibleRunningBots.length === 0 && visibleForms.length === 0 && assistantImages.length === 0 ? (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 px-5 text-center">
                  <ListTree className="size-6 text-text-tertiary" />
                  <strong className="text-caption-1-semibold text-text-primary">Pronto para acompanhar</strong>
                  <p className="max-w-xs text-caption-2-regular leading-relaxed text-text-tertiary">As leituras, edições, comandos e visualizações do navegador serão mostradas em tempo real.</p>
                </div>
              ) : (
                <div className="flex min-w-0 flex-col gap-3">
                  <AgentImageGallery images={assistantImages} title="Imagens da resposta" />
                  {activityGroups.map((group, index) => {
                    if (group.kind !== "bot") return null;
                    const bot = bots.find((item) => item.id === group.botId);
                    if (!bot) return null;
                    const latest = lastActivityGroupIndex.get(bot.id) === index;
                    return (
                      <section key={`activity-${bot.id}-${index}`} className="min-w-0 border-b border-separator-border pb-3 last:border-b-0">
                        <header className="mb-1.5 flex items-center gap-2">
                          <BotAvatar bot={bot} size={26} />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <strong className="truncate text-caption-1-semibold text-text-primary">{bot.name}</strong>
                            <span className="truncate text-[10px] text-text-tertiary">{bot.role || "Toph"}</span>
                          </div>
                          {latest && runningBots.has(bot.id) ? <LoaderCircle className="size-3.5 animate-spin text-accent-500" /> : null}
                        </header>
                        <AgentTranscript
                          messages={group.messages.map(toAiMessage)}
                          streaming={latest && runningBots.has(bot.id)}
                          toolsExpanded={latest && runningBots.has(bot.id)}
                          className="flex min-w-0 flex-col gap-1"
                          onPermission={(messageId, permissionId, decision) => void replyPermission(bot, messageId, permissionId, decision)}
                          onQuestion={(messageId, answer) => void answerToolQuestion(bot, messageId, answer)}
                          projectId={project.id}
                          projectRoot={project.root}
                        />
                      </section>
                    );
                  })}

                  {visibleRunningBots
                    .filter((botId) => !activityGroups.some((group) => group.kind === "bot" && group.botId === botId))
                    .map((botId) => {
                      const bot = bots.find((item) => item.id === botId);
                      if (!bot) return null;
                      return (
                        <section key={`activity-pending-${bot.id}`} className="border-b border-separator-border pb-3 last:border-b-0">
                          <header className="mb-2 flex items-center gap-2"><BotAvatar bot={bot} size={26} /><strong className="truncate text-caption-1-semibold text-text-primary">{bot.name}</strong></header>
                          <AgentTranscript messages={[]} streaming className="flex flex-col gap-1" projectId={project.id} projectRoot={project.root} />
                        </section>
                      );
                    })}

                  {visibleForms.map(({ form, botId }) => {
                    const bot = bots.find((item) => item.id === botId);
                    if (!bot) return null;
                    return (
                      <section key={`activity-form-${form.id}`} className="flex flex-col gap-2 border-b border-separator-border pb-3 last:border-b-0">
                        <header className="flex items-center gap-2"><BotAvatar bot={bot} size={26} /><strong className="truncate text-caption-1-semibold text-text-primary">{bot.name}</strong></header>
                        <OpenCodeFormCard form={form} busy={formBusy === form.id} onSubmit={(answer) => void answerForm(form, bot, answer)} onCancel={() => void cancelForm(form, bot)} />
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </>
      ) : null}

      <Modal isOpen={configOpen && Boolean(activeBot)} onClose={() => setConfigOpen(false)} title={activeBot?.name ?? "Toph"} description={mode === "solo" ? "Configure identidade, modelo, provedor e ferramentas." : "Configure este membro da equipe."} placement={mobile ? "bottom" : "center"} size="xl" bodyClassName="p-0" swipeToClose={mobile}>
        {activeBot && <BotConfig projectId={project.id} projectRoot={project.root} bot={activeBot} mode={mode} />}
      </Modal>

      <TophSessionsSheet
        open={sessionsOpen}
        project={project}
        mode={mode}
        bot={activeBot}
        activeSessionId={activeBot?.sessionId}
        onClose={() => setSessionsOpen(false)}
        onSelect={(session) => void restoreSession(session)}
        onNew={newSession}
      />

    </div>
  );
}
