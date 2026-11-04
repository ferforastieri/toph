import { create } from "zustand";
import { BOT_AVATARS, type BotAvatar, type BotLanguage } from "./bots";

export const DEFAULT_TOPH_COLOR = "#FFB547";

export type TophAgentMode = "build" | "plan";
export type TophPermissionMode = "yolo" | "ask" | "deny";

export interface ChatToph {
  id: string;
  chatId: string;
  name: string;
  handle: string;
  role: string;
  description: string;
  personality: string;
  prompt: string;
  model: string;
  effort: string;
  agentMode: TophAgentMode;
  permissionMode: TophPermissionMode;
  mcpServers: string[];
  emailAccountIds: string[];
  language: BotLanguage;
  color: string;
  avatar: BotAvatar;
  notifications: boolean;
  coordinator: boolean;
  sessionId?: string;
  sessionPrimed?: boolean;
  createdAt: number;
}

export interface TophChat {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "reasoning" | "tool" | "system" | "error";
  tophId?: string;
  content: string;
  title?: string;
  detail?: string;
  status?: "running" | "complete" | "error";
  permissionId?: string;
  permissionAction?: string;
  sessionId?: string;
  pending?: boolean;
  durationMs?: number;
  createdAt: number;
}

export interface ProjectChats {
  version: 1;
  chats: TophChat[];
  tophs: ChatToph[];
  messages: ChatMessage[];
  activeChatId: string | null;
  hydrated?: boolean;
}

export type ProjectChatsSnapshot = Omit<ProjectChats, "messages" | "hydrated">;

export interface TophPreset {
  name: string;
  role: string;
  description: string;
  personality: string;
  prompt: string;
  color: string;
  avatar: BotAvatar;
  coordinator?: boolean;
  model?: string;
  effort?: string;
  agentMode?: TophAgentMode;
  permissionMode?: TophPermissionMode;
  mcpServers?: string[];
  emailAccountIds?: string[];
  language?: BotLanguage;
}

function preset(
  name: string,
  role: string,
  description: string,
  personality: string,
  color: string,
  avatar: BotAvatar,
  extra: Partial<TophPreset> = {},
): TophPreset {
  return {
    name,
    role,
    description,
    personality,
    prompt: `Você é ${name}, ${role}. ${description} ${personality}`,
    color,
    avatar,
    agentMode: "build",
    permissionMode: "yolo",
    mcpServers: [],
    emailAccountIds: [],
    language: "auto",
    ...extra,
  };
}

/** Pre-made Tophs. They carry their own role prompt and default tool policy. */
export const TOPH_PRESETS: TophPreset[] = [
  preset("Toph", "Assistente", "Seu agente pessoal para conversar, programar e executar tarefas.", "Direto, curioso e focado em resolver o problema.", "#B9DE7A", "toph-core", { coordinator: true }),
  preset("Leo", "Dev", "Implementa, refatora e resolve bugs no código.", "Pragmático, direto e cuidadoso com regressões.", "#8FB5F5", "toph-forge"),
  preset("Nico", "Revisor", "Revisa código, aponta riscos e exige testes.", "Cético, detalhista e construtivo.", "#C7A3FF", "toph-prism", { agentMode: "plan", permissionMode: "ask" }),
  preset("Nova", "Produto", "Transforma pedidos vagos em escopo e critérios de aceite.", "Curiosa, objetiva e implacável com ambiguidade.", "#FF9EC4", "toph-nova", { agentMode: "plan", permissionMode: "ask" }),
  preset("Bia", "Dados", "Investiga dados, métricas e consultas.", "Analítica, paciente e orientada a evidências.", "#84E0C2", "toph-tide"),
  preset("Pia", "Design", "Cuida de interface, consistência visual e experiência.", "Sensível ao detalhe e direta no feedback.", "#D8B4FE", "toph-kite"),
  preset("Lia", "QA", "Cria casos de teste e caça regressões.", "Desconfiada por princípio e obcecada por reprodução.", "#FDA4AF", "toph-comet", { permissionMode: "ask" }),
  preset("Theo", "Infra", "Cuida de containers, deploy, logs e observabilidade.", "Metódico, direto e avesso a mudanças sem rollback.", "#93C5FD", "toph-pulse"),
  preset("Caio", "Segurança", "Revisa permissões, segredos e superfícies de ataque.", "Cauteloso, preciso e sem alarmismo.", "#FCD34D", "toph-portal", { agentMode: "plan", permissionMode: "ask" }),
  preset("Vera", "Documentação", "Mantém README, guias e decisões técnicas.", "Clara, paciente e alérgica a texto vago.", "#A8DDE8", "toph-pebble"),
  preset("Dante", "Backend", "APIs, banco de dados e integrações.", "Sistemático, curioso e focado em contratos.", "#F08C72", "toph-cube"),
  preset("Iris", "Frontend", "Implementa interfaces acessíveis e responsivas.", "Detalhista, visual e atenta a estados de erro.", "#8CD3B4", "toph-bloom"),
  preset("Otto", "Automação", "Scripts, rotinas e integrações entre ferramentas.", "Prático, resiliente e inimigo de trabalho manual.", "#F7B267", "toph-forge"),
  preset("Rafa", "Suporte", "Responde tickets e transforma bugs em issues claras.", "Empática, organizada e rápida no diagnóstico.", "#FFD166", "toph-nimbus"),
  preset("Maya", "Pesquisa", "Explora código, documentação e referências externas.", "Investigativa e cética com respostas fáceis.", "#6EE7B7", "toph-grove"),
  preset("Nina", "Arquitetura", "Desenha limites, dependências e decisões estruturais.", "Sistêmica, questionadora e econômica nas escolhas.", "#FFB547", "toph-prism", { agentMode: "plan", permissionMode: "ask" }),
  preset("Ravi", "Mobile", "Cuida de Android, iOS e experiência em movimento.", "Pragmático, atento a performance e gestos.", "#F28BA8", "toph-echo"),
  preset("Luna", "Conteúdo", "Escreve, revisa e adapta textos para cada canal.", "Criativa, direta e atenta ao tom da marca.", "#B8E986", "toph-luna"),
  preset("Zoe", "Growth", "Testa hipóteses, funis e experimentos.", "Orientada a métrica, rápida e transparente.", "#9BB7FF", "toph-spark"),
  preset("Atlas", "Coordenador", "Organiza o chat, distribui tarefas e cobra o fechamento.", "Estratégico, calmo e obcecado por clareza.", "#7FD4E8", "toph-peak", { coordinator: true }),
];

function newId(prefix: string): string {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${value}`;
}

export function slugifyToph(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function generatedAvatarFor(name: string): BotAvatar {
  if (slugifyToph(name) === "toph") return "toph-core";
  let hash = 2166136261;
  for (const character of name) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return BOT_AVATARS[Math.abs(hash) % BOT_AVATARS.length] ?? "toph-core";
}

function uniqueName(desired: string, used: Set<string>): string {
  const base = desired.trim() || "Toph";
  let name = base;
  let index = 2;
  while (used.has(name.toLowerCase())) {
    name = `${base} ${index}`;
    index += 1;
  }
  return name;
}

function uniqueHandle(desired: string, used: Set<string>): string {
  const base = slugifyToph(desired) || "toph";
  let handle = base;
  let index = 2;
  while (used.has(handle)) {
    handle = `${base}-${index}`;
    index += 1;
  }
  return handle;
}

function normalizeToph(toph: ChatToph, chatId: string): ChatToph {
  const name = toph.name?.trim() || "Toph";
  return {
    ...toph,
    chatId,
    name,
    handle: toph.handle || slugifyToph(name),
    role: toph.role?.trim() || "Toph",
    description: toph.description ?? "",
    personality: toph.personality ?? "",
    prompt: toph.prompt ?? "",
    model: toph.model ?? "",
    effort: toph.effort ?? "",
    agentMode: toph.agentMode === "plan" ? "plan" : "build",
    permissionMode: toph.permissionMode === "ask" || toph.permissionMode === "deny" ? toph.permissionMode : "yolo",
    mcpServers: Array.isArray(toph.mcpServers) ? toph.mcpServers.filter((item): item is string => typeof item === "string") : [],
    emailAccountIds: Array.isArray(toph.emailAccountIds) ? toph.emailAccountIds.filter((item): item is string => typeof item === "string") : [],
    language: toph.language === "pt" || toph.language === "en" || toph.language === "es" ? toph.language : "auto",
    color: toph.color || DEFAULT_TOPH_COLOR,
    avatar: BOT_AVATARS.includes(toph.avatar) ? toph.avatar : generatedAvatarFor(name),
    notifications: toph.notifications !== false,
    coordinator: toph.coordinator === true,
    sessionId: typeof toph.sessionId === "string" && toph.sessionId ? toph.sessionId : undefined,
    sessionPrimed: toph.sessionPrimed === true,
    createdAt: Number.isFinite(toph.createdAt) ? toph.createdAt : Date.now(),
  };
}

function normalizeMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    content: typeof message.content === "string" ? message.content : "",
    createdAt: Number.isFinite(message.createdAt) ? message.createdAt : Date.now(),
    pending: message.pending === true,
  };
}

function sanitizeProject(input: ProjectChats | null | undefined): ProjectChats {
  if (!input) return { version: 1, chats: [], tophs: [], messages: [], activeChatId: null, hydrated: true };
  const chats = (Array.isArray(input.chats) ? input.chats : [])
    .filter((chat): chat is TophChat => Boolean(chat && typeof chat.id === "string" && chat.id))
    .map((chat) => ({
      id: chat.id,
      name: chat.name?.trim() || "Novo chat",
      description: chat.description ?? "",
      createdAt: Number.isFinite(chat.createdAt) ? chat.createdAt : Date.now(),
      updatedAt: Number.isFinite(chat.updatedAt) ? chat.updatedAt : Date.now(),
    }));
  const chatIds = new Set(chats.map((chat) => chat.id));
  const tophs = (Array.isArray(input.tophs) ? input.tophs : [])
    .filter((toph): toph is ChatToph => Boolean(toph && typeof toph.id === "string" && chatIds.has(toph.chatId)))
    .map((toph) => normalizeToph(toph, toph.chatId));

  for (const chat of chats) {
    const members = tophs.filter((toph) => toph.chatId === chat.id);
    const handles = new Set<string>();
    for (const toph of members) {
      toph.handle = uniqueHandle(toph.handle || toph.name, handles);
      handles.add(toph.handle);
    }
    if (members.length > 0) {
      const coordinator = members.find((toph) => toph.coordinator) ?? members[0];
      for (const toph of members) toph.coordinator = toph.id === coordinator.id;
    }
  }

  const tophIds = new Set(tophs.map((toph) => toph.id));
  const messages = (Array.isArray(input.messages) ? input.messages : [])
    .filter((message): message is ChatMessage => Boolean(
      message &&
      typeof message.id === "string" &&
      chatIds.has(message.chatId) &&
      (!message.tophId || tophIds.has(message.tophId)),
    ))
    .map(normalizeMessage)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  const activeChatId = chats.some((chat) => chat.id === input.activeChatId)
    ? input.activeChatId
    : chats[0]?.id ?? null;

  return { version: 1, chats, tophs, messages, activeChatId, hydrated: true };
}

function emptyProject(hydrated = false): ProjectChats {
  return { version: 1, chats: [], tophs: [], messages: [], activeChatId: null, hydrated };
}

function queueWrite(
  writes: Record<string, Record<string, ChatMessage>>,
  projectId: string,
  message: ChatMessage,
): Record<string, Record<string, ChatMessage>> {
  if (message.pending) return writes;
  return { ...writes, [projectId]: { ...(writes[projectId] ?? {}), [message.id]: message } };
}

function removeWritesForChat(
  writes: Record<string, Record<string, ChatMessage>>,
  projectId: string,
  chatId: string,
): Record<string, Record<string, ChatMessage>> {
  const pending = Object.fromEntries(
    Object.entries(writes[projectId] ?? {}).filter(([, message]) => message.chatId !== chatId),
  );
  return { ...writes, [projectId]: pending };
}

interface ChatStore {
  byProject: Record<string, ProjectChats>;
  messageWrites: Record<string, Record<string, ChatMessage>>;
  load: (projectId: string, chats?: ProjectChats | null) => void;
  ensure: (projectId: string) => ProjectChats;
  snapshot: (projectId: string) => ProjectChatsSnapshot | null;
  unload: (projectId: string) => void;
  forget: (projectId: string) => void;
  createChat: (projectId: string, name: string, description?: string) => TophChat;
  updateChat: (projectId: string, chatId: string, patch: Partial<Pick<TophChat, "name" | "description">>) => void;
  deleteChat: (projectId: string, chatId: string) => void;
  setActiveChat: (projectId: string, chatId: string | null) => void;
  addToph: (projectId: string, chatId: string, preset: TophPreset) => ChatToph | null;
  updateToph: (projectId: string, tophId: string, patch: Partial<ChatToph>) => void;
  removeToph: (projectId: string, tophId: string) => void;
  setTophSession: (
    projectId: string,
    tophId: string,
    sessionId: string | undefined,
    options?: { sessionPrimed?: boolean; messages?: ChatMessage[] },
  ) => void;
  addMessage: (projectId: string, message: ChatMessage) => void;
  appendMessage: (projectId: string, messageId: string, text: string) => void;
  updateMessage: (projectId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  removeMessage: (projectId: string, messageId: string) => void;
  mergeMessages: (projectId: string, messages: ChatMessage[]) => void;
  replaceChatMessages: (projectId: string, chatId: string, messages: ChatMessage[]) => void;
  pendingMessageWrites: (projectId: string) => ChatMessage[];
  acknowledgeMessageWrites: (projectId: string, messages: ChatMessage[]) => void;
  discardMessageWrites: (projectId: string, chatId: string) => void;
}

export const useChats = create<ChatStore>((set, get) => ({
  byProject: {},
  messageWrites: {},

  load: (projectId, chats) => {
    set((state) => ({ byProject: { ...state.byProject, [projectId]: sanitizeProject(chats) } }));
  },

  ensure: (projectId) => {
    const existing = get().byProject[projectId];
    if (existing) return existing;
    const next = emptyProject();
    set((state) => ({ byProject: { ...state.byProject, [projectId]: next } }));
    return next;
  },

  snapshot: (projectId) => {
    const project = get().byProject[projectId];
    if (!project) return null;
    return {
      version: 1,
      chats: project.chats,
      tophs: project.tophs,
      activeChatId: project.activeChatId,
    };
  },

  unload: (projectId) =>
    set((state) => {
      const byProject = { ...state.byProject };
      delete byProject[projectId];
      return { byProject };
    }),

  forget: (projectId) =>
    set((state) => {
      const byProject = { ...state.byProject };
      const messageWrites = { ...state.messageWrites };
      delete byProject[projectId];
      delete messageWrites[projectId];
      return { byProject, messageWrites };
    }),

  createChat: (projectId, name, description = "") => {
    const project = get().ensure(projectId);
    const now = Date.now();
    const chat: TophChat = {
      id: newId("chat"),
      name: name.trim() || "Novo chat",
      description: description.trim(),
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: {
          ...project,
          chats: [...project.chats, chat],
          activeChatId: chat.id,
        },
      },
    }));
    return chat;
  },

  updateChat: (projectId, chatId, patch) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...project,
            chats: project.chats.map((chat) =>
              chat.id === chatId
                ? {
                    ...chat,
                    ...patch,
                    name: patch.name?.trim() || chat.name,
                    description: patch.description === undefined ? chat.description : patch.description.trim(),
                    updatedAt: Date.now(),
                  }
                : chat,
            ),
          },
        },
      };
    }),

  deleteChat: (projectId, chatId) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      const chats = project.chats.filter((chat) => chat.id !== chatId);
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...project,
            chats,
            tophs: project.tophs.filter((toph) => toph.chatId !== chatId),
            messages: project.messages.filter((message) => message.chatId !== chatId),
            activeChatId: project.activeChatId === chatId ? chats[0]?.id ?? null : project.activeChatId,
          },
        },
        messageWrites: removeWritesForChat(state.messageWrites, projectId, chatId),
      };
    }),

  setActiveChat: (projectId, chatId) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project || project.activeChatId === chatId) return state;
      return {
        byProject: { ...state.byProject, [projectId]: { ...project, activeChatId: chatId } },
      };
    }),

  addToph: (projectId, chatId, preset) => {
    const project = get().ensure(projectId);
    if (!project.chats.some((chat) => chat.id === chatId)) return null;
    const members = project.tophs.filter((toph) => toph.chatId === chatId);
    const role = preset.role.trim() || "Toph";
    if (members.some((toph) => toph.role.trim().toLowerCase() === role.toLowerCase())) return null;
    const names = new Set(members.map((toph) => toph.name.toLowerCase()));
    const handles = new Set(members.map((toph) => toph.handle));
    const name = uniqueName(preset.name, names);
    const handle = uniqueHandle(name, handles);
    const coordinator = members.length === 0 || (preset.coordinator === true && !members.some((toph) => toph.coordinator));
    const toph: ChatToph = {
      id: newId("toph"),
      chatId,
      name,
      handle,
      role,
      description: preset.description ?? "",
      personality: preset.personality ?? "",
      prompt: preset.prompt ?? "",
      model: preset.model ?? "",
      effort: preset.effort ?? "",
      agentMode: preset.agentMode === "plan" ? "plan" : "build",
      permissionMode: preset.permissionMode === "ask" || preset.permissionMode === "deny" ? preset.permissionMode : "yolo",
      mcpServers: [...(preset.mcpServers ?? [])],
      emailAccountIds: [...(preset.emailAccountIds ?? [])],
      language: preset.language ?? "auto",
      color: preset.color || DEFAULT_TOPH_COLOR,
      avatar: BOT_AVATARS.includes(preset.avatar) ? preset.avatar : generatedAvatarFor(name),
      notifications: true,
      coordinator,
      createdAt: Date.now(),
    };
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: {
          ...project,
          tophs: [
            ...project.tophs.map((item) =>
              coordinator && item.chatId === chatId ? { ...item, coordinator: false } : item,
            ),
            toph,
          ],
        },
      },
    }));
    return toph;
  },

  updateToph: (projectId, tophId, patch) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      const target = project.tophs.find((toph) => toph.id === tophId);
      if (!target) return state;
      const members = project.tophs.filter((toph) => toph.chatId === target.chatId);
      const name = patch.name?.trim() || target.name;
      const role = patch.role === undefined ? target.role : patch.role.trim() || "Toph";
      const duplicateRole = patch.role !== undefined && members.some((toph) => toph.id !== tophId && toph.role.trim().toLowerCase() === role.toLowerCase());
      const handles = new Set(members.filter((toph) => toph.id !== tophId).map((toph) => toph.handle));
      const handle = patch.name ? uniqueHandle(name, handles) : target.handle;
      const replacement = patch.coordinator === false && target.coordinator
        ? members.find((toph) => toph.id !== tophId) ?? null
        : null;
      const coordinator = patch.coordinator === false && target.coordinator
        ? replacement !== null
        : patch.coordinator === true || target.coordinator;
      const tophs = project.tophs.map((toph) => {
        if (toph.id === tophId) {
          return {
            ...toph,
            ...patch,
            name,
            handle,
            coordinator,
            role: duplicateRole ? toph.role : role,
          };
        }
        if (coordinator && toph.chatId === target.chatId) return { ...toph, coordinator: false };
        if (replacement?.id === toph.id) return { ...toph, coordinator: true };
        return toph;
      });
      return { byProject: { ...state.byProject, [projectId]: { ...project, tophs } } };
    }),

  removeToph: (projectId, tophId) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      const target = project.tophs.find((toph) => toph.id === tophId);
      if (!target) return state;
      const replacement = target.coordinator
        ? project.tophs.find((toph) => toph.chatId === target.chatId && toph.id !== tophId) ?? null
        : null;
      const remaining = project.tophs
        .filter((toph) => toph.id !== tophId)
        .map((toph) => replacement?.id === toph.id ? { ...toph, coordinator: true } : toph);
      const removedMessages = project.messages.filter((message) => message.tophId === tophId);
      const messages = project.messages.filter((message) => message.tophId !== tophId);
      const removedIds = new Set(removedMessages.map((message) => message.id));
      const pending = Object.fromEntries(
        Object.entries(state.messageWrites[projectId] ?? {}).filter(([id]) => !removedIds.has(id)),
      );
      return {
        byProject: {
          ...state.byProject,
          [projectId]: { ...project, tophs: remaining, messages },
        },
        messageWrites: { ...state.messageWrites, [projectId]: pending },
      };
    }),

  setTophSession: (projectId, tophId, sessionId, options) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      const target = project.tophs.find((toph) => toph.id === tophId);
      if (!target) return state;
      const tophs = project.tophs.map((toph) =>
        toph.id === tophId
          ? { ...toph, sessionId, sessionPrimed: options?.sessionPrimed ?? toph.sessionPrimed }
          : toph,
      );
      let messages = project.messages;
      if (options?.messages) {
        const replacement = options.messages;
        messages = [
          ...project.messages.filter((message) => message.tophId !== tophId),
          ...replacement,
        ].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      }
      return { byProject: { ...state.byProject, [projectId]: { ...project, tophs, messages } } };
    }),

  addMessage: (projectId, message) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project || project.messages.some((item) => item.id === message.id)) return state;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: { ...project, messages: [...project.messages, message].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)) },
        },
        messageWrites: queueWrite(state.messageWrites, projectId, message),
      };
    }),

  appendMessage: (projectId, messageId, text) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      let changed: ChatMessage | null = null;
      const messages = project.messages.map((message) => {
        if (message.id !== messageId) return message;
        changed = { ...message, content: `${message.content}${text}` };
        return changed;
      });
      return {
        byProject: { ...state.byProject, [projectId]: { ...project, messages } },
        messageWrites: changed ? queueWrite(state.messageWrites, projectId, changed) : state.messageWrites,
      };
    }),

  updateMessage: (projectId, messageId, patch) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      let changed: ChatMessage | null = null;
      const messages = project.messages.map((message) => {
        if (message.id !== messageId) return message;
        changed = { ...message, ...patch };
        return changed;
      });
      return {
        byProject: { ...state.byProject, [projectId]: { ...project, messages } },
        messageWrites: changed ? queueWrite(state.messageWrites, projectId, changed) : state.messageWrites,
      };
    }),

  removeMessage: (projectId, messageId) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      const pending = { ...(state.messageWrites[projectId] ?? {}) };
      delete pending[messageId];
      return {
        byProject: {
          ...state.byProject,
          [projectId]: { ...project, messages: project.messages.filter((message) => message.id !== messageId) },
        },
        messageWrites: { ...state.messageWrites, [projectId]: pending },
      };
    }),

  mergeMessages: (projectId, incoming) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project || incoming.length === 0) return state;
      const byId = new Map(project.messages.map((message) => [message.id, message]));
      for (const message of incoming) byId.set(message.id, message);
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...project,
            messages: [...byId.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
          },
        },
      };
    }),

  replaceChatMessages: (projectId, chatId, messages) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...project,
            messages: [
              ...project.messages.filter((message) => message.chatId !== chatId),
              ...messages,
            ].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
          },
        },
        messageWrites: removeWritesForChat(state.messageWrites, projectId, chatId),
      };
    }),

  pendingMessageWrites: (projectId) => Object.values(get().messageWrites[projectId] ?? {}),

  acknowledgeMessageWrites: (projectId, messages) =>
    set((state) => {
      const pending = { ...(state.messageWrites[projectId] ?? {}) };
      for (const message of messages) {
        if (pending[message.id] === message) delete pending[message.id];
      }
      return { messageWrites: { ...state.messageWrites, [projectId]: pending } };
    }),

  discardMessageWrites: (projectId, chatId) =>
    set((state) => ({ messageWrites: removeWritesForChat(state.messageWrites, projectId, chatId) })),
}));

export function chatSessionIds(project: ProjectChats | undefined): string[] {
  if (!project) return [];
  const ids = new Set<string>();
  for (const toph of project.tophs) {
    if (toph.sessionId) ids.add(toph.sessionId);
  }
  return [...ids];
}

export function chatTophs(project: ProjectChats | undefined, chatId: string | null | undefined): ChatToph[] {
  if (!project || !chatId) return [];
  return project.tophs.filter((toph) => toph.chatId === chatId);
}

export function activeChat(project: ProjectChats | undefined): TophChat | null {
  if (!project?.activeChatId) return null;
  return project.chats.find((chat) => chat.id === project.activeChatId) ?? null;
}

export function chatCoordinator(tophs: ChatToph[]): ChatToph | null {
  return tophs.find((toph) => toph.coordinator) ?? tophs[0] ?? null;
}
