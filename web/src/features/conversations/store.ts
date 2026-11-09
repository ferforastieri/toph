import { create } from "zustand";
import { BOT_AVATARS, type BotAvatar, type BotLanguage } from "../agents/avatars";

export const DEFAULT_TOPH_COLOR = "#FFB547";

export type TophAgentMode = "build" | "plan";
export type TophPermissionMode = "yolo" | "ask" | "deny";

export interface ChatToph {
  /** A Toph belongs to the project, not to a conversation. */
  id: string;
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
  emailAccountIds: string[];
  /** Optional tool ids enabled for this Toph. Empty disables all optional tools. */
  tools: string[];
  language: BotLanguage;
  color: string;
  avatar: BotAvatar;
  notifications: boolean;
  createdAt: number;
}

/** A conversation (task) with one Toph or a group of them. */
export interface TophChat {
  id: string;
  /** Empty means "use the participants' names" in the UI. */
  name: string;
  /** Context applied to every participant of this task. */
  description: string;
  /** One id is an individual task; two or more make a group. */
  participantIds: string[];
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
  version: 5;
  /** Tasks: each one has one Toph (individual) or several (group). */
  chats: TophChat[];
  /** Project-level Toph identities. The same Toph can join many tasks. */
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

function normalizeToph(toph: Partial<ChatToph>): ChatToph {
  const name = toph.name?.trim() || "Toph";
  return {
    id: String(toph.id),
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
    avatar: toph.avatar && BOT_AVATARS.includes(toph.avatar) ? toph.avatar : generatedAvatarFor(name),
    notifications: toph.notifications !== false,
    createdAt: Number.isFinite(toph.createdAt) ? Number(toph.createdAt) : Date.now(),
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

/** A project starts empty: Tophs are created first, tasks open around them. */
export function freshProject(hydrated = false): ProjectChats {
  return { version: 5, chats: [], tophs: [], messages: [], activeChatId: null, hydrated };
}

function sanitizeProject(input: ProjectChats | null | undefined): ProjectChats {
  if (!input) return freshProject(true);
  const now = Date.now();
  const raw = input as unknown as {
    version?: number;
    chat?: Partial<TophChat> & { kind?: string };
    chats?: Array<Partial<TophChat> & { kind?: string; participantIds?: string[] }>;
    tophs?: Array<Partial<ChatToph> & { chatId?: string }>;
    messages?: ChatMessage[];
    activeChatId?: string | null;
  };

  const rawTophs = Array.isArray(raw.tophs) ? raw.tophs : [];
  const seenTophs = new Set<string>();
  const tophs: ChatToph[] = [];
  for (const item of rawTophs) {
    if (!item || typeof item.id !== "string" || !item.id || seenTophs.has(item.id)) continue;
    seenTophs.add(item.id);
    tophs.push(normalizeToph(item));
  }
  const handles = new Set<string>();
  for (const toph of tophs) {
    toph.handle = uniqueHandle(toph.handle || toph.name, handles);
    handles.add(toph.handle);
  }
  const tophIds = new Set(tophs.map((toph) => toph.id));

  let rawChats: Array<Partial<TophChat> & { kind?: string; participantIds?: string[] }> = [];
  if (Array.isArray(raw.chats)) rawChats = raw.chats.filter((item) => item && typeof item.id === "string" && item.id);
  else if (raw.chat && typeof raw.chat.id === "string" && raw.chat.id) rawChats = [raw.chat];

  const seenChats = new Set<string>();
  let chats: TophChat[] = rawChats.flatMap((item) => {
    if (!item.id || seenChats.has(item.id)) return [];
    seenChats.add(item.id);
    const explicit = Array.isArray(item.participantIds)
      ? item.participantIds.filter((id): id is string => typeof id === "string" && tophIds.has(id))
      : [];
    const legacy = rawTophs
      .filter((toph) => toph && typeof toph.id === "string" && tophIds.has(toph.id) && toph.chatId === item.id)
      .map((toph) => toph.id!);
    const participantIds = [...new Set(explicit.length > 0 ? explicit : legacy)];
    const name = item.name?.trim() === "Equipe" ? "" : item.name?.trim() ?? "";
    return [{
      id: item.id,
      name,
      description: item.description ?? "",
      participantIds,
      createdAt: Number.isFinite(item.createdAt) ? Number(item.createdAt) : now,
      updatedAt: Number.isFinite(item.updatedAt) ? Number(item.updatedAt) : now,
    }];
  });

  if (chats.length === 0 && (tophs.length > 0 || (Array.isArray(raw.messages) && raw.messages.length > 0))) {
    chats = [{
      id: newId("chat"),
      name: "",
      description: "",
      participantIds: [...tophs.map((toph) => toph.id)],
      createdAt: now,
      updatedAt: now,
    }];
  }

  const chatIds = new Set(chats.map((chat) => chat.id));
  const mappedMessages = (Array.isArray(raw.messages) ? raw.messages : [])
    .filter((message): message is ChatMessage => Boolean(
      message &&
      typeof message.id === "string" &&
      (!message.tophId || tophIds.has(message.tophId)),
    ))
    .map((message) => normalizeMessage({
      ...message,
      chatId: chatIds.has(message.chatId) ? message.chatId : chats[0]?.id ?? message.chatId,
    }))
    .filter((message) => chatIds.has(message.chatId))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  const activeChatId = chats.some((chat) => chat.id === raw.activeChatId) ? raw.activeChatId! : chats[0]?.id ?? null;
  return { version: 5, chats, tophs, messages: mappedMessages, activeChatId, hydrated: true };
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
  /** Creates a task with one Toph (individual) or several (group). */
  createConversation: (projectId: string, participantIds: string[], options?: { name?: string; description?: string }) => TophChat | null;
  updateChat: (projectId: string, chatId: string, patch: Partial<Pick<TophChat, "name" | "description">>) => void;
  deleteConversation: (projectId: string, chatId: string) => void;
  setActiveChat: (projectId: string, chatId: string | null) => void;
  createToph: (projectId: string, preset: TophPreset) => ChatToph | null;
  updateToph: (projectId: string, tophId: string, patch: Partial<ChatToph>) => void;
  removeToph: (projectId: string, tophId: string) => void;
  addParticipant: (projectId: string, chatId: string, tophId: string) => void;
  touchConversation: (projectId: string, chatId: string) => void;
  removeParticipant: (projectId: string, chatId: string, tophId: string) => void;
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
    return { version: 5, chats: project.chats, tophs: project.tophs, activeChatId: project.activeChatId };
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

  createConversation: (projectId, participantIds, options = {}) => {
    const project = get().ensure(projectId);
    const unique = [...new Set(participantIds)].filter((id) => project.tophs.some((toph) => toph.id === id));
    if (unique.length === 0) return null;
    const now = Math.max(Date.now(), ...project.chats.map((chat) => chat.updatedAt + 1));
    const chat: TophChat = {
      id: newId("chat"),
      name: options.name?.trim() ?? "",
      description: options.description?.trim() ?? "",
      participantIds: unique,
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
                    name: patch.name === undefined ? chat.name : patch.name.trim(),
                    description: patch.description === undefined ? chat.description : patch.description.trim(),
                    updatedAt: Date.now(),
                  }
                : chat,
            ),
          },
        },
      };
    }),

  deleteConversation: (projectId, chatId) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      const chats = project.chats.filter((chat) => chat.id !== chatId);
      const messages = project.messages.filter((message) => message.chatId !== chatId);
      const activeChatId = project.activeChatId === chatId ? chats[0]?.id ?? null : project.activeChatId;
      return {
        byProject: { ...state.byProject, [projectId]: { ...project, chats, messages, activeChatId } },
        messageWrites: removeWritesForChat(state.messageWrites, projectId, chatId),
      };
    }),

  setActiveChat: (projectId, chatId) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      const next = chatId && project.chats.some((chat) => chat.id === chatId) ? chatId : null;
      if (project.activeChatId === next) return state;
      return { byProject: { ...state.byProject, [projectId]: { ...project, activeChatId: next } } };
    }),

  createToph: (projectId, preset) => {
    const project = get().ensure(projectId);
    const role = preset.role.trim() || "Toph";
    const names = new Set(project.tophs.map((toph) => toph.name.toLowerCase()));
    const handles = new Set(project.tophs.map((toph) => toph.handle));
    const name = uniqueName(preset.name, names);
    const handle = uniqueHandle(name, handles);
    const toph: ChatToph = {
      id: newId("toph"),
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
        [projectId]: { ...project, tophs: [...project.tophs, toph] },
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
      const name = patch.name?.trim() || target.name;
      const role = patch.role === undefined ? target.role : patch.role.trim() || "Toph";
      const handles = new Set(project.tophs.filter((toph) => toph.id !== tophId).map((toph) => toph.handle));
      const handle = patch.name ? uniqueHandle(name, handles) : target.handle;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...project,
            tophs: project.tophs.map((toph) =>
              toph.id === tophId ? { ...toph, ...patch, name, handle, role } : toph,
            ),
          },
        },
      };
    }),

  removeToph: (projectId, tophId) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      const removedIds = new Set(
        project.messages.filter((message) => message.tophId === tophId).map((message) => message.id),
      );
      const pending = Object.fromEntries(
        Object.entries(state.messageWrites[projectId] ?? {}).filter(([id]) => !removedIds.has(id)),
      );
      const chats = project.chats
        .map((chat) => chat.participantIds.includes(tophId)
          ? { ...chat, participantIds: chat.participantIds.filter((id) => id !== tophId) }
          : chat)
        .filter((chat) => chat.participantIds.length > 0);
      const chatIds = new Set(chats.map((chat) => chat.id));
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...project,
            tophs: project.tophs.filter((toph) => toph.id !== tophId),
            chats,
            messages: project.messages.filter((message) => message.tophId !== tophId && chatIds.has(message.chatId)),
            activeChatId: project.activeChatId && chatIds.has(project.activeChatId) ? project.activeChatId : chats[0]?.id ?? null,
          },
        },
        messageWrites: { ...state.messageWrites, [projectId]: pending },
      };
    }),

  addParticipant: (projectId, chatId, tophId) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project || !project.tophs.some((toph) => toph.id === tophId)) return state;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...project,
            chats: project.chats.map((chat) =>
              chat.id === chatId && !chat.participantIds.includes(tophId)
                ? { ...chat, participantIds: [...chat.participantIds, tophId], updatedAt: Date.now() }
                : chat,
            ),
          },
        },
      };
    }),

  touchConversation: (projectId, chatId) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...project,
            chats: project.chats.map((chat) => chat.id === chatId ? { ...chat, updatedAt: Date.now() } : chat),
          },
        },
      };
    }),

  removeParticipant: (projectId, chatId, tophId) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project) return state;
      const removedIds = new Set(
        project.messages
          .filter((message) => message.chatId === chatId && message.tophId === tophId)
          .map((message) => message.id),
      );
      const pending = Object.fromEntries(
        Object.entries(state.messageWrites[projectId] ?? {}).filter(([id]) => !removedIds.has(id)),
      );
      const chats = project.chats
        .map((chat) => chat.id === chatId
          ? { ...chat, participantIds: chat.participantIds.filter((id) => id !== tophId), updatedAt: Date.now() }
          : chat)
        .filter((chat) => chat.participantIds.length > 0);
      const chatIds = new Set(chats.map((chat) => chat.id));
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...project,
            chats,
            messages: project.messages.filter((message) => !removedIds.has(message.id) && chatIds.has(message.chatId)),
            activeChatId: project.activeChatId && chatIds.has(project.activeChatId) ? project.activeChatId : chats[0]?.id ?? null,
          },
        },
        messageWrites: { ...state.messageWrites, [projectId]: pending },
      };
    }),

  addMessage: (projectId, message) =>
    set((state) => {
      const project = state.byProject[projectId];
      if (!project || project.messages.some((item) => item.id === message.id)) return state;
      const next = cappedMessage(message);
      return {
        byProject: {
          ...state.byProject,
          [projectId]: {
            ...project,
            messages: [...project.messages, next].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
          },
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

export function chatTophs(project: ProjectChats | undefined, chatId: string | null | undefined): ChatToph[] {
  if (!project || !chatId) return [];
  const chat = project.chats.find((item) => item.id === chatId);
  if (!chat) return [];
  const byId = new Map(project.tophs.map((toph) => [toph.id, toph]));
  return chat.participantIds.flatMap((id) => byId.get(id) ?? []);
}

export function conversations(project: ProjectChats | undefined): TophChat[] {
  return project?.chats ?? [];
}

export function chatsForToph(project: ProjectChats | undefined, tophId: string | null | undefined): TophChat[] {
  if (!project || !tophId) return [];
  return project.chats
    .filter((chat) => chat.participantIds.includes(tophId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function latestChatForToph(project: ProjectChats | undefined, tophId: string | null | undefined): TophChat | null {
  return chatsForToph(project, tophId)[0] ?? null;
}

/** Visible conversation name: a custom title, or the participants' names. */
export function chatDisplayName(project: ProjectChats | undefined, chat: TophChat | null | undefined, maxNames = 0): string {
  if (!chat) return "";
  const title = chat.name.trim();
  if (title) return title;
  const names = chatTophs(project, chat.id).map((toph) => toph.name);
  if (names.length === 0) return "Conversa";
  if (maxNames > 0 && names.length > maxNames) {
    return `${names.slice(0, maxNames).join(" + ")} +${names.length - maxNames}`;
  }
  return names.join(" + ");
}

export function messagesForChat(project: ProjectChats | undefined, chatId: string | null | undefined): ChatMessage[] {
  if (!project || !chatId) return [];
  return project.messages.filter((message) => message.chatId === chatId);
}

export function activeChat(project: ProjectChats | undefined): TophChat | null {
  if (!project?.activeChatId) return null;
  return project.chats.find((chat) => chat.id === project.activeChatId) ?? null;
}
