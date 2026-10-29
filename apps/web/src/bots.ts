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
  role: "user" | "assistant" | "system" | "error";
  content: string;
  botId?: string;
  pending?: boolean;
  createdAt: number;
}

export interface BotWorkspace {
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

function defaultBots(): MiniBot[] {
  const created = Date.now();
  const seed = [
    {
      name: "Design + Marketing + Produto",
      role: "Coordenação",
      description: "Coordena o time e distribui o trabalho.",
      personality: "Pragmático, direto e organizado. Divide o trabalho entre os especialistas e cobra clareza no resultado.",
      color: BOT_COLORS[0],
      avatar: "shield" as BotAvatar,
      coordinator: true,
    },
    {
      name: "Designer de landing pages",
      role: "Design",
      description: "Layouts claros, hierarquia e identidade visual.",
      personality: "Criativo e obsessivo com detalhes. Pensa em hierarquia, contraste, espaçamento e conversão.",
      color: BOT_COLORS[1],
      avatar: "star" as BotAvatar,
      coordinator: false,
    },
    {
      name: "Bot de marketing",
      role: "Marketing",
      description: "Campanhas, posicionamento e copy.",
      personality: "Estratégico e persuasivo. Gosta de testar ângulos, escrever copy afiada e medir resultado.",
      color: BOT_COLORS[2],
      avatar: "diamond" as BotAvatar,
      coordinator: false,
    },
    {
      name: "Revisor de conteúdo",
      role: "Conteúdo",
      description: "Revisa clareza, tom e consistência.",
      personality: "Editor criterioso. Corta excesso, corrige inconsistências e mantém a voz da marca.",
      color: BOT_COLORS[3],
      avatar: "blob" as BotAvatar,
      coordinator: false,
    },
  ];

  return seed.map((bot) => ({
    ...bot,
    id: newId("bot"),
    handle: slugifyBot(bot.name),
    model: "",
    language: "auto" as BotLanguage,
    notifications: true,
    createdAt: created,
  }));
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
      language: (["auto", "pt", "en", "es"].includes(bot.language) ? bot.language : "auto") as BotLanguage,
      color: bot.color || BOT_COLORS[0],
      avatar: (["shield", "star", "diamond", "blob", "circle"].includes(bot.avatar) ? bot.avatar : "shield") as BotAvatar,
      notifications: bot.notifications !== false,
      coordinator: bot.coordinator === true,
      createdAt: bot.createdAt ?? Date.now(),
    }));
  const activeBotId = bots.some((bot) => bot.id === workspace.activeBotId)
    ? workspace.activeBotId
    : (bots[0]?.id ?? null);
  const messages = (workspace.messages ?? [])
    .filter((message) => message && typeof message.id === "string")
    .map((message) => ({
      ...message,
      role: (["user", "assistant", "system", "error"].includes(message.role) ? message.role : "system") as BotMessage["role"],
      content: message.content ?? "",
      pending: false,
      createdAt: message.createdAt ?? Date.now(),
    }))
    .slice(-200);
  return { bots, messages, activeBotId };
}

function createDefaultWorkspace(): BotWorkspace {
  const bots = defaultBots();
  return { bots, messages: [], activeBotId: bots[0]?.id ?? null };
}

export const useBots = create<BotStore>((set, get) => ({
  byProject: {},

  load: (projectId, workspace) => {
    if (!workspace || !Array.isArray(workspace.bots) || workspace.bots.length === 0) {
      const next = createDefaultWorkspace();
      set((state) => ({ byProject: { ...state.byProject, [projectId]: next } }));
      return;
    }
    const next = sanitizeWorkspace(workspace);
    set((state) => ({ byProject: { ...state.byProject, [projectId]: next } }));
  },

  ensure: (projectId) => {
    const existing = get().byProject[projectId];
    if (existing) return existing;
    const next = createDefaultWorkspace();
    set((state) => ({ byProject: { ...state.byProject, [projectId]: next } }));
    return next;
  },

  snapshot: (projectId) => {
    const workspace = get().byProject[projectId];
    if (!workspace) return null;
    return {
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
