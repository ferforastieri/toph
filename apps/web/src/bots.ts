import { create } from "zustand";

export const BOT_AVATARS = [
  "toph-core", "toph-orbit", "toph-prism", "toph-bloom", "toph-forge",
  "toph-nimbus", "toph-tide", "toph-spark", "toph-echo", "toph-pebble",
  "toph-nova", "toph-luna", "toph-peak", "toph-kite", "toph-grove",
  "toph-pulse", "toph-cube", "toph-comet", "toph-portal", "toph-mochi",
] as const;
export type BotAvatar = (typeof BOT_AVATARS)[number];

export const BOT_AVATAR_LABELS: Record<BotAvatar, string> = {
  "toph-core": "Toph Essência", "toph-orbit": "Toph Órbita", "toph-prism": "Toph Prisma", "toph-bloom": "Toph Flora", "toph-forge": "Toph Forja",
  "toph-nimbus": "Toph Nimbus", "toph-tide": "Toph Maré", "toph-spark": "Toph Faísca", "toph-echo": "Toph Eco", "toph-pebble": "Toph Seixo",
  "toph-nova": "Toph Nova", "toph-luna": "Toph Luna", "toph-peak": "Toph Pico", "toph-kite": "Toph Pipa", "toph-grove": "Toph Bosque",
  "toph-pulse": "Toph Pulso", "toph-cube": "Toph Cubo", "toph-comet": "Toph Cometa", "toph-portal": "Toph Portal", "toph-mochi": "Toph Mochi",
};
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
  agentMode?: "build" | "plan";
  permissionMode?: "yolo" | "ask" | "deny";
  mcpServers?: string[];
  emailAccountIds?: string[];
  language: BotLanguage;
  color: string;
  avatar: BotAvatar;
  notifications: boolean;
  coordinator: boolean;
  /** Conversation channel. Individual Tophs get their own channel. */
  channel?: string;
  sessionId?: string;
  sessionPrimed?: boolean;
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
  mode?: "solo" | "team";
  channel?: string;
  audience?: "user" | "coordinator";
  pending?: boolean;
  durationMs?: number;
  createdAt: number;
}

export type TophMode = "solo" | "team";

export interface TophThread {
  bots: MiniBot[];
  messages: BotMessage[];
  activeBotId: string | null;
}

const EMPTY_THREAD: TophThread = { bots: [], messages: [], activeBotId: null };

export interface BotWorkspace extends TophThread {
  version?: number;
  mode?: TophMode | "unset";
  modeExplicit?: boolean;
  savedSolo?: TophThread;
  savedTeam?: TophThread;
  hydrated?: boolean;
}

interface BotStore {
  byProject: Record<string, BotWorkspace>;
  messageWrites: Record<string, Record<string, BotMessage>>;
  load: (projectId: string, workspace?: BotWorkspace | null) => void;
  ensure: (projectId: string) => BotWorkspace;
  snapshot: (projectId: string) => BotWorkspace | null;
  unload: (projectId: string) => void;
  mergeMessages: (projectId: string, messages: BotMessage[]) => void;
  pendingMessageWrites: (projectId: string) => BotMessage[];
  acknowledgeMessageWrites: (projectId: string, messages: BotMessage[]) => void;
  discardMessageWrites: (projectId: string, mode: TophMode, channel: string) => void;
  forget: (projectId: string) => void;
  setActiveBot: (projectId: string, botId: string | null) => void;
  setMode: (projectId: string, mode: TophMode) => void;
  createSolo: (projectId: string, bot?: Partial<MiniBot>) => void;
  createTeam: (projectId: string) => void;
  addBot: (projectId: string, bot?: Partial<MiniBot>) => MiniBot;
  updateBot: (projectId: string, botId: string, patch: Partial<MiniBot>) => void;
  removeBot: (projectId: string, botId: string) => void;
  addMessage: (projectId: string, message: BotMessage) => void;
  appendMessage: (projectId: string, messageId: string, text: string) => void;
  updateMessage: (projectId: string, messageId: string, patch: Partial<BotMessage>) => void;
  removeMessage: (projectId: string, messageId: string) => void;
  replaceChannelMessages: (projectId: string, channel: string, messages: BotMessage[]) => void;
  setBotSession: (
    projectId: string,
    botId: string,
    sessionId: string | undefined,
    options?: { sessionPrimed?: boolean; channel?: string; messages?: BotMessage[] },
  ) => void;
}

export const DEFAULT_BOT_COLOR = "#FFB547";

export interface TophPreset {
  name: string;
  role: string;
  description: string;
  personality: string;
  color: string;
  avatar: BotAvatar;
  coordinator?: boolean;
}

export const TOPH_PRESETS: TophPreset[] = [
  { name: "Toph", role: "Assistente", description: "Seu agente pessoal para conversar, programar e executar tarefas.", personality: "Direto, curioso e focado em resolver o problema.", color: "#B9DE7A", avatar: "toph-core", coordinator: true },
  { name: "Toph Sorriso", role: "Identidade", description: "Cuida da marca, da apresentação visual e da consistência do produto.", personality: "Atento à identidade, direto e obcecado por consistência.", color: "#FFB547", avatar: "toph-mochi" },
  { name: "Toph Piscada", role: "Criativo", description: "Explora novas variações de identidade e apresentação.", personality: "Curioso, experimental e atento ao impacto visual.", color: "#7FD4E8", avatar: "toph-echo" },
  { name: "Toph Óculos", role: "Growth", description: "Testa hipóteses, funis e experimentos com personalidade.", personality: "Orientado a métrica, confiante e direto.", color: "#C7A3FF", avatar: "toph-orbit" },
  { name: "Toph Estrela", role: "Design system", description: "Organiza componentes, variações e padrões visuais.", personality: "Sistemático, detalhista e avesso a exceções sem motivo.", color: "#B9DE7A", avatar: "toph-spark" },
  { name: "Toph Blush", role: "Conteúdo", description: "Escreve, revisa e adapta textos com identidade própria.", personality: "Criativa, calorosa e atenta ao tom da marca.", color: "#FF9EC4", avatar: "toph-bloom" },
  { name: "Atlas", role: "Coordenador", description: "Organiza o time, distribui tarefas e cobra o fechamento.", personality: "Estratégico, calmo e obcecado por clareza.", color: "#7FD4E8", avatar: "toph-peak", coordinator: true },
  { name: "Nova", role: "Produto", description: "Transforma pedidos vagos em escopo e critérios de aceite.", personality: "Curiosa, objetiva e implacável com ambiguidade.", color: "#FF9EC4", avatar: "toph-nova" },
  { name: "Leo", role: "Dev", description: "Implementa, refatora e resolve bugs no código.", personality: "Pragmático, direto e cuidadoso com regressões.", color: "#8FB5F5", avatar: "toph-forge" },
  { name: "Nico", role: "Revisor", description: "Revisa código, aponta riscos e exige testes.", personality: "Cético, detalhista e construtivo.", color: "#C7A3FF", avatar: "toph-prism" },
  { name: "Bia", role: "Dados", description: "Investiga dados, métricas e consultas.", personality: "Analítica, paciente e orientada a evidências.", color: "#84E0C2", avatar: "toph-tide" },
  { name: "Pia", role: "Design", description: "Cuida de interface, consistência visual e experiência.", personality: "Sensível ao detalhe e direta no feedback.", color: "#D8B4FE", avatar: "toph-kite" },
  { name: "Rafa", role: "Suporte", description: "Responde tickets e transforma bugs em issues claras.", personality: "Empática, organizada e rápida no diagnóstico.", color: "#FFD166", avatar: "toph-nimbus" },
  { name: "Maya", role: "Pesquisa", description: "Explora código, documentação e referências externas.", personality: "Investigativa e cética com respostas fáceis.", color: "#6EE7B7", avatar: "toph-grove" },
  { name: "Theo", role: "Infra", description: "Cuida de containers, deploy, logs e observabilidade.", personality: "Metódico, direto e avesso a mudanças sem rollback.", color: "#93C5FD", avatar: "toph-pulse" },
  { name: "Lia", role: "QA", description: "Cria casos de teste e caça regressões.", personality: "Desconfiada por princípio e obcecada por reprodução.", color: "#FDA4AF", avatar: "toph-comet" },
  { name: "Caio", role: "Segurança", description: "Revisa permissões, segredos e superfícies de ataque.", personality: "Cauteloso, preciso e sem alarmismo.", color: "#FCD34D", avatar: "toph-portal" },
  { name: "Vera", role: "Documentação", description: "Mantém README, guias e decisões técnicas.", personality: "Clara, paciente e alérgica a texto vago.", color: "#A8DDE8", avatar: "toph-pebble" },
  { name: "Dante", role: "Backend", description: "APIs, banco de dados e integrações.", personality: "Sistemático, curioso e focado em contratos.", color: "#F08C72", avatar: "toph-cube" },
  { name: "Iris", role: "Frontend", description: "Implementa interfaces acessíveis e responsivas.", personality: "Detalhista, visual e atenta a estados de erro.", color: "#8CD3B4", avatar: "toph-bloom" },
  { name: "Otto", role: "Automação", description: "Scripts, rotinas e integrações entre ferramentas.", personality: "Prático, resiliente e inimigo de trabalho manual.", color: "#F7B267", avatar: "toph-forge" },
  { name: "Luna", role: "Conteúdo", description: "Escreve, revisa e adapta textos para cada canal.", personality: "Criativa, direta e atenta ao tom da marca.", color: "#B8E986", avatar: "toph-luna" },
  { name: "Zoe", role: "Growth", description: "Testa hipóteses, funis e experimentos.", personality: "Orientada a métrica, rápida e transparente.", color: "#9BB7FF", avatar: "toph-spark" },
  { name: "Ravi", role: "Mobile", description: "Cuida de Android, iOS e experiência em movimento.", personality: "Pragmático, atento a performance e gestos.", color: "#F28BA8", avatar: "toph-echo" },
  { name: "Nina", role: "Arquitetura", description: "Desenha limites, dependências e decisões estruturais.", personality: "Sistêmica, questionadora e econômica nas escolhas.", color: "#FFB547", avatar: "toph-prism" },
];

export function botSessionIds(workspace: BotWorkspace | undefined): string[] {
  if (!workspace) return [];
  const ids = new Set<string>();
  for (const thread of [workspace, workspace.savedSolo, workspace.savedTeam]) {
    for (const bot of thread?.bots ?? []) {
      if (bot.sessionId) ids.add(bot.sessionId);
    }
  }
  return [...ids];
}

/** Returns either conversation without changing which one is currently open. */
export function botThread(workspace: BotWorkspace | undefined, mode: TophMode): TophThread {
  if (!workspace) return EMPTY_THREAD;
  const activeMode: TophMode = workspace.mode === "team" ? "team" : "solo";
  if (activeMode === mode) {
    return {
      bots: workspace.bots,
      messages: workspace.messages,
      activeBotId: workspace.activeBotId,
    };
  }
  return (mode === "solo" ? workspace.savedSolo : workspace.savedTeam) ?? EMPTY_THREAD;
}

/** Conversation channel for an individual Toph. Legacy Tophs used the shared "solo" channel. */
export function soloChannel(bot: Pick<MiniBot, "channel">): string {
  return bot.channel || "solo";
}

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

function generatedAvatarFor(name: string): BotAvatar {
  if (slugifyBot(name) === "toph") return "toph-core";
  let hash = 2166136261;
  for (const character of name) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return BOT_AVATARS[Math.abs(hash) % BOT_AVATARS.length] ?? "toph-core";
}

function sanitizeBots(input: MiniBot[] | undefined): MiniBot[] {
  return (input ?? [])
    .filter((bot) => bot && typeof bot.id === "string" && typeof bot.name === "string")
    .map((bot) => ({
      ...bot,
      handle: bot.handle || slugifyBot(bot.name),
      role: bot.role === "Agente solo" ? "Assistente" : (bot.role ?? ""),
      description: bot.description ?? "",
      personality: bot.personality ?? "",
      model: bot.model ?? "",
      effort: bot.effort ?? "",
      agentMode: bot.agentMode === "plan" ? "plan" : "build",
      permissionMode: bot.permissionMode === "deny" ? "ask" : (["yolo", "ask"].includes(bot.permissionMode ?? "") ? bot.permissionMode! : "yolo"),
      mcpServers: Array.isArray(bot.mcpServers) ? bot.mcpServers.filter((item) => typeof item === "string") : [],
      emailAccountIds: Array.isArray(bot.emailAccountIds) ? bot.emailAccountIds.filter((item) => typeof item === "string") : [],
      language: (["auto", "pt", "en", "es"].includes(bot.language) ? bot.language : "auto") as BotLanguage,
      color: bot.color || DEFAULT_BOT_COLOR,
      avatar: (BOT_AVATARS.includes(bot.avatar as BotAvatar) ? bot.avatar : generatedAvatarFor(bot.name)) as BotAvatar,
      notifications: bot.notifications !== false,
      sessionPrimed: bot.sessionPrimed === true,
      coordinator: bot.coordinator === true,
      channel: typeof bot.channel === "string" && bot.channel ? bot.channel : undefined,
      createdAt: bot.createdAt ?? Date.now(),
    }));
}

export function botMessageChannel(message: BotMessage): string {
  return message.channel ?? (message.mode === "solo" ? "solo" : "team");
}

function messageKey(message: BotMessage): string {
  return `${message.mode ?? "team"}\u0000${botMessageChannel(message)}\u0000${message.id}`;
}

function sanitizeMessages(input: BotMessage[] | undefined): BotMessage[] {
  return (input ?? [])
    .filter((message) => message && typeof message.id === "string")
    .map((message) => ({
      ...message,
      role: (["user", "assistant", "reasoning", "tool", "system", "error"].includes(message.role) ? message.role : "system") as BotMessage["role"],
      content: message.content ?? "",
      channel: message.channel ?? (message.mode === "solo" ? "solo" : "team"),
      audience: (message.audience === "coordinator" ? "coordinator" : "user") as BotMessage["audience"],
      mode: message.mode === "solo" || message.mode === "team" ? message.mode : undefined,
      pending: false,
      durationMs: Number.isFinite(message.durationMs) ? message.durationMs : undefined,
      createdAt: message.createdAt ?? Date.now(),
    }));
}

function sanitizeThread(thread: TophThread | undefined): TophThread {
  const bots = sanitizeBots(thread?.bots);
  return {
    bots,
    messages: sanitizeMessages(thread?.messages),
    activeBotId: bots.some((bot) => bot.id === thread?.activeBotId) ? thread!.activeBotId : (bots[0]?.id ?? null),
  };
}

function sanitizeWorkspace(workspace: BotWorkspace): BotWorkspace {
  const legacyNames = new Set([
    "Design + Marketing + Produto",
    "Designer de landing pages",
    "Bot de marketing",
    "Revisor de conteúdo",
  ]);
  const active = sanitizeThread(workspace);
  const legacyDefaults = (workspace.version ?? 0) < 3
    && active.bots.length === 4
    && active.bots.every((bot) => legacyNames.has(bot.name));
  const bots = legacyDefaults ? [] : active.bots;
  const savedMode = workspace.mode === "solo" || workspace.mode === "team" ? workspace.mode : null;
  // Older layouts could be saved as an empty team by the old mode picker.
  // Solo is now the default, so only an explicitly chosen team stays in team.
  const legacyEmptyTeam = savedMode === "team"
    && workspace.modeExplicit !== true
    && bots.length === 0
    && active.messages.length === 0;
  const mode: TophMode | "unset" = savedMode === null || legacyEmptyTeam
    ? "solo"
    : savedMode;
  const movedToSolo = savedMode === null || legacyEmptyTeam;
  const stamp = (thread: TophThread | undefined, threadMode: TophMode): TophThread | undefined => thread
    ? { ...thread, messages: thread.messages.map((message) => ({ ...message, mode: message.mode ?? threadMode })) }
    : undefined;
  const activeTeamRaw: TophThread = {
    bots,
    messages: legacyDefaults ? [] : active.messages,
    activeBotId: active.activeBotId,
  };
  const savedTeamRaw = workspace.savedTeam ? sanitizeThread(workspace.savedTeam) : (savedMode === "team" || movedToSolo ? activeTeamRaw : undefined);
  const savedSoloRaw = workspace.savedSolo ? sanitizeThread(workspace.savedSolo) : undefined;
  const activeRaw: TophThread = mode === "solo"
    ? movedToSolo
      ? (savedSoloRaw ?? { bots: [], messages: [], activeBotId: null })
      : (activeTeamRaw.bots.length === 0 && activeTeamRaw.messages.length === 0 && savedSoloRaw ? savedSoloRaw : activeTeamRaw)
    : activeTeamRaw;
  const currentMode: TophMode = mode === "solo" ? "solo" : "team";
  return {
    version: 4,
    hydrated: true,
    mode,
    modeExplicit: workspace.modeExplicit === true || (mode === "team" && bots.length > 0),
    bots: activeRaw.bots,
    messages: (stamp(activeRaw, currentMode) ?? activeRaw).messages,
    activeBotId: activeRaw.activeBotId,
    savedSolo: mode === "solo" ? undefined : stamp(savedSoloRaw, "solo"),
    savedTeam: mode === "team" ? undefined : stamp(savedTeamRaw, "team"),
  };
}

function createEmptyWorkspace(hydrated = false): BotWorkspace {
  return { version: 4, mode: "solo", modeExplicit: false, bots: [], messages: [], activeBotId: null, hydrated };
}

function queueMessageWrites(
  writes: Record<string, Record<string, BotMessage>>,
  projectId: string,
  messages: BotMessage[],
): Record<string, Record<string, BotMessage>> {
  const pending = { ...(writes[projectId] ?? {}) };
  for (const message of messages) {
    if (!message.pending) pending[messageKey(message)] = message;
  }
  return { ...writes, [projectId]: pending };
}

export const useBots = create<BotStore>((set, get) => ({
  byProject: {},
  messageWrites: {},

  load: (projectId, workspace) => {
    if (!workspace) {
      const next = createEmptyWorkspace(true);
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
    const mode = workspace.mode ?? "solo";
    return {
      version: 4,
      mode,
      modeExplicit: workspace.modeExplicit === true,
      bots: workspace.bots,
      activeBotId: workspace.activeBotId,
      messages: [],
      // The active thread is already stored above. Keeping a second copy in
      // savedSolo/savedTeam doubles the memory and layout payload.
      savedSolo: mode === "solo" ? undefined : workspace.savedSolo
        ? { ...workspace.savedSolo, messages: [] }
        : undefined,
      savedTeam: mode === "team" ? undefined : workspace.savedTeam
        ? { ...workspace.savedTeam, messages: [] }
        : undefined,
    };
  },

  mergeMessages: (projectId, messages) =>
    set((state) => {
      const workspace = state.byProject[projectId];
      if (!workspace || messages.length === 0) return state;
      const byId = new Map(sanitizeMessages(messages).map((message) => [messageKey(message), message]));
      for (const message of workspace.messages) byId.set(messageKey(message), message);
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...workspace,
            messages: [...byId.values()].sort((a, b) => a.createdAt - b.createdAt || botMessageChannel(a).localeCompare(botMessageChannel(b)) || a.id.localeCompare(b.id)),
          },
        },
      };
    }),

  pendingMessageWrites: (projectId) => Object.values(get().messageWrites[projectId] ?? {}),

  acknowledgeMessageWrites: (projectId, messages) =>
    set((state) => {
      const pending = { ...(state.messageWrites[projectId] ?? {}) };
      for (const message of messages) {
        const key = messageKey(message);
        if (pending[key] === message) delete pending[key];
      }
      return { messageWrites: { ...state.messageWrites, [projectId]: pending } };
    }),

  discardMessageWrites: (projectId, mode, channel) =>
    set((state) => {
      const pending = Object.fromEntries(
        Object.entries(state.messageWrites[projectId] ?? {}).filter(([, message]) =>
          message.mode !== mode || botMessageChannel(message) !== channel),
      );
      return { messageWrites: { ...state.messageWrites, [projectId]: pending } };
    }),

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

  setActiveBot: (projectId, activeBotId) =>
    set((state) => {
      const workspace = state.byProject[projectId];
      if (!workspace) return state;
      return { byProject: { ...state.byProject, [projectId]: { ...workspace, activeBotId } } };
    }),

  setMode: (projectId, mode) =>
    set((state) => {
      const workspace = state.byProject[projectId];
      if (!workspace || workspace.mode === mode) return state;
      const current: TophThread = { bots: workspace.bots, messages: workspace.messages, activeBotId: workspace.activeBotId };
      const savedSolo = workspace.mode === "solo" ? current : workspace.savedSolo;
      const savedTeam = workspace.mode === "team" ? current : workspace.savedTeam;
      const target = mode === "solo" ? savedSolo : savedTeam;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...workspace,
            mode,
            modeExplicit: true,
            ...(target ?? { bots: [], messages: [], activeBotId: null }),
            savedSolo: mode === "solo" ? undefined : savedSolo,
            savedTeam: mode === "team" ? undefined : savedTeam,
          },
        },
      };
    }),

  createSolo: (projectId, patch = {}) => {
    const workspace = get().ensure(projectId);
    if (workspace.mode !== "solo") get().setMode(projectId, "solo");
    const next = get().byProject[projectId];
    if (!next || next.bots.length > 0) return;
    get().addBot(projectId, {
      name: "Toph",
      role: "Assistente",
      description: "Seu agente pessoal para conversar, programar e executar tarefas.",
      personality: "Direto, curioso e focado em resolver o problema.",
      avatar: "toph-core",
      coordinator: false,
      ...patch,
    });
  },

  createTeam: (projectId) => {
    const workspace = get().ensure(projectId);
    if (workspace.mode !== "team") get().setMode(projectId, "team");
    // A equipe começa vazia. O usuário adiciona os Tophs pela galeria.
  },

  addBot: (projectId, patch = {}) => {
    const workspace = get().ensure(projectId);
    const name = patch.name?.trim() || "Novo bot";
    const id = newId("bot");
    const individual = (workspace.mode ?? "solo") === "solo";
    const channel = patch.channel ?? (individual
      ? workspace.bots.length === 0 ? "solo" : `solo:${id}`
      : undefined);
    const bot: MiniBot = {
      id,
      name,
      handle: uniqueHandle(workspace.bots, patch.handle || name),
      role: patch.role ?? "Especialista",
      description: patch.description ?? "",
      personality: patch.personality ?? "",
      model: patch.model ?? "",
      effort: patch.effort ?? "",
      agentMode: patch.agentMode ?? "build",
      permissionMode: patch.permissionMode ?? "yolo",
      mcpServers: patch.mcpServers ?? [],
      emailAccountIds: patch.emailAccountIds ?? [],
      language: patch.language ?? "auto",
      color: patch.color ?? DEFAULT_BOT_COLOR,
      avatar: patch.avatar ?? "toph-mochi",
      notifications: patch.notifications !== false,
      coordinator: patch.coordinator === true,
      channel,
      sessionId: patch.sessionId,
      sessionPrimed: patch.sessionPrimed ?? false,
      createdAt: Date.now(),
    };
    const nextBots = bot.coordinator
      ? workspace.bots.map((item) => item.id === bot.id ? item : { ...item, coordinator: false })
      : workspace.bots;
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: {
          ...workspace,
          bots: [...nextBots, bot],
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
      const removed = workspace.bots.find((bot) => bot.id === botId);
      const removedChannel = removed
        ? (workspace.mode ?? "solo") === "solo"
          ? soloChannel(removed)
          : removed.coordinator ? null : `worker:${botId}`
        : null;
      const bots = workspace.bots.filter((bot) => bot.id !== botId);
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...workspace,
            bots,
            activeBotId: workspace.activeBotId === botId ? (bots[0]?.id ?? null) : workspace.activeBotId,
            messages: workspace.messages.filter((message) => message.botId !== botId
              && (!removedChannel || botMessageChannel(message) !== removedChannel)),
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
          [projectId]: { ...workspace, messages: [...workspace.messages, message] },
        },
        messageWrites: queueMessageWrites(state.messageWrites, projectId, [message]),
      };
    }),

  appendMessage: (projectId, messageId, text) =>
    set((state) => {
      const workspace = state.byProject[projectId];
      if (!workspace) return state;
      let changed: BotMessage | undefined;
      const messages = workspace.messages.map((message) => {
        if (message.id !== messageId) return message;
        changed = { ...message, content: message.content + text };
        return changed;
      });
      if (!changed) return state;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...workspace,
            messages,
          },
        },
        messageWrites: queueMessageWrites(state.messageWrites, projectId, [changed]),
      };
    }),

  updateMessage: (projectId, messageId, patch) =>
    set((state) => {
      const workspace = state.byProject[projectId];
      if (!workspace) return state;
      let changed: BotMessage | undefined;
      const messages = workspace.messages.map((message) => {
        if (message.id !== messageId) return message;
        changed = { ...message, ...patch };
        return changed;
      });
      if (!changed) return state;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...workspace,
            messages,
          },
        },
        messageWrites: queueMessageWrites(state.messageWrites, projectId, [changed]),
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

  replaceChannelMessages: (projectId, channel, messages) =>
    set((state) => {
      const workspace = state.byProject[projectId];
      if (!workspace) return state;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...workspace,
            messages: [
              ...workspace.messages.filter((message) => botMessageChannel(message) !== channel),
              ...messages,
            ].sort((a, b) => a.createdAt - b.createdAt),
          },
        },
        messageWrites: queueMessageWrites(state.messageWrites, projectId, messages),
      };
    }),

  setBotSession: (projectId, botId, sessionId, options = {}) =>
    set((state) => {
      const workspace = state.byProject[projectId];
      if (!workspace) return state;
      const messages = options.channel === undefined
        ? workspace.messages
        : [
            ...workspace.messages.filter((message) => botMessageChannel(message) !== options.channel),
            ...(options.messages ?? []),
          ].sort((a, b) => a.createdAt - b.createdAt);
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...workspace,
            bots: workspace.bots.map((bot) => bot.id === botId
              ? { ...bot, sessionId, sessionPrimed: options.sessionPrimed ?? bot.sessionPrimed }
              : bot),
            messages,
          },
        },
        messageWrites: queueMessageWrites(state.messageWrites, projectId, options.messages ?? []),
      };
    }),
}));
