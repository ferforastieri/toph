import { useEffect, useMemo, useRef, useState } from "react";
import { OpenCode } from "@opencode/client";
import { connectClientMcp, type ClientMcpTool } from "@opencode/client/mcp";
import { Bot, Copy, ListTree, LoaderCircle, MessageSquarePlus, Monitor, Plus } from "@toph/icons";
import { api, ApiError, openCodeBase, type AIMessage, type AIMessageContentPart, type Project } from "../api";
import { modelDisplay, useAI } from "../ai";
import { activeChat, chatCoordinator, chatTophs, useChats, type ChatMessage, type ChatToph } from "../chats";
import { notifyAiResponse } from "../aiNotifications";
import { playBotResponseSound, unlockBotSound } from "../botSound";
import BotAvatar from "../components/BotAvatar";
import BotConfig from "../components/BotConfig";
import TophGallery from "../components/TophGallery";
import AgentTranscript, { AgentImageGallery, agentImagesForMessages } from "../components/AgentTranscript";
import OpenCodeFormCard, { type OpenCodeForm, type OpenCodeFormAnswer } from "../components/OpenCodeFormCard";
import type { AiMessage } from "../store";
import { Button } from "@/boardui/base/buttons/button";
import { Modal } from "@/boardui/base/modal/modal";
import { cx } from "@/boardui/utils/cx";
import { useTophDrafts } from "../tophDrafts";
import { AgentComposer, type AgentAttachment } from "../ui/AgentComposer";
import AiUsageMeter from "../ui/AiUsageMeter";
import ResizeHandle from "../ui/resize";
import { useSettings } from "../settings";
import { extractAgentFilePaths } from "../agentArtifacts";
import { answerOpenCodeQuestion } from "../opencodeQuestion";
import { recoverBotReply } from "../botReply";

export interface TophActionRequest {
  tophId: string;
  action: "config";
}

interface Props {
  project: Project;
  mobile?: boolean;
  externalAction?: TophActionRequest | null;
  onExternalActionHandled?: () => void;
}

const CONVERSATION_PAGE_SIZE = 30;
const ACTIVITY_PAGE_SIZE = 12;
const ASSISTANT_IMAGE_SCAN_LIMIT = 12;
const ASSISTANT_IMAGE_RENDER_LIMIT = 8;

interface HistoryPageState {
  cursor: { createdAt: number; channel: string; id: string } | null;
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

function mentionedTophs(tophs: ChatToph[], text: string): ChatToph[] {
  const mentions = new Set(
    [...text.matchAll(/@([a-z0-9-]+)/gi)].map((match) => match[1].toLowerCase()),
  );
  return tophs.filter((toph) => mentions.has(toph.handle.toLowerCase()));
}

function promptHistory(messages: ChatMessage[], userText: string): ChatMessage[] {
  if (!userText) return messages;
  const last = messages[messages.length - 1];
  if (last?.role === "user" && last.content === userText) return messages.slice(0, -1);
  return messages;
}

function languageInstruction(toph: ChatToph): string {
  switch (toph.language) {
    case "pt": return "Responda sempre em português do Brasil.";
    case "en": return "Always answer in English.";
    case "es": return "Responde siempre en español.";
    default: return "Responda no idioma da última mensagem do usuário.";
  }
}

function tophPrompt(toph: ChatToph, tophs: ChatToph[], messages: ChatMessage[], userText: string, company: string, chatName: string): string {
  const names = new Map(tophs.map((item) => [item.id, item.name]));
  const coordinator = tophs.find((item) => item.coordinator) ?? tophs[0];
  const history = messages
    .filter((message) => !message.pending && (message.role === "user" || message.role === "assistant"))
    .slice(-14)
    .map((message) => `${message.role === "user" ? "Usuário" : names.get(message.tophId ?? "") ?? "Toph"}: ${message.content}`)
    .join("\n\n");
  const chatRules = toph.coordinator
    ? `Você é o coordenador do chat #${chatName}. O usuário fala com o chat. Distribua tarefas com @menções, acompanhe os retornos, peça revisão quando necessário e consolide a resposta final. O trabalho dos membros é visível no chat.`
    : `Você participa do chat #${chatName}, coordenado por ${coordinator?.name ?? "o coordenador"}. Responda ao usuário, colabore com os outros Tophs usando @menções e entregue o que foi pedido.`;
  return [
    toph.prompt?.trim() || `Você é ${toph.name}, ${toph.role || "especialista"} na empresa do projeto ${company}.`,
    toph.description ? `Sua função: ${toph.description}` : "",
    toph.personality ? `Sua personalidade: ${toph.personality}` : "",
    chatRules,
    `Tophs deste chat: ${tophs.map((item) => `@${item.handle} (${item.name}${item.coordinator ? ", coordenador" : ""})`).join(", ")}.`,
    `MCPs habilitados para você: ${toph.mcpServers.length ? toph.mcpServers.join(", ") : "nenhum"}.`,
    toph.emailAccountIds.length ? "Você tem ferramentas de email habilitadas. Use-as apenas para as contas autorizadas." : "Você não tem contas de email habilitadas.",
    languageInstruction(toph),
    history ? `Contexto recente do chat:\n${history}` : "",
    userText ? `Mensagem atual:\n${userText}` : "",
    `Responda apenas como ${toph.name}, de forma útil e direta.`,
  ].filter(Boolean).join("\n\n");
}

type ChatGroup =
  | { kind: "user"; message: ChatMessage }
  | { kind: "toph"; tophId: string; messages: ChatMessage[] }
  | { kind: "system"; messages: ChatMessage[] };

function groupChatMessages(messages: ChatMessage[]): ChatGroup[] {
  const groups: ChatGroup[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      groups.push({ kind: "user", message });
      continue;
    }
    if (message.tophId) {
      const last = groups[groups.length - 1];
      if (last?.kind === "toph" && last.tophId === message.tophId) {
        last.messages.push(message);
      } else {
        groups.push({ kind: "toph", tophId: message.tophId, messages: [message] });
      }
      continue;
    }
    const last = groups[groups.length - 1];
    if (last?.kind === "system") last.messages.push(message);
    else groups.push({ kind: "system", messages: [message] });
  }
  return groups;
}

function toAiMessage(message: ChatMessage): AiMessage {
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

type TophActivityState = "thinking" | "working" | "responding";

function TophActivityAvatar({ bot, state, size = 32, className }: { bot: ChatToph; state: TophActivityState | null; size?: number; className?: string }) {
  return (
    <span className={cx("relative inline-flex shrink-0 items-center justify-center", state && `toph-activity-${state}`, className)}>
      {state ? <span className="toph-activity-ring" aria-hidden /> : null}
      <BotAvatar bot={bot} size={size} className={cx("relative z-[1]", state && "toph-activity-avatar")} />
      {state ? <span className="toph-activity-dots" aria-hidden><i /><i /><i /></span> : null}
    </span>
  );
}

function TophActivityStatus({ state }: { state: TophActivityState }) {
  return (
    <span className="toph-activity-status text-accent-500" role="status" aria-live="polite">
      {state === "thinking" ? "Pensando" : state === "working" ? "Trabalhando" : "Respondendo"}
      <span className="toph-activity-ellipsis" aria-hidden><i>.</i><i>.</i><i>.</i></span>
    </span>
  );
}

export default function BotStudioTab({ project, mobile = false, externalAction = null, onExternalActionHandled }: Props) {
  const projectChats = useChats((state) => state.byProject[project.id]);
  const ensure = useChats((state) => state.ensure);
  const addMessage = useChats((state) => state.addMessage);
  const updateMessage = useChats((state) => state.updateMessage);
  const removeMessage = useChats((state) => state.removeMessage);
  const updateToph = useChats((state) => state.updateToph);
  const mergeMessages = useChats((state) => state.mergeMessages);
  const aiConfig = useAI((state) => state.config);
  const models = useAI((state) => state.models);
  const activityWidth = useSettings((state) => state.aiPanelWidth);
  const updateSettings = useSettings((state) => state.update);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [configTophId, setConfigTophId] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const runToken = useRef(0);
  const [runningTophs, setRunningTophs] = useState<Set<string>>(new Set());
  const [forms, setForms] = useState<Array<{ form: OpenCodeForm; tophId: string }>>([]);
  const [formBusy, setFormBusy] = useState<string | null>(null);
  const [conversationPage, setConversationPage] = useState<HistoryPageState>(EMPTY_HISTORY_PAGE);
  const [activityPage, setActivityPage] = useState<HistoryPageState>(EMPTY_HISTORY_PAGE);
  const [historyReloadToken, setHistoryReloadToken] = useState(0);
  const sessionTophMap = useRef(new Map<string, string>());
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

  const chat = activeChat(projectChats);
  const tophs = chatTophs(projectChats, chat?.id);
  const coordinator = chatCoordinator(tophs);
  const messages = projectChats?.messages.filter((message) => message.chatId === chat?.id) ?? [];
  const conversationMessages = mobile
    ? messages
    : messages.filter((message) => message.role !== "tool" && message.role !== "reasoning");
  const activityMessages = messages.filter((message) => message.role === "tool" || message.role === "reasoning");
  const groupedMessages = groupChatMessages(conversationMessages);
  const activityGroups = groupChatMessages(activityMessages);
  const latestUserAt = [...conversationMessages].reverse().find((message) => message.role === "user")?.createdAt ?? 0;
  const lastTophGroupIndex = new Map<string, number>();
  groupedMessages.forEach((group, index) => {
    if (group.kind === "toph") lastTophGroupIndex.set(group.tophId, index);
  });
  const lastActivityGroupIndex = new Map<string, number>();
  activityGroups.forEach((group, index) => {
    if (group.kind === "toph") lastActivityGroupIndex.set(group.tophId, index);
  });
  const completedReplies = messages.filter((message) => message.role === "assistant" && !message.pending && message.status !== "running").length;
  const visibleRunningTophs = [...runningTophs].filter((tophId) => tophs.some((toph) => toph.id === tophId));
  const visibleForms = forms.filter(({ tophId }) => tophs.some((toph) => toph.id === tophId));
  const assistantImages = agentImagesForMessages(
    messages.filter((message) => message.role === "assistant").slice(-ASSISTANT_IMAGE_SCAN_LIMIT).map(toAiMessage),
    project.id,
    project.root,
  ).slice(-ASSISTANT_IMAGE_RENDER_LIMIT);
  const draftKey = `${project.id}:${chat?.id ?? "none"}`;
  const savedDraft = useTophDrafts((state) => state.drafts[draftKey] ?? "");
  const setDraft = useTophDrafts((state) => state.setDraft);
  const clearDraft = useTophDrafts((state) => state.clearDraft);
  const configToph = tophs.find((toph) => toph.id === configTophId) ?? null;
  const activeModel = coordinator?.model || aiConfig?.model || models[0]?.id || "";
  const tophSessionKey = tophs.map((toph) => `${toph.id}:${toph.sessionId ?? ""}`).join("|");

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
      useChats.getState().updateMessage(project.id, messageId, {
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
      const tophId = sessionID ? sessionTophMap.current.get(sessionID) : undefined;
      const toph = Object.values(useChats.getState().byProject)
        .flatMap((item) => item.tophs)
        .find((item) => item.id === tophId);
      return { toph, ids: toph?.emailAccountIds ?? [] };
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
  }, [aiConfig?.provider, project.root, project.id]);

  useEffect(() => {
    if (!projectChats?.hydrated || !chat) {
      setConversationPage(EMPTY_HISTORY_PAGE);
      setActivityPage(EMPTY_HISTORY_PAGE);
      return;
    }
    let cancelled = false;
    setConversationPage({ ...EMPTY_HISTORY_PAGE, loading: true });
    setActivityPage({ ...EMPTY_HISTORY_PAGE, loading: true });
    const base = { mode: "chat" as const, channel: chat.id };
    void Promise.all([
      api.workspaceMessages<ChatMessage>(project.id, { ...base, scope: "conversation", limit: CONVERSATION_PAGE_SIZE }),
      api.workspaceMessages<ChatMessage>(project.id, { ...base, scope: "activity", limit: ACTIVITY_PAGE_SIZE }),
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
  }, [chat?.id, projectChats?.hydrated, historyReloadToken, mergeMessages, project.id]);

  async function loadOlderHistory(scope: "conversation" | "activity") {
    if (!chat) return;
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
      const page = await api.workspaceMessages<ChatMessage>(project.id, {
        mode: "chat",
        channel: chat.id,
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
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; tophId?: string }>).detail;
      if (detail?.action === "config" && detail.tophId) setConfigTophId(detail.tophId);
      else if (detail?.action === "add") setGalleryOpen(true);
    };
    window.addEventListener("toph:toph-action", handler);
    return () => window.removeEventListener("toph:toph-action", handler);
  }, []);

  useEffect(() => {
    if (!externalAction) return;
    setConfigTophId(externalAction.tophId);
    onExternalActionHandled?.();
  }, [externalAction, onExternalActionHandled]);

  useEffect(() => {
    setInput(savedDraft);
  }, [draftKey]);

  function updateInput(value: string) {
    setInput(value);
    setDraft(draftKey, value);
  }

  useEffect(() => {
    const fallback = aiConfig?.model || models[0]?.id;
    if (!fallback) return;
    const current = projectChats?.tophs.filter((toph) => toph.chatId === chat?.id) ?? [];
    for (const toph of current) {
      if (!toph.model) updateToph(project.id, toph.id, { model: fallback });
    }
  }, [aiConfig?.model, models, project.id, projectChats?.tophs, chat?.id, updateToph]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !stickToBottom.current) return;
    element.scrollTop = element.scrollHeight;
  }, [conversationMessages.length, visibleRunningTophs.length, forms.length]);

  useEffect(() => {
    const element = activityScrollRef.current;
    if (!element || !stickActivityToBottom.current) return;
    element.scrollTop = element.scrollHeight;
  }, [activityMessages.length, visibleRunningTophs.length, forms.length]);

  useEffect(() => {
    if (!chat) return;
    const timer = window.setInterval(async () => {
      if (document.hidden) return;
      const active = await client.session.active().catch(() => null);
      if (!active) return;
      const current = chatTophs(useChats.getState().byProject[project.id], chat.id);
      const running = new Set(
        current.filter((toph) => toph.sessionId && active[toph.sessionId]?.type === "running").map((toph) => toph.id),
      );
      setRunningTophs(running);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [chat?.id, client, project.id, tophSessionKey]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        for await (const event of client.event.subscribe({ signal: controller.signal })) {
          const data = (event as { data?: Record<string, unknown> }).data;
          if (!data) continue;
          if (event.type === "form.created") {
            const form = (data as { form?: OpenCodeForm }).form;
            const allTophs = Object.values(useChats.getState().byProject).flatMap((item) => item.tophs);
            const tophId = form
              ? sessionTophMap.current.get(form.sessionID) ?? allTophs.find((item) => item.sessionId === form.sessionID)?.id
              : undefined;
            if (form && tophId) {
              setForms((current) => current.some((item) => item.form.id === form.id) ? current : [...current, { form, tophId }]);
            }
            continue;
          }
          const sessionId = String(data.sessionID ?? "");
          const state = useChats.getState();
          const allTophs = Object.values(state.byProject).flatMap((item) => item.tophs);
          const tophId = sessionTophMap.current.get(sessionId) ?? allTophs.find((item) => item.sessionId === sessionId)?.id;
          if (!tophId) continue;
          const toph = allTophs.find((item) => item.id === tophId);
          if (!toph) continue;
          const chatId = toph.chatId;
          const assistantID = String(data.assistantMessageID ?? "");
          const messageID = (kind: string, id = assistantID) => `bot-${tophId}-${kind}-${id || Date.now()}`;
          const ensure = (message: ChatMessage) => {
            const list = state.byProject[project.id]?.messages ?? [];
            if (!list.some((item) => item.id === message.id)) state.addMessage(project.id, message);
          };
          switch (event.type) {
            case "session.text.started":
              ensure({ id: messageID("assistant"), chatId, tophId, role: "assistant", content: "", status: "running", createdAt: Date.now() });
              break;
            case "session.text.delta": {
              const id = messageID("assistant");
              ensure({ id, chatId, tophId, role: "assistant", content: "", status: "running", createdAt: Date.now() });
              state.appendMessage(project.id, id, String(data.delta ?? ""));
              break;
            }
            case "session.text.ended":
              state.updateMessage(project.id, messageID("assistant"), { content: String(data.text ?? ""), status: "complete" });
              break;
            case "session.reasoning.started":
              ensure({ id: messageID("reasoning"), chatId, tophId, role: "reasoning", title: "Thought", content: "", status: "running", createdAt: Date.now() });
              break;
            case "session.reasoning.delta": {
              const id = messageID("reasoning");
              ensure({ id, chatId, tophId, role: "reasoning", title: "Thought", content: "", status: "running", createdAt: Date.now() });
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
              ensure({ id: messageID("tool", String(data.id ?? "")), chatId, tophId, role: "tool", title: `Tool · ${String(data.name ?? "call")}`, content: "", detail: "", status: "running", createdAt: Date.now() });
              break;
            case "session.tool.input.delta": {
              const id = messageID("tool", String(data.id ?? ""));
              ensure({ id, chatId, tophId, role: "tool", title: "Tool", content: "", detail: "", status: "running", createdAt: Date.now() });
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
              ensure({ id, chatId, tophId, role: "tool", title: `Tool · ${name}`, content: inputText, detail: "", status: "running", createdAt: Date.now() });
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
                id: `bot-${tophId}-permission-${String(data.id)}`,
                chatId,
                tophId,
                role: "tool",
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
              if (status === "busy") setRunningTophs((current) => new Set(current).add(tophId));
              if (status === "idle") setRunningTophs((current) => { const next = new Set(current); next.delete(tophId); return next; });
              break;
            }
            case "session.execution.succeeded":
            case "session.execution.failed":
            case "session.execution.interrupted":
            case "session.idle":
              setRunningTophs((current) => { const next = new Set(current); next.delete(tophId); return next; });
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
  }, [client, project.id]);

  function storedToph(toph: ChatToph): ChatToph {
    return Object.values(useChats.getState().byProject)
      .flatMap((item) => item.tophs)
      .find((item) => item.id === toph.id) ?? toph;
  }

  function currentChat(toph: ChatToph): { chat: ReturnType<typeof activeChat>; tophs: ChatToph[]; messages: ChatMessage[] } {
    const state = useChats.getState().byProject[project.id];
    const chatNow = state?.chats.find((item) => item.id === toph.chatId) ?? null;
    return {
      chat: chatNow,
      tophs: state?.tophs.filter((item) => item.chatId === toph.chatId) ?? [],
      messages: state?.messages.filter((item) => item.chatId === toph.chatId) ?? [],
    };
  }

  async function ensureSession(toph: ChatToph): Promise<string> {
    const current = storedToph(toph);
    if (current.sessionId) return current.sessionId;
    const model = splitModel(current.model || aiConfig?.model || models[0]?.id || "");
    const base = {
      title: `${current.name} · #${chat?.name ?? project.name}`,
      location: { directory: project.root },
      agent: current.agentMode ?? "build",
      metadata: { tophBotId: current.id, tophChatId: current.chatId, tophBot: true },
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
    updateToph(project.id, current.id, { sessionId: session.id, sessionPrimed: false });
    sessionTophMap.current.set(session.id, current.id);
    if (model) {
      await client.session.switchModel({
        sessionID: session.id,
        model: { ...model, variant: current.effort || undefined },
      } as never).catch(() => undefined);
    }
    return session.id;
  }

  async function applyMcpSelection(toph: ChatToph) {
    if (!Array.isArray(toph.mcpServers)) return;
    const location = { directory: project.root };
    const result = await client.mcp.list({ location } as never).catch(() => null) as { data?: Array<{ name: string }> } | null;
    const servers = result?.data ?? [];
    for (const server of servers) {
      if (server.name === "toph_email") continue;
      const selected = toph.mcpServers.includes(server.name);
      if (selected) {
        await client.mcp.connect({ server: server.name, location } as never).catch(() => undefined);
      } else {
        await client.mcp.disconnect({ server: server.name, location } as never).catch(() => undefined);
      }
    }
  }

  async function openCodeReply(toph: ChatToph, userText: string, attachments: AgentAttachment[] = [], token = runToken.current, retry = false): Promise<string> {
    const current = storedToph(toph);
    const { chat: chatNow, tophs: tophsNow, messages: allHistory } = currentChat(current);
    const history = promptHistory(allHistory, userText);
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
    const prompt = tophPrompt(current, tophsNow, history, userText, project.name, chatNow?.name ?? "chat");
    const before = lastAssistant(await client.session.context({ sessionID: sessionId } as never).catch(() => null))?.id ?? "";
    try {
      await client.session.prompt({
        sessionID: sessionId,
        text: prompt,
        files: attachments.map((file) => ({ uri: file.uri, name: file.name, description: file.mime })),
      } as never);
    } catch (error) {
      if (!retry && current.sessionId) {
        sessionTophMap.current.delete(current.sessionId);
        updateToph(project.id, current.id, { sessionId: undefined, sessionPrimed: false });
        return openCodeReply({ ...current, sessionId: undefined, sessionPrimed: false }, userText, attachments, token, true);
      }
      throw error;
    }
    const deadline = Date.now() + 90_000;
    let latest = "";
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      if (token !== runToken.current) throw new Error("__stopped__");
      const active = await client.session.active().catch(() => null);
      if (!active || active[sessionId]) continue;
      const context = await client.session.context({ sessionID: sessionId } as never).catch(() => null);
      const assistant = lastAssistant(context);
      if (!assistant || assistant.id === before) continue;
      latest = assistant.text || latest;
      if (latest) return latest;
      if (assistant.error) throw new Error(assistant.error);
    }
    if (latest) return latest;
    throw new Error("O Toph não respondeu a tempo.");
  }

  async function directReply(toph: ChatToph, tophsNow: ChatToph[], history: ChatMessage[], userText: string, attachments: AgentAttachment[] = []): Promise<string> {
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
      { role: "system", content: tophPrompt(toph, tophsNow, [], "", project.name, chat?.name ?? "chat") },
      ...history
        .filter((message) => !message.pending && (message.role === "user" || message.role === "assistant"))
        .slice(-14)
        .map((message) => ({
          role: message.role === "user" ? "user" as const : "assistant" as const,
          content: `${message.role === "user" ? "Usuário" : tophsNow.find((item) => item.id === message.tophId)?.name ?? "Toph"}: ${message.content}`,
        })),
      { role: "user", content: currentContent },
    ];
    const result = await api.aiChat(messages, {
      model: toph.model || aiConfig?.model || models[0]?.id,
      effort: toph.effort || undefined,
      yolo: (toph.permissionMode ?? "yolo") === "yolo",
    });
    return result.text;
  }

  async function respondAsToph(toph: ChatToph, userText: string, options: { attachments?: AgentAttachment[]; token?: number } = {}): Promise<string | null> {
    const { tophs: tophsNow, messages: allHistory } = currentChat(toph);
    const history = promptHistory(allHistory, userText);
    const startedAt = Date.now();
    setRunningTophs((current) => new Set(current).add(toph.id));
    try {
      if (aiConfig?.provider === "opencode") {
        const current = storedToph(toph);
        const reply = await openCodeReply(current, userText, options.attachments, options.token);
        if (options.token !== undefined && options.token !== runToken.current) return null;
        if (!current.sessionPrimed) updateToph(project.id, current.id, { sessionPrimed: true });
        const currentMessages = useChats.getState().byProject[project.id]?.messages ?? [];
        const eventReplies = currentMessages
          .filter((message) => message.tophId === toph.id
            && message.chatId === toph.chatId
            && message.role === "assistant"
            && message.createdAt >= startedAt)
          .sort((a, b) => a.createdAt - b.createdAt);
        const latestEventReply = eventReplies[eventReplies.length - 1];
        if (latestEventReply) {
          updateMessage(project.id, latestEventReply.id, {
            content: reply.trim(),
            status: "complete",
            pending: false,
          });
        } else {
          addMessage(project.id, {
            id: `bot-reply-${toph.id}-${Date.now()}`,
            chatId: toph.chatId,
            tophId: toph.id,
            role: "assistant",
            content: reply.trim(),
            status: "complete",
            createdAt: Date.now(),
          });
        }
        if (toph.notifications) {
          playBotResponseSound();
          notifyAiResponse({
            projectId: project.id,
            tabId: `bots:${project.id}`,
            sessionId: toph.sessionId,
            botId: toph.id,
            botName: toph.name,
            botRole: toph.role,
            text: reply,
          });
        }
        return reply.trim();
      }

      const pendingId = `bot-reply-${toph.id}-${Date.now()}`;
      addMessage(project.id, {
        id: pendingId,
        chatId: toph.chatId,
        tophId: toph.id,
        role: "assistant",
        content: "",
        pending: true,
        status: "running",
        createdAt: Date.now(),
      });
      const reply = await directReply(toph, tophsNow, history, userText, options.attachments);
      if (options.token !== undefined && options.token !== runToken.current) {
        removeMessage(project.id, pendingId);
        return null;
      }
      if (!reply.trim()) throw new Error("O Toph retornou uma resposta vazia.");
      updateMessage(project.id, pendingId, { content: reply.trim(), pending: false, status: "complete" });
      if (toph.notifications) {
        playBotResponseSound();
        notifyAiResponse({
          projectId: project.id,
          tabId: `bots:${project.id}`,
          sessionId: toph.sessionId,
          botId: toph.id,
          botName: toph.name,
          botRole: toph.role,
          text: reply,
        });
      }
      return reply.trim();
    } catch (error) {
      if (error instanceof Error && error.message === "__stopped__") return null;
      if (options.token !== undefined && options.token !== runToken.current) return null;
      const recovered = recoverBotReply(useChats.getState().byProject[project.id]?.messages ?? [], toph.id, toph.chatId, startedAt);
      if (recovered) {
        updateMessage(project.id, recovered.id, { pending: false, status: "complete" });
        return recovered.content.trim();
      }
      const text = error instanceof Error ? error.message : "Não foi possível falar com este Toph.";
      addMessage(project.id, {
        id: `bot-error-${toph.id}-${Date.now()}`,
        chatId: toph.chatId,
        tophId: toph.id,
        role: "error",
        content: text,
        createdAt: Date.now(),
      });
      return null;
    } finally {
      setRunningTophs((current) => {
        const next = new Set(current);
        next.delete(toph.id);
        return next;
      });
    }
  }

  async function answerToolQuestion(toph: ChatToph, messageId: string, answer: string) {
    if (!toph.sessionId) throw new Error("A sessão desta pergunta não está mais ativa.");
    const currentMessage = useChats.getState().byProject[project.id]?.messages.find((message) => message.id === messageId);
    await answerOpenCodeQuestion(client, toph.sessionId, answer);
    updateMessage(project.id, messageId, { detail: answer, status: "complete" });
    addMessage(project.id, {
      id: `bot-user-question-${Date.now()}`,
      chatId: currentMessage?.chatId ?? toph.chatId,
      role: "user",
      content: answer,
      createdAt: Date.now(),
    });
  }

  async function replyPermission(toph: ChatToph, messageId: string, requestId: string, decision: "once" | "always" | "reject") {
    if (!toph.sessionId) return;
    try {
      await client.permission.reply({ sessionID: toph.sessionId, requestID: requestId, decision } as never);
      updateMessage(project.id, messageId, {
        permissionId: undefined,
        content: decision === "reject" ? "Permission rejected." : decision === "always" ? "Permission allowed for this session." : "Permission allowed once.",
        status: "complete",
      });
    } catch {
      // The request may have been answered by another client.
    }
  }

  async function answerForm(form: OpenCodeForm, toph: ChatToph, answer: OpenCodeFormAnswer) {
    if (!toph.sessionId) return;
    setFormBusy(form.id);
    try {
      await client.session.form.reply({ sessionID: toph.sessionId, formID: form.id, answer } as never);
      setForms((current) => current.filter((item) => item.form.id !== form.id));
    } finally {
      setFormBusy(null);
    }
  }

  async function cancelForm(form: OpenCodeForm, toph: ChatToph) {
    if (!toph.sessionId) return;
    setFormBusy(form.id);
    try {
      await client.session.form.cancel({ sessionID: toph.sessionId, formID: form.id, message: "Cancelado pelo usuário" } as never);
      setForms((current) => current.filter((item) => item.form.id !== form.id));
    } finally {
      setFormBusy(null);
    }
  }

  async function stop() {
    runToken.current += 1;
    sendingRef.current = false;
    setSending(false);
    setRunningTophs(new Set());
    for (const toph of tophs) {
      if (toph.sessionId) await client.session.interrupt({ sessionID: toph.sessionId } as never).catch(() => undefined);
    }
  }

  async function send(text: string, attachments: AgentAttachment[] = []) {
    if (!chat || tophs.length === 0 || (!text.trim() && attachments.length === 0) || sendingRef.current || sending) return;
    sendingRef.current = true;
    unlockBotSound();
    stickToBottom.current = true;
    const token = ++runToken.current;
    const userMessageId = `bot-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    addMessage(project.id, {
      id: userMessageId,
      chatId: chat.id,
      role: "user",
      content: text || attachments.map((file) => file.name).join(", "),
      createdAt: Date.now(),
    });
    const accepted = useChats.getState().byProject[project.id]?.messages.some((message) => message.id === userMessageId);
    if (!accepted) {
      sendingRef.current = false;
      return;
    }
    setInput("");
    clearDraft(draftKey);
    setSending(true);
    try {
      const first = coordinator ?? tophs[0];
      if (!first) return;
      const reply = await respondAsToph(first, text, { attachments, token });
      if (!reply || token !== runToken.current) return;
      if (first.coordinator) {
        const direct = mentionedTophs(tophs, text).filter((toph) => toph.id !== first.id);
        const delegated = mentionedTophs(tophs, reply).filter((toph) => toph.id !== first.id);
        const workers = [...new Map([...delegated, ...direct].map((toph) => [toph.id, toph])).values()];
        if (workers.length > 0) {
          const workerReplies = await Promise.all(workers.map(async (worker) => {
            if (token !== runToken.current) return null;
            const workerReply = await respondAsToph(
              worker,
              `Tarefa do coordenador ${first.name}:\n\n${reply}\n\nPedido original do usuário:\n${text}`,
              { attachments, token },
            );
            return workerReply ? `${worker.name}: ${workerReply}` : null;
          }));
          const results = workerReplies.filter((item): item is string => Boolean(item));
          if (results.length > 0 && token === runToken.current) {
            await respondAsToph(
              first,
              `Retornos dos Tophs do chat:\n\n${results.join("\n\n")}\n\nConsolide esses retornos em uma resposta final para o usuário.`,
              { token },
            );
          }
        }
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function openCreateChat() {
    window.dispatchEvent(new CustomEvent("toph:create-chat"));
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 gap-0 overflow-hidden" onPointerDown={unlockBotSound}>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background-full max-[900px]:rounded-none max-[900px]:border-0 max-[900px]:shadow-none min-[901px]:rounded-3xl min-[901px]:border min-[901px]:border-border-button-white min-[901px]:shadow-sidebar">
        {chat ? (
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-separator-border bg-background-secondary-default px-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-background-tertiary-default text-caption-1-semibold text-text-tertiary">#</span>
            <div className="flex min-w-0 flex-1 flex-col">
              <strong className="truncate text-caption-1-semibold text-text-primary">{chat.name}</strong>
              <span className="truncate text-caption-2-regular text-text-tertiary">{chat.description || "Chat dos Tophs"}</span>
            </div>
            <div className="flex shrink-0 items-center -space-x-2">
              {tophs.slice(0, 4).map((toph) => (
                <button key={toph.id} type="button" onClick={() => setConfigTophId(toph.id)} className="rounded-full ring-2 ring-background-secondary-default transition-transform hover:-translate-y-0.5" title={`${toph.name} · ${toph.role}`}>
                  <BotAvatar bot={toph} size={28} />
                </button>
              ))}
              {tophs.length > 4 ? (
                <span className="flex size-7 items-center justify-center rounded-full bg-background-tertiary-default text-[10px] font-medium text-text-tertiary ring-2 ring-background-secondary-default">
                  +{tophs.length - 4}
                </span>
              ) : null}
            </div>
            <Button variant="ghost" size="small" iconOnly={mobile} leadingIcon={mobile ? Plus : MessageSquarePlus} aria-label="Adicionar Toph" title="Adicionar Toph" onClick={() => setGalleryOpen(true)}>
              {mobile ? null : "Adicionar Toph"}
            </Button>
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
            {conversationPage.hasMore || (mobile && activityPage.hasMore) ? (
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
            {!projectChats?.hydrated ? (
              <div className="my-auto flex items-center justify-center gap-2 py-8 text-caption-1-regular text-text-tertiary">
                <LoaderCircle className="size-4 animate-spin" /> Carregando chats...
              </div>
            ) : !chat ? (
              <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-500"><Bot size={22} /></span>
                <strong className="text-title-3-medium text-text-primary">Crie um chat para começar.</strong>
                <p className="max-w-sm text-caption-1-regular leading-relaxed text-text-secondary">Cada chat tem os seus próprios Tophs, com papéis, prompts e ferramentas.</p>
                <Button variant="secondary" size="small" leadingIcon={MessageSquarePlus} onClick={openCreateChat}>Criar chat</Button>
              </div>
            ) : tophs.length === 0 ? (
              <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-500"><Bot size={22} /></span>
                <strong className="text-title-3-medium text-text-primary">Adicione o primeiro Toph.</strong>
                <p className="max-w-sm text-caption-1-regular leading-relaxed text-text-secondary">Escolha um Toph pronto ou crie um livre com o papel que você precisar.</p>
                <Button variant="secondary" size="small" leadingIcon={MessageSquarePlus} onClick={() => setGalleryOpen(true)}>Adicionar Toph</Button>
              </div>
            ) : conversationPage.ready && conversationMessages.length === 0 ? (
              <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center">
                <div className="flex -space-x-2">
                  {tophs.slice(0, 4).map((toph) => <BotAvatar key={toph.id} bot={toph} size={38} className="rounded-full bg-background-primary-default ring-2 ring-background-primary-default" />)}
                </div>
                <strong className="text-title-3-medium text-text-primary">O chat está pronto.</strong>
                <p className="max-w-md text-caption-1-regular leading-relaxed text-text-secondary">Fale com o chat; o coordenador distribui o trabalho e consolida a resposta.</p>
              </div>
            ) : null}

            {groupedMessages.map((group, index) => {
              if (group.kind === "user") {
                const messageToph = coordinator;
                const messageModel = messageToph?.model || activeModel;
                return (
                  <div key={`user-${group.message.id}`} className="ms-auto flex min-w-0 max-w-[88%] flex-col items-end gap-1">
                    <p className="min-w-0 max-w-full overflow-hidden rounded-2xl bg-accent-500 px-3.5 py-2 text-[14px] leading-[1.55] whitespace-pre-wrap break-words text-text-on-accent">{group.message.content}</p>
                    <MessageInfo
                      agentMode={messageToph?.agentMode}
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
              const toph = tophs.find((item) => item.id === group.tophId);
              if (!toph) return null;
              const footerAssistant = [...group.messages].reverse().find((message) => message.role === "assistant" && !message.pending);
              const isLatestTophGroup = lastTophGroupIndex.get(toph.id) === index;
              const belongsToCurrentTurn = latestUserAt === 0 || group.messages.some((message) => message.createdAt >= latestUserAt);
              const groupStreaming = belongsToCurrentTurn && isLatestTophGroup && runningTophs.has(toph.id);
              const hasRunningTool = group.messages.some((message) => (message.role === "tool" || message.role === "reasoning") && message.status === "running");
              const hasAssistantText = group.messages.some((message) => message.role === "assistant" && message.content.trim().length > 0);
              const activityState: TophActivityState | null = groupStreaming || group.messages.some((message) => message.status === "running")
                ? hasRunningTool ? "working" : hasAssistantText ? "responding" : "thinking"
                : null;
              return (
                <section key={`toph-${group.tophId}-${index}`} className="flex min-w-0 max-w-full items-start gap-2.5">
                  <TophActivityAvatar bot={toph} state={activityState} size={32} className="mt-0.5" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <header className="flex min-w-0 items-baseline gap-2">
                      <strong className="truncate text-caption-1-semibold text-text-primary">{toph.name}</strong>
                      <span className="truncate text-caption-2-regular text-text-tertiary">{activityState ? <TophActivityStatus state={activityState} /> : toph.role || "Toph"}</span>
                    </header>
                    <AgentTranscript
                      messages={group.messages.map(toAiMessage)}
                      streaming={groupStreaming}
                      onPermission={(messageId, permissionId, decision) => void replyPermission(toph, messageId, permissionId, decision)}
                      onQuestion={(messageId, answer) => void answerToolQuestion(toph, messageId, answer)}
                      projectId={project.id}
                      projectRoot={project.root}
                    />
                    {footerAssistant ? (
                      <MessageInfo
                        agentMode={toph.agentMode}
                        model={modelDisplay(models.find((item) => item.id === (toph.model || activeModel)) ?? ((toph.model || activeModel) ? { id: toph.model || activeModel, label: (toph.model || activeModel).split("/").pop() ?? (toph.model || activeModel) } : undefined))}
                        createdAt={footerAssistant.createdAt}
                        content={footerAssistant.content}
                        copyLabel="Copiar resposta"
                      />
                    ) : null}
                  </div>
                </section>
              );
            })}

            {visibleRunningTophs
              .filter((tophId) => !groupedMessages.some((group) => group.kind === "toph" && group.tophId === tophId && (latestUserAt === 0 || group.messages.some((message) => message.createdAt >= latestUserAt))))
              .map((tophId) => {
                const toph = tophs.find((item) => item.id === tophId);
                if (!toph) return null;
                return (
                  <section key={`pending-${tophId}`} className="flex min-w-0 max-w-full items-start gap-2.5">
                    <TophActivityAvatar bot={toph} state="thinking" size={32} className="mt-0.5" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <header className="flex min-w-0 items-baseline gap-2">
                        <strong className="truncate text-caption-1-semibold text-text-primary">{toph.name}</strong>
                        <span className="truncate text-caption-2-regular text-text-tertiary"><TophActivityStatus state="thinking" /></span>
                      </header>
                    </div>
                  </section>
                );
              })}

            {mobile ? visibleForms.map(({ form, tophId }) => {
              const toph = tophs.find((item) => item.id === tophId);
              if (!toph) return null;
              return (
                <section key={`form-${form.id}`} className="flex flex-col gap-2">
                  <header className="flex items-center gap-2"><BotAvatar bot={toph} size={28} /><strong className="truncate text-caption-1-semibold text-text-primary">{toph.name}</strong></header>
                  <OpenCodeFormCard form={form} busy={formBusy === form.id} onSubmit={(answer) => void answerForm(form, toph, answer)} onCancel={() => void cancelForm(form, toph)} />
                </section>
              );
            }) : null}
          </div>
        </div>

        {chat && tophs.length > 0 ? (
          <div className="shrink-0">
            <AgentComposer
              value={input}
              onChange={updateInput}
              onSend={(value, attachments) => void send(value, attachments)}
              onStop={() => void stop()}
              busy={sending || runningTophs.size > 0}
              placeholder={`Mensagem em #${chat.name}`}
              modeControls={<AiUsageMeter client={client} refreshKey={`${chat.id}:${completedReplies}`} />}
              history={messages.filter((message) => message.role === "user").map((message) => message.content)}
            />
          </div>
        ) : null}
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
              {visibleRunningTophs.length > 0 ? (
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
              {!chat || tophs.length === 0 ? (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 px-5 text-center">
                  <ListTree className="size-6 text-text-tertiary" />
                  <strong className="text-caption-1-semibold text-text-primary">Nenhuma atividade ainda</strong>
                  <p className="max-w-xs text-caption-2-regular leading-relaxed text-text-tertiary">Quando um Toph começar a trabalhar, cada ação aparecerá aqui.</p>
                </div>
              ) : activityPage.ready && activityGroups.length === 0 && visibleRunningTophs.length === 0 && visibleForms.length === 0 && assistantImages.length === 0 ? (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 px-5 text-center">
                  <ListTree className="size-6 text-text-tertiary" />
                  <strong className="text-caption-1-semibold text-text-primary">Pronto para acompanhar</strong>
                  <p className="max-w-xs text-caption-2-regular leading-relaxed text-text-tertiary">As leituras, edições, comandos e visualizações do navegador serão mostradas em tempo real.</p>
                </div>
              ) : (
                <div className="flex min-w-0 flex-col gap-3">
                  <AgentImageGallery images={assistantImages} title="Imagens da resposta" />
                  {activityGroups.map((group, index) => {
                    if (group.kind !== "toph") return null;
                    const toph = tophs.find((item) => item.id === group.tophId);
                    if (!toph) return null;
                    const latest = lastActivityGroupIndex.get(toph.id) === index;
                    const activityRunning = latest && runningTophs.has(toph.id);
                    const activityState: TophActivityState | null = activityRunning
                      ? group.messages.some((message) => (message.role === "tool" || message.role === "reasoning") && message.status === "running") ? "working" : "thinking"
                      : null;
                    return (
                      <section key={`activity-${toph.id}-${index}`} className="min-w-0 border-b border-separator-border pb-3 last:border-b-0">
                        <header className="mb-1.5 flex items-center gap-2">
                          <TophActivityAvatar bot={toph} state={activityState} size={26} />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <strong className="truncate text-caption-1-semibold text-text-primary">{toph.name}</strong>
                            <span className="truncate text-[10px] text-text-tertiary">{activityState ? <TophActivityStatus state={activityState} /> : toph.role || "Toph"}</span>
                          </div>
                        </header>
                        <AgentTranscript
                          messages={group.messages.map(toAiMessage)}
                          streaming={latest && runningTophs.has(toph.id)}
                          toolsExpanded={latest && runningTophs.has(toph.id)}
                          className="flex min-w-0 flex-col gap-1"
                          onPermission={(messageId, permissionId, decision) => void replyPermission(toph, messageId, permissionId, decision)}
                          onQuestion={(messageId, answer) => void answerToolQuestion(toph, messageId, answer)}
                          projectId={project.id}
                          projectRoot={project.root}
                        />
                      </section>
                    );
                  })}

                  {visibleRunningTophs
                    .filter((tophId) => !activityGroups.some((group) => group.kind === "toph" && group.tophId === tophId))
                    .map((tophId) => {
                      const toph = tophs.find((item) => item.id === tophId);
                      if (!toph) return null;
                      return (
                        <section key={`activity-pending-${toph.id}`} className="border-b border-separator-border pb-3 last:border-b-0">
                          <header className="mb-2 flex items-center gap-2">
                            <TophActivityAvatar bot={toph} state="thinking" size={26} />
                            <div className="flex min-w-0 flex-1 flex-col">
                              <strong className="truncate text-caption-1-semibold text-text-primary">{toph.name}</strong>
                              <span className="truncate text-[10px] text-text-tertiary"><TophActivityStatus state="thinking" /></span>
                            </div>
                          </header>
                        </section>
                      );
                    })}

                  {visibleForms.map(({ form, tophId }) => {
                    const toph = tophs.find((item) => item.id === tophId);
                    if (!toph) return null;
                    return (
                      <section key={`activity-form-${form.id}`} className="flex flex-col gap-2 border-b border-separator-border pb-3 last:border-b-0">
                        <header className="flex items-center gap-2"><BotAvatar bot={toph} size={26} /><strong className="truncate text-caption-1-semibold text-text-primary">{toph.name}</strong></header>
                        <OpenCodeFormCard form={form} busy={formBusy === form.id} onSubmit={(answer) => void answerForm(form, toph, answer)} onCancel={() => void cancelForm(form, toph)} />
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </>
      ) : null}

      <Modal
        isOpen={Boolean(configToph)}
        onClose={() => setConfigTophId(null)}
        title={configToph?.name ?? "Toph"}
        description="Configure identidade, prompt, modelo e ferramentas deste Toph."
        placement={mobile ? "bottom" : "center"}
        size="xl"
        bodyClassName="p-0"
        swipeToClose={mobile}
      >
        {configToph ? <BotConfig projectId={project.id} projectRoot={project.root} bot={configToph} /> : null}
      </Modal>

      <TophGallery
        open={galleryOpen}
        projectId={project.id}
        chatId={chat?.id ?? null}
        onClose={() => setGalleryOpen(false)}
        onCreated={(tophId) => setConfigTophId(tophId)}
      />
    </div>
  );
}
