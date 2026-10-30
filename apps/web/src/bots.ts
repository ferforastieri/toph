import { create } from "zustand";

export type BotAvatar = "shield" | "star" | "diamond" | "blob" | "circle";
export type BotLanguage = "auto" | "pt" | "en" | "es";

export interface MiniBot {
  id: string;
  name: string;
  handle: string;
  role: string;
  description: string;
  personality: string;
  model: string;
  effort?: string;
  language: BotLanguage;
  color: string;
  avatar: BotAvatar;
  notifications: boolean;
  coordinator: boolean;
  sessionId?: string;
  createdAt: number;
}

export interface BotMessage {
  id: string;
  role: "user" | "assistant" | "reasoning" | "tool" | "system" | "error";
  content: string;
  botId?: string;
  title?: string;
  detail?: string;
  status?: "running" | "complete" | "error";
  permissionId?: string;
  permissionAction?: string;
  sessionId?: string;
  pending?: boolean;
  createdAt: number;
}

export interface BotWorkspace {
  version?: number;
  bots: MiniBot[];
  messages: BotMessage[];
  activeBotId: string | null;
}

interface BotStore {
  byProject: Record<string, BotWorkspace>;
  load: (projectId: string, workspace?: BotWorkspace | null) => void;
  ensure: (projectId: string) => BotWorkspace;
  snapshot: (projectId: string) => BotWorkspace | null;
  setActiveBot: (projectId: string, botId: string | null) => void;
  addBot: (projectId: string, bot?: Partial<MiniBot>) => MiniBot;
  updateBot: (projectId: string, botId: string, patch: Partial<MiniBot>) => void;
  removeBot: (projectId: string, botId: string) => void;
  addMessage: (projectId: string, message: BotMessage) => void;
  appendMessage: (projectId: string, messageId: string, text: string) => void;
  updateMessage: (projectId: string, messageId: string, patch: Partial<BotMessage>) => void;
  removeMessage: (projectId: string, messageId: string) => void;
}

export const BOT_COLORS = [
  "#B9DE7A",
  "#A8DDE8",
  "#D6C4F2",
  "#FFB547",
  "#F3A6A0",
  "#7CC7B0",
  "#8FB5F5",
  "#E7C96F",
];

export function slugifyBot(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function uniqueHandle(bots: MiniBot[], desired: string): string {
  const base = slugifyBot(desired) || "bot";
  let candidate = base;
  let index = 2;
  while (bots.some((bot) => bot.handle === candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function newId(prefix: string): string {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${value}`;
}

function sanitizeWorkspace(workspace: BotWorkspace): BotWorkspace {
  const bots = (workspace.bots ?? [])
    .filter((bot) => bot && typeof bot.id === "string" && typeof bot.name === "string")
    .map((bot) => ({
      ...bot,
      handle: bot.handle || slugifyBot(bot.name),
      role: bot.role ?? "",
      description: bot.description ?? "",
      personality: bot.personality ?? "",
      model: bot.model ?? "",
      effort: bot.effort ?? "",
      language: (["auto", "pt", "en", "es"].includes(bot.language) ? bot.language : "auto") as BotLanguage,
      color: bot.color || BOT_COLORS[0],
      avatar: (["shield", "star", "diamond", "blob", "circle"].includes(bot.avatar) ? bot.avatar : "shield") as BotAvatar,
      notifications: bot.notifications !== false,
      coordinator: bot.coordinator === true,
      createdAt: bot.createdAt ?? Date.now(),
    }));
  const messages = (workspace.messages ?? [])
    .filter((message) => message && typeof message.id === "string")
    .map((message) => ({
      ...message,
      role: (["user", "assistant", "reasoning", "tool", "system", "error"].includes(message.role) ? message.role : "system") as BotMessage["role"],
      content: message.content ?? "",
      pending: false,
      createdAt: message.createdAt ?? Date.now(),
    }))
    .slice(-200);
  const legacyNames = new Set([
    "Design + Marketing + Produto",
    "Designer de landing pages",
    "Bot de marketing",
    "Revisor de conteúdo",
  ]);
  const legacyDefaults = workspace.version === undefined
    && bots.length === 4
    && bots.every((bot) => legacyNames.has(bot.name));
  const nextBots = legacyDefaults ? [] : bots;
  const activeBotId = nextBots.some((bot) => bot.id === workspace.activeBotId)
    ? workspace.activeBotId
    : (nextBots[0]?.id ?? null);
  return { version: 2, bots: nextBots, messages: legacyDefaults ? [] : messages, activeBotId };
}

function createEmptyWorkspace(): BotWorkspace {
  return { version: 2, bots: [], messages: [], activeBotId: null };
}

export const useBots = create<BotStore>((set, get) => ({
  byProject: {},

  load: (projectId, workspace) => {
    if (!workspace || !Array.isArray(workspace.bots) || workspace.bots.length === 0) {
      const next = createEmptyWorkspace();
      set((state) => ({ byProject: { ...state.byProject, [projectId]: next } }));
      return;
    }
    const next = sanitizeWorkspace(workspace);
    set((state) => ({ byProject: { ...state.byProject, [projectId]: next } }));
  },

  ensure: (projectId) => {
    const existing = get().byProject[projectId];
    if (existing) return existing;
    const next = createEmptyWorkspace();
    set((state) => ({ byProject: { ...state.byProject, [projectId]: next } }));
    return next;
  },

  snapshot: (projectId) => {
    const workspace = get().byProject[projectId];
    if (!workspace) return null;
    return {
      version: 2,
      bots: workspace.bots,
      activeBotId: workspace.activeBotId,
      messages: workspace.messages.filter((message) => !message.pending).slice(-200),
    };
  },

  setActiveBot: (projectId, activeBotId) =>
    set((state) => {
      const workspace = state.byProject[projectId];
      if (!workspace) return state;
      return { byProject: { ...state.byProject, [projectId]: { ...workspace, activeBotId } } };
    }),

  addBot: (projectId, patch = {}) => {
    const workspace = get().ensure(projectId);
    const name = patch.name?.trim() || "Novo bot";
    const bot: MiniBot = {
      id: newId("bot"),
      name,
      handle: uniqueHandle(workspace.bots, patch.handle || name),
      role: patch.role ?? "Especialista",
      description: patch.description ?? "",
      personality: patch.personality ?? "",
      model: patch.model ?? "",
      effort: patch.effort ?? "",
      language: patch.language ?? "auto",
      color: patch.color ?? BOT_COLORS[workspace.bots.length % BOT_COLORS.length],
      avatar: patch.avatar ?? "blob",
      notifications: patch.notifications !== false,
      coordinator: patch.coordinator === true,
      sessionId: patch.sessionId,
      createdAt: Date.now(),
    };
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: {
          ...workspace,
          bots: [...workspace.bots, bot],
          activeBotId: bot.id,
        },
      },
    }));
    return bot;
  },

  updateBot: (projectId, botId, patch) =>
    set((state) => {
      const workspace = state.byProject[projectId];
      if (!workspace) return state;
      const bots = workspace.bots.map((bot) => {
        if (bot.id !== botId) {
          return patch.coordinator === true ? { ...bot, coordinator: false } : bot;
        }
        const nextName = patch.name?.trim() || bot.name;
        return {
          ...bot,
          ...patch,
          name: nextName,
          handle: patch.name
            ? uniqueHandle(workspace.bots.filter((item) => item.id !== botId), nextName)
            : bot.handle,
        };
      });
      return { byProject: { ...state.byProject, [projectId]: { ...workspace, bots } } };
    }),

  removeBot: (projectId, botId) =>
    set((state) => {
      const workspace = state.byProject[projectId];
      if (!workspace) return state;
      const bots = workspace.bots.filter((bot) => bot.id !== botId);
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...workspace,
            bots,
            activeBotId: workspace.activeBotId === botId ? (bots[0]?.id ?? null) : workspace.activeBotId,
            messages: workspace.messages.filter((message) => message.botId !== botId),
          },
        },
      };
    }),

  addMessage: (projectId, message) =>
    set((state) => {
      const workspace = state.byProject[projectId];
      if (!workspace) return state;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: { ...workspace, messages: [...workspace.messages, message].slice(-200) },
        },
      };
    }),

  appendMessage: (projectId, messageId, text) =>
    set((state) => {
      const workspace = state.byProject[projectId];
      if (!workspace) return state;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...workspace,
            messages: workspace.messages.map((message) => message.id === messageId ? { ...message, content: message.content + text } : message),
          },
        },
      };
    }),

  updateMessage: (projectId, messageId, patch) =>
    set((state) => {
      const workspace = state.byProject[projectId];
      if (!workspace) return state;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...workspace,
            messages: workspace.messages.map((message) => message.id === messageId ? { ...message, ...patch } : message),
          },
        },
      };
    }),

  removeMessage: (projectId, messageId) =>
    set((state) => {
      const workspace = state.byProject[projectId];
      if (!workspace) return state;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...workspace,
            messages: workspace.messages.filter((message) => message.id !== messageId),
          },
        },
      };
    }),
}));
