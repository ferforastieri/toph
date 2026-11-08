import { create } from "zustand";
import { BOT_AVATARS, type BotAvatar, type BotLanguage } from "../agents/avatars";

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
  /** External CLI that owns the agent loop. */
  engine: string;
  effort: string;
  agentMode: TophAgentMode;
  permissionMode: TophPermissionMode;
  mcpServers: string[];
  /** Enabled project skills; empty disables all skills for this Toph. */
  skills: string[];
  emailAccountIds: string[];
  /** Optional tool ids enabled for this Toph. Empty disables all optional tools. */
  tools: string[];
  language: BotLanguage;
  color: string;
  avatar: BotAvatar;
  notifications: boolean;
  sessionId?: string;
  sessionPrimed?: boolean;
  /**
   * When the user starts a new session, messages older than this timestamp
   * belong to the previous session and must not leak into the new one.
   */
  sessionClearedAt?: number;
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
  role: "user" | "assistant" | "reasoning" | "tool" | "system" | "error" | "activity";
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
  version: 4;
  /** Normal team conversations. There is no individual chat. */
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
  model?: string;
  engine?: string;
  effort?: string;
  agentMode?: TophAgentMode;
  permissionMode?: TophPermissionMode;
  mcpServers?: string[];
  skills?: string[];
  emailAccountIds?: string[];
  tools?: string[];
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
    skills: [],
    emailAccountIds: [],
    tools: ["generate_image"],
    language: "auto",
    engine: "opencode",
    ...extra,
  };
}

/** Pre-made Tophs. They carry their own role prompt and default tool policy. */
export const TOPH_PRESETS: TophPreset[] = [
  preset("Toph", "Assistente", "Seu agente pessoal para conversar, programar e executar tarefas.", "Direto, curioso e focado em resolver o problema.", "#B9DE7A", "toph-core"),
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
  preset("Atlas", "Organização", "Organiza prioridades, distribui tarefas e cobra o fechamento.", "Estratégico, calmo e obcecado por clareza.", "#7FD4E8", "toph-peak"),
  preset("Toph", "Assistente", "Seu agente pessoal para conversar, programar e executar tarefas.", "Direto, curioso e focado em resolver o problema.", "#FFB547", "toph-logo"),
  preset("Tulipa", "Designer", "Cuida de interface, consistência visual e experiência.", "Sensível ao detalhe e direta no feedback.", "#FF7AB6", "toph-01"),
  preset("Cogumelo", "Dev", "Implementa, refatora e resolve bugs no código.", "Pragmático e cuidadoso com regressões.", "#7CE7B0", "toph-02"),
  preset("Borboleta", "Produto", "Transforma pedidos vagos em escopo e critérios de aceite.", "Curiosa e implacável com ambiguidade.", "#C7A3FF", "toph-03"),
  preset("Coração", "Suporte", "Responde usuários e transforma problemas em ações claras.", "Empático, organizado e rápido no diagnóstico.", "#FDA4AF", "toph-04"),
  preset("Raio", "Performance", "Otimiza tempo de resposta, memória e renderização.", "Obcecado por medição e ganho real.", "#FFD166", "toph-05"),
  preset("Cacto", "Infra", "Cuida de containers, deploy, logs e observabilidade.", "Metódico e avesso a mudanças sem rollback.", "#8CD3B4", "toph-06"),
  preset("Concha", "Pesquisa", "Explora código, documentação e referências externas.", "Investigativa e cética com respostas fáceis.", "#84E0C2", "toph-07"),
  preset("Bolota", "Dados", "Investiga dados, métricas e consultas.", "Analítica e orientada a evidências.", "#B9DE7A", "toph-08"),
  preset("Folha", "Conteúdo", "Mantém README, guias e decisões técnicas.", "Clara e alérgica a texto vago.", "#A8DDE8", "toph-09"),
  preset("Chama", "Marketing", "Cuida de posicionamento, campanhas e copy.", "Criativa e focada em conversão.", "#F08C72", "toph-10"),
  preset("Floco", "Segurança", "Revisa permissões, segredos e superfícies de ataque.", "Cauteloso e preciso, sem alarmismo.", "#93C5FD", "toph-11"),
  preset("Coringa", "QA", "Cria casos de teste e caça regressões.", "Desconfiado por princípio.", "#C4B5FD", "toph-12"),
  preset("Hexágono", "Arquitetura", "Define estruturas, contratos e limites entre módulos.", "Sistêmico e focado em simplicidade.", "#8FB5F5", "toph-13"),
  preset("Laço", "Revisor", "Revisa código, aponta riscos e exige testes.", "Cético, detalhista e construtivo.", "#FF9EC4", "toph-14"),
  preset("Ampulheta", "Automação", "Scripts, rotinas e integrações entre ferramentas.", "Prático e inimigo de trabalho manual.", "#F7B267", "toph-15"),
  preset("Avião", "DevOps", "Pipelines, releases e automação de entrega.", "Confiável e orientado a rollback.", "#67E8F9", "toph-16"),
  preset("Barco", "Mobile", "Implementa telas e fluxos para iOS e Android.", "Detalhista com gestos e desempenho.", "#6EE7B7", "toph-17"),
  preset("Sino", "Notificações", "Cuida de eventos, alertas e canais.", "Conciso e atento a ruído.", "#FFB547", "toph-18"),
  preset("Ferradura", "Integrações", "Conecta APIs, webhooks e serviços externos.", "Paciente com contratos e falhas.", "#D8B4FE", "toph-19"),
  preset("Coroa", "Gestão", "Organiza prioridades, escopo e entregas.", "Clara e orientada a resultado.", "#FCD34D", "toph-20"),
  preset("Pretzel", "Financeiro", "Cuida de custos, cobrança e indicadores.", "Rigoroso com números.", "#FFB547", "toph-21"),
  preset("Hélice", "Machine Learning", "Modelos, prompts e pipelines de IA.", "Experimental e rigoroso com avaliação.", "#C7A3FF", "toph-22"),
  preset("Arraia", "Cloud", "Infraestrutura, custos e escalabilidade.", "Cauteloso com limites e cotas.", "#8CD3B4", "toph-23"),
  preset("Abóbora", "Growth", "Experimentos, funis e retenção.", "Curioso e orientado a métrica.", "#F7B267", "toph-24"),
  preset("Broto", "Onboarding", "Primeira experiência e ativação de usuários.", "Acolhedor e direto.", "#7CE7B0", "toph-25"),
  preset("Cristais", "Banco de Dados", "Esquemas, índices, consultas e migrações.", "Cuidadoso com dados e performance.", "#93C5FD", "toph-26"),
  preset("Bumerangue", "Refatoração", "Simplifica código legado sem quebrar contratos.", "Pragmático e incremental.", "#F08C72", "toph-27"),
  preset("Bolha", "Customer Success", "Acompanha clientes, feedback e retenção.", "Empático e organizado.", "#8FB5F5", "toph-28"),
  preset("Estrela", "Especialista", "Ajuda no que for necessário, com foco em resolver.", "Direto e adaptável.", "#FF9EC4", "toph-29"),
  preset("Cometa", "Especialista", "Ajuda no que for necessário, com foco em resolver.", "Direto e adaptável.", "#FDA4AF", "toph-30"),
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
    engine: typeof toph.engine === "string" && toph.engine ? toph.engine : "opencode",
    effort: toph.effort ?? "",
    agentMode: toph.agentMode === "plan" ? "plan" : "build",
    permissionMode: toph.permissionMode === "ask" || toph.permissionMode === "deny" ? toph.permissionMode : "yolo",
    mcpServers: Array.isArray(toph.mcpServers) ? toph.mcpServers.filter((item): item is string => typeof item === "string") : [],
    emailAccountIds: Array.isArray(toph.emailAccountIds) ? toph.emailAccountIds.filter((item): item is string => typeof item === "string") : [],
    tools: Array.isArray(toph.tools) ? toph.tools.filter((item): item is string => typeof item === "string") : ["generate_image"],
    language: toph.language === "pt" || toph.language === "en" || toph.language === "es" ? toph.language : "auto",
    color: toph.color || DEFAULT_TOPH_COLOR,
    avatar: BOT_AVATARS.includes(toph.avatar) ? toph.avatar : generatedAvatarFor(name),
    notifications: toph.notifications !== false,
    sessionId: typeof toph.sessionId === "string" && toph.sessionId ? toph.sessionId : undefined,
    sessionPrimed: toph.sessionPrimed === true,
    sessionClearedAt: Number.isFinite(toph.sessionClearedAt) && Number(toph.sessionClearedAt) > 0
      ? Number(toph.sessionClearedAt)
      : undefined,
    createdAt: Number.isFinite(toph.createdAt) ? toph.createdAt : Date.now(),
  };
}

function normalizeMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    content: capMessageText(typeof message.content === "string" ? message.content : ""),
    detail: typeof message.detail === "string" ? capMessageText(message.detail) : message.detail,
    createdAt: Number.isFinite(message.createdAt) ? message.createdAt : Date.now(),
    pending: message.pending === true,
  };
}

const MAX_MESSAGE_TEXT = 200_000;

/** Keep huge tool payloads (base64 images, minified files) from freezing the
 * UI and bloating the persisted history. */
function capMessageText(value: string): string {
  if (value.length <= MAX_MESSAGE_TEXT) return value;
  return `${value.slice(0, MAX_MESSAGE_TEXT)}\n… (${value.length - MAX_MESSAGE_TEXT} caracteres omitidos)`;
}

function cappedMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    content: capMessageText(message.content),
    detail: typeof message.detail === "string" ? capMessageText(message.detail) : message.detail,
  };
}

/** Every project starts with one normal team conversation. More teams can be created. */
export function freshProject(hydrated = false): ProjectChats {
  const now = Date.now();
  const chat: TophChat = { id: newId("chat"), name: "Equipe", description: "", createdAt: now, updatedAt: now };
  return { version: 4, chats: [chat], tophs: [], messages: [], activeChatId: chat.id, hydrated };
}

function sanitizeProject(input: ProjectChats | null | undefined): ProjectChats {
  if (!input) return freshProject(true);
  const now = Date.now();
  const raw = input as unknown as {
    version?: number;
    chat?: TophChat;
    chats?: TophChat[];
    tophs?: ChatToph[];
    messages?: ChatMessage[];
    activeChatId?: string | null;
  };
  const parseChat = (item: TophChat): TophChat => ({
    id: item.id,
    name: item.name?.trim() || "Equipe",
    description: item.description ?? "",
    createdAt: Number.isFinite(item.createdAt) ? item.createdAt : now,
    updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : now,
  });
  let chats: TophChat[] = [];
  if (raw.version === 4) {
    chats = (Array.isArray(raw.chats) ? raw.chats : [])
      .filter((item): item is TophChat => Boolean(item && typeof item.id === "string" && item.id))
      .map(parseChat);
  } else if (raw.version === 3 && raw.chat && typeof raw.chat.id === "string" && raw.chat.id) {
    chats = [parseChat(raw.chat)];
  } else {
    // Older layouts had individual chats plus a team. Keep the team when there
    // is one; otherwise create the normal team and move everything into it.
    const legacy = (Array.isArray(raw.chats) ? raw.chats : [])
      .filter((item): item is TophChat => Boolean(item && typeof item.id === "string" && item.id))
      .map((item) => ({ ...parseChat(item), kind: (item as TophChat & { kind?: string }).kind }));
    const team = legacy.find((item) => item.kind === "team");
    chats = [team ? parseChat(team) : { id: newId("chat"), name: "Equipe", description: "", createdAt: now, updatedAt: now }];
  }
  if (chats.length === 0) {
    chats = [{ id: newId("chat"), name: "Equipe", description: "", createdAt: now, updatedAt: now }];
  }
  const chatIds = new Set(chats.map((chat) => chat.id));
  const tophs = (Array.isArray(raw.tophs) ? raw.tophs : [])
    .filter((toph): toph is ChatToph => Boolean(toph && typeof toph.id === "string"))
    .map((toph) => normalizeToph({ ...toph, chatId: chatIds.has(toph.chatId) ? toph.chatId : chats[0].id }, chatIds.has(toph.chatId) ? toph.chatId : chats[0].id));

  for (const chat of chats) {
    const members = tophs.filter((toph) => toph.chatId === chat.id);
    const handles = new Set<string>();
    for (const toph of members) {
      toph.handle = uniqueHandle(toph.handle || toph.name, handles);
      handles.add(toph.handle);
    }
  }

  const tophIds = new Set(tophs.map((toph) => toph.id));
  const messages = (Array.isArray(raw.messages) ? raw.messages : [])
    .filter((message): message is ChatMessage => Boolean(
      message &&
      typeof message.id === "string" &&
      (!message.tophId || tophIds.has(message.tophId)),
    ))
    .map((message) => normalizeMessage({ ...message, chatId: chatIds.has(message.chatId) ? message.chatId : chats[0].id }))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  const activeChatId = chats.some((chat) => chat.id === raw.activeChatId) ? raw.activeChatId! : chats[0].id;
  return { version: 4, chats, tophs, messages, activeChatId, hydrated: true };
}

function emptyProject(hydrated = false): ProjectChats {
  return freshProject(hydrated);
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
    options?: { sessionPrimed?: boolean; messages?: ChatMessage[]; sessionClearedAt?: number | null },
  ) => void;
  /** Starts a fresh agent session for one Toph in the shared conversation. */
  resetTophSession: (projectId: string, tophId: string) => { chatId: string; clearChat: boolean; cutoff: number } | null;
  addMessage: (projectId: string, message: ChatMessage) => void;
  appendMessage: (projectId: string, messageId: string, text: string) => void;
  updateMessage: (projectId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  removeMessage: (projectId: string, messageId: string) => void;
  mergeMessages: (projectId: string, messages: ChatMessage[]) => void;
  replaceChatMessages: (projectId: string, chatId: string, messages: ChatMessage[]) => void;
  replaceTophMessages: (projectId: string, tophId: string, messages: ChatMessage[]) => void;
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
      version: 4,
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
      name: name.trim() || "Equipe",
      description: description.trim(),
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: { ...project, chats: [...project.chats, chat], activeChatId: chat.id },
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
      let chats = project.chats.filter((chat) => chat.id !== chatId);
      if (chats.length === 0) {
        chats = [{ id: newId("chat"), name: "Equipe", description: "", createdAt: Date.now(), updatedAt: Date.now() }];
      }
      const tophs = project.tophs.filter((toph) => toph.chatId !== chatId);
      const messages = project.messages.filter((message) => message.chatId !== chatId);
      const activeChatId = project.activeChatId === chatId ? chats[0].id : project.activeChatId;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: { ...project, chats, tophs, messages, activeChatId },
        },
        messageWrites: removeWritesForChat(state.messageWrites, projectId, chatId),
      };
    }),

  setActiveChat: (projectId, chatId) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project || !chatId || !project.chats.some((chat) => chat.id === chatId) || project.activeChatId === chatId) return state;
      return { byProject: { ...state.byProject, [projectId]: { ...project, activeChatId: chatId } } };
    }),

  addToph: (projectId, chatId, preset) => {
    const project = get().ensure(projectId);
    const chat = project.chats.find((item) => item.id === chatId);
    if (!chat) return null;
    const members = project.tophs.filter((toph) => toph.chatId === chatId);
    const role = preset.role.trim() || "Toph";
    const names = new Set(members.map((toph) => toph.name.toLowerCase()));
    const handles = new Set(members.map((toph) => toph.handle));
    const name = uniqueName(preset.name, names);
    const handle = uniqueHandle(name, handles);
    const toph: ChatToph = {
      id: newId("toph"),
      chatId: chat.id,
      name,
      handle,
      role,
      description: preset.description ?? "",
      personality: preset.personality ?? "",
      prompt: preset.prompt ?? "",
      model: preset.model ?? "",
      engine: preset.engine ?? "opencode",
      effort: preset.effort ?? "",
      agentMode: preset.agentMode === "plan" ? "plan" : "build",
      permissionMode: preset.permissionMode === "ask" || preset.permissionMode === "deny" ? preset.permissionMode : "yolo",
      mcpServers: [...(preset.mcpServers ?? [])],
      skills: [...(preset.skills ?? [])],
      emailAccountIds: [...(preset.emailAccountIds ?? [])],
      tools: [...(preset.tools ?? ["generate_image"])],
      language: preset.language ?? "auto",
      color: preset.color || DEFAULT_TOPH_COLOR,
      avatar: BOT_AVATARS.includes(preset.avatar) ? preset.avatar : generatedAvatarFor(name),
      notifications: true,
      createdAt: Date.now(),
    };
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: {
          ...project,
          tophs: [...project.tophs, toph],
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
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...project,
            tophs: project.tophs.map((toph) =>
              toph.id === tophId
                ? { ...toph, ...patch, name, handle, role: duplicateRole ? toph.role : role }
                : toph,
            ),
          },
        },
      };
    }),

  removeToph: (projectId, tophId) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      const removedMessages = project.messages.filter((message) => message.tophId === tophId);
      const removedIds = new Set(removedMessages.map((message) => message.id));
      const pending = Object.fromEntries(
        Object.entries(state.messageWrites[projectId] ?? {}).filter(([id]) => !removedIds.has(id)),
      );
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...project,
            tophs: project.tophs.filter((toph) => toph.id !== tophId),
            messages: project.messages.filter((message) => message.tophId !== tophId),
          },
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
          ? {
              ...toph,
              sessionId,
              sessionPrimed: options?.sessionPrimed ?? toph.sessionPrimed,
              sessionClearedAt: options?.sessionClearedAt === undefined
                ? toph.sessionClearedAt
                : options.sessionClearedAt && options.sessionClearedAt > 0
                  ? options.sessionClearedAt
                  : undefined,
            }
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

  resetTophSession: (projectId, tophId) => {
    const project = get().byProject[projectId];
    if (!project) return null;
    const target = project.tophs.find((toph) => toph.id === tophId);
    if (!target) return null;
    const chat = project.chats.find((item) => item.id === target.chatId);
    if (!chat) return null;
    const cutoff = Date.now();
    const clearChat = false;
    set((state) => {
      const current = state.byProject[projectId];
      if (!current) return state;
      const removedIds = new Set(
        current.messages
          .filter((message) => message.chatId === chat.id && (clearChat || message.tophId === tophId))
          .map((message) => message.id),
      );
      const pending = Object.fromEntries(
        Object.entries(state.messageWrites[projectId] ?? {}).filter(([id]) => !removedIds.has(id)),
      );
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...current,
            tophs: current.tophs.map((toph) =>
              toph.id === tophId
                ? { ...toph, sessionId: undefined, sessionPrimed: false, sessionClearedAt: cutoff }
                : toph,
            ),
            messages: current.messages.filter((message) => !removedIds.has(message.id)),
          },
        },
        messageWrites: { ...state.messageWrites, [projectId]: pending },
      };
    });
    return { chatId: chat.id, clearChat, cutoff };
  },

  addMessage: (projectId, message) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project || project.messages.some((item) => item.id === message.id)) return state;
      const next = cappedMessage(message);
      return {
        byProject: {
          ...state.byProject,
          [projectId]: { ...project, messages: [...project.messages, next].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)) },
        },
        messageWrites: queueWrite(state.messageWrites, projectId, next),
      };
    }),

  appendMessage: (projectId, messageId, text) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      let changed: ChatMessage | null = null;
      const messages = project.messages.map((message) => {
        if (message.id !== messageId) return message;
        changed = cappedMessage({ ...message, content: `${message.content}${text}` });
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
        changed = cappedMessage({ ...message, ...patch });
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

  replaceTophMessages: (projectId, tophId, messages) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      const removed = project.messages.filter((message) => message.tophId === tophId);
      const removedIds = new Set(removed.map((message) => message.id));
      const pending = Object.fromEntries(
        Object.entries(state.messageWrites[projectId] ?? {}).filter(([id]) => !removedIds.has(id)),
      );
      const byId = new Map(project.messages.filter((message) => message.tophId !== tophId).map((message) => [message.id, message]));
      for (const message of messages) byId.set(message.id, message);
      let messageWrites = { ...state.messageWrites, [projectId]: pending };
      for (const message of messages) messageWrites = queueWrite(messageWrites, projectId, message);
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...project,
            messages: [...byId.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
          },
        },
        messageWrites,
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

export function teamChats(project: ProjectChats | undefined): TophChat[] {
  return project?.chats ?? [];
}

export function chatForToph(project: ProjectChats | undefined, tophId: string | null | undefined): TophChat | null {
  if (!project || !tophId) return null;
  const toph = project.tophs.find((item) => item.id === tophId);
  return toph ? project.chats.find((chat) => chat.id === toph.chatId) ?? null : null;
}

export function tophForChat(project: ProjectChats | undefined, chatId: string | null | undefined): ChatToph | null {
  return chatTophs(project, chatId)[0] ?? null;
}

/**
 * Messages that belong to the current session of the conversation. A Toph's
 * `sessionClearedAt` marks the boundary between its old and new agent
 * session. The conversation itself is shared, so user messages stay.
 */
export function messagesForChat(project: ProjectChats | undefined, chatId: string | null | undefined): ChatMessage[] {
  if (!project || !chatId) return [];
  const tophs = new Map(project.tophs.map((toph) => [toph.id, toph]));
  return project.messages.filter((message) => {
    if (message.chatId !== chatId) return false;
    if (message.tophId) {
      const cutoff = tophs.get(message.tophId)?.sessionClearedAt ?? 0;
      if (message.createdAt < cutoff) return false;
    }
    return true;
  });
}

/**
 * Full context for one Toph after its latest session reset. Unlike
 * `messagesForChat`, this also hides old user messages from the prompt sent
 * to the new session, so a fresh session really starts fresh.
 */
export function messagesForToph(project: ProjectChats | undefined, chatId: string | null | undefined, tophId: string | null | undefined): ChatMessage[] {
  if (!project || !chatId || !tophId) return [];
  const cutoff = project.tophs.find((toph) => toph.id === tophId)?.sessionClearedAt ?? 0;
  return project.messages.filter((message) => message.chatId === chatId && message.createdAt >= cutoff);
}

export function activeChat(project: ProjectChats | undefined): TophChat | null {
  if (!project?.activeChatId) return null;
  return project.chats.find((chat) => chat.id === project.activeChatId) ?? null;
}
