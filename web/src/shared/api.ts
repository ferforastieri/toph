export interface User {
  id: number;
  username: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  root: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClosedProcess {
  pid: number;
  name: string;
  command: string;
  cwd: string;
}

export interface ProjectCloseResult {
  ok: boolean;
  terminals: number;
  debug: boolean;
  processes: ClosedProcess[];
  failed: ClosedProcess[];
}

export interface Repository {
  name: string;
  path: string;
  root: string;
  relative: string;
}

export interface PortInfo {
  address: string;
  port: number;
  protocol: string;
}

export interface FileEntry {
  name: string;
  path: string;
  dir: boolean;
  size: number;
  modTime: string;
}

export interface FileContent {
  path: string;
  content: string;
  hash: string;
  modTime: string;
  size: number;
}

export interface GitBlameLine {
  line: number;
  commit: string;
  author: string;
  authorTime: string;
  summary: string;
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export interface GitHistoryEntry {
  hash: string;
  author: string;
  date: string;
  subject: string;
}


export interface PetConfig {
  chosen: boolean;
  enabled: boolean;
  kind: string;
  mode: string;
  commits: number;
}

export interface ImageProviderConfig {
  id: string;
  label: string;
  kind: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  hasKey: boolean;
}

export interface ImageProviderInput {
  id: string;
  label: string;
  kind: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  apiKey?: string;
  clearKey?: boolean;
  hasKey?: boolean;
}

export interface AIConfig {
  label: string;
  connectionLabel: string;
  provider: string;
  baseUrl: string;
  model: string;
  autocompleteModel: string;
  maxTokens: number;
  temperature: number;
  autocomplete: boolean;
  systemPrompt: string;
  hasKey: boolean;
  imageProviders: ImageProviderConfig[];
}

export interface AIConfigInput {
  label: string;
  provider: string;
  baseUrl: string;
  apiKey?: string;
  clearKey?: boolean;
  model: string;
  autocompleteModel: string;
  maxTokens: number;
  temperature: number;
  autocomplete: boolean;
  systemPrompt: string;
  imageProviders: ImageProviderInput[];
}

export interface AIModel {
  id: string;
  label: string;
  provider: string;
  connectionLabel?: string;
  variants?: string[];
  inputs?: string[];
}

export type AIMessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: "wav" | "mp3" } };

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string | AIMessageContentPart[];
}

export interface DBProfile {
  id: string;
  name: string;
  folder: string;
  projectRoot: string;
  driver: string;
  readOnly: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DBProfileInput {
  name: string;
  folder: string;
  projectRoot: string;
  driver: string;
  dsn: string;
  readOnly: boolean;
}

export interface QueryColumn {
  name: string;
  type: string;
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
}

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  primary: boolean;
}

export interface SchemaTable {
  schema: string;
  name: string;
  columns: SchemaColumn[];
}

export interface RowChange {
  schema: string;
  table: string;
  key?: Record<string, unknown>;
  values?: Record<string, unknown>;
}

export interface WebTarget {
  id: string;
  name: string;
  url: string;
  icon: string;
  createdAt: string;
}

export interface EmailAccount {
  id: string;
  name: string;
  email: string;
  fromName?: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapTls: boolean;
  imapSecurity?: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpTls: boolean;
  smtpSecurity?: string;
  createdAt: string;
}

export interface EmailAccountInput {
  name: string;
  email: string;
  fromName?: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPassword: string;
  imapTls: boolean;
  imapSecurity?: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpTls: boolean;
  smtpSecurity?: string;
}

export interface EmailMessageSummary {
  uid: string;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
  snippet: string;
}

export interface EmailMessage extends EmailMessageSummary {
  to: string;
  cc?: string;
  text: string;
  html?: string;
  attachments: string[];
}

export interface EmailSendInput {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  inReplyTo?: string;
}

export interface VersionInfo {
  name: string;
  version: string;
  buildId: string;
}

export interface UpdateInstaller {
  kind: "windows-nsis" | "windows-msi" | "linux-appimage" | "linux-deb" | "linux-rpm";
  name: string;
  url: string;
  sha256?: string;
  size?: number;
}

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string;
  apkUrl?: string;
  installers?: UpdateInstaller[];
  available: boolean;
  supported: boolean;
  busy: boolean;
  error?: string;
}

export interface UpdateStart {
  status: "started" | "current";
  version: string;
}

export interface LoginResponse {
  token: string;
  csrfToken: string;
  expiresAt: string;
  user: User;
}

export interface DebugSessionInfo {
  id: string;
  projectId: string;
  language: "node" | "python";
  mode: "launch" | "attach";
  status: "running" | "paused" | "stopped";
  wsUrl: string;
  address: string;
}

export interface DebugBreakpoint {
  id: string;
  path: string;
  line: number;
  condition?: string;
  logMessage?: string;
  enabled?: boolean;
}

export interface DebugProjectConfig {
  language: "node" | "python";
  mode: "launch" | "attach";
  command: string;
  address: string;
  cwd: string;
  bug: string;
  reproduction: string;
  breakpoints: DebugBreakpoint[];
  watches: string[];
  pauseOnExceptions: "none" | "uncaught" | "all";
}

export interface WorkspaceLayout {
  tabs: unknown[];
  activeTabId: string | null;
  sidebar?: string;
  terminalOpen?: boolean;
  aiSessionId?: string;
  aiSessionTitle?: string;
  aiPanelOpen?: boolean;
  chats?: unknown;
}

export interface WorkspaceMessageCursor {
  createdAt: number;
  channel: string;
  id: string;
}

export interface WorkspaceMessagePage<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: WorkspaceMessageCursor | null;
}

export interface WorkspaceMessageQuery {
  mode: "chat";
  channel?: string;
  scope?: "all" | "conversation" | "activity";
  before?: WorkspaceMessageCursor | null;
  limit?: number;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const API_BASE = "/api";
let apiBase = "";
const pendingReads = new Map<string, Promise<unknown>>();

export function setApiBase(value: string): void {
  pendingReads.clear();
  apiBase = value.trim().replace(/\/+$/, "");
}

export function getApiBase(): string {
  return apiBase;
}

export function webPreviewUrl(url: string): string {
  return `${apiBase}/api/web-preview?url=${encodeURIComponent(url)}`;
}

export async function probeServer(raw: string): Promise<string> {
  let base = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) {
    const host = base.split("/")[0].split(":")[0];
    const local =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host);
    base = `${local ? "http" : "https"}://${base}`;
  }
  base = base.replace(/\/app$/i, "");
  const response = await fetch(`${base}${API_BASE}/health`, {
    headers: { Accept: "application/json" },
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`Server returned ${response.status}.`);
  }
  const body = (await response.json()) as { name?: string };
  if (body.name !== "toph") {
    throw new Error("That URL does not point to a Toph server.");
  }
  return base;
}

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)toph_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  // Coalesce only overlapping reads. Keep no response cache, and don't share
  // requests with an AbortSignal: each caller owns its cancellation lifetime.
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) pendingReads.clear();
  if (method !== "GET" || options.signal || options.body) return send<T>(path, options);
  const key = JSON.stringify([apiBase, path, { ...options, headers: [...new Headers(options.headers)] }]);
  const existing = pendingReads.get(key);
  if (existing) return existing as Promise<T>;
  const result = send<T>(path, options);
  if (pendingReads.size < 128) {
    pendingReads.set(key, result);
    const release = () => { if (pendingReads.get(key) === result) pendingReads.delete(key); };
    void result.then(release, release);
  }
  return result;
}

async function send<T>(path: string, options: RequestInit): Promise<T> {
  const headers = new Headers(options.headers);
  const method = (options.method ?? "GET").toUpperCase();
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = csrfToken();
    if (csrf) {
      headers.set("X-Toph-CSRF", csrf);
    }
  }
  const response = await fetch(`${apiBase}${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { error?: string };
      message = body.error ?? message;
    } catch {
      // Keep the status text.
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function json(body: unknown): RequestInit {
  return { body: JSON.stringify(body) };
}

export const api = {
  async health(): Promise<{ ok: boolean; name: string; version: string; buildId?: string }> {
    return request("/health");
  },

  async version(): Promise<VersionInfo> {
    return request("/version");
  },

  async updateStatus(): Promise<UpdateStatus> {
    return request("/update");
  },

  /** Notifications persisted on the server, shared by every client. */
  async notifications(): Promise<Array<{
    id: string;
    kind: "ai" | "system";
    title: string;
    body: string;
    createdAt: number;
    read: boolean;
    projectId?: string;
    projectName?: string;
    chatId?: string;
    sessionId?: string;
    notificationId?: string;
    botId?: string;
    botName?: string;
    botRole?: string;
  }>> {
    return request("/notifications");
  },

  async markNotificationsRead(input: { ids?: string[]; chatId?: string; projectId?: string; all?: boolean }): Promise<void> {
    await request("/notifications/read", { method: "POST", ...json(input) });
  },

  async clearNotifications(): Promise<void> {
    await request("/notifications", { method: "DELETE" });
  },

  async openProjects(): Promise<string[]> {
    const result = await request<{ openProjectIds: string[] }>("/open-projects");
    return result.openProjectIds;
  },

  async saveOpenProjects(openProjectIds: string[]): Promise<void> {
    await request("/open-projects", { method: "PUT", ...json({ openProjectIds }) });
  },

  async startUpdate(): Promise<UpdateStart> {
    return request("/update", { method: "POST", ...json({}) });
  },

  async registerPushToken(token: string, platform: string): Promise<void> {
    await request("/push/tokens", {
      method: "POST",
      ...json({ token, platform }),
    });
  },

  async notifyBot(input: {
    notificationId: string;
    projectId: string;
    botId: string;
    botName: string;
    botRole?: string;
    sessionId?: string;
    chatId?: string;
    tabId?: string;
    title: string;
    body: string;
  }): Promise<void> {
    await request("/notifications/bot", {
      method: "POST",
      ...json(input),
    });
  },

  async login(username: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>("/auth/login", {
      method: "POST",
      ...json({ username, password, kind: "web" }),
    });
  },

  /** Exchanges a one-time desktop pairing code for a normal web session. */
  async pair(code: string): Promise<LoginResponse> {
    return request<LoginResponse>("/auth/pair", {
      method: "POST",
      ...json({ code, kind: "web" }),
    });
  },

  async me(): Promise<User> {
    const response = await request<{ user: User }>("/auth/me");
    return response.user;
  },

  async logout(): Promise<void> {
    await request("/auth/logout", { method: "POST", body: JSON.stringify({}) });
  },

  async pet(): Promise<PetConfig> {
    return request<PetConfig>("/pet");
  },

  async savePet(pet: PetConfig): Promise<PetConfig> {
    return request<PetConfig>("/pet", { method: "PUT", ...json(pet) });
  },

  async projects(): Promise<Project[]> {
    return request<Project[]>("/projects");
  },

  async createProject(name: string, root: string, color: string): Promise<Project> {
    return request<Project>("/projects", {
      method: "POST",
      ...json({ name, root, color }),
    });
  },

  async deleteProject(id: string): Promise<void> {
    await request(`/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async repos(query = ""): Promise<Repository[]> {
    const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    const response = await request<{ repos: Repository[] }>(`/repos${suffix}`);
    return response.repos;
  },

  async files(projectId: string, query = ""): Promise<string[]> {
    const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    const response = await request<{ files: string[] }>(
      `/projects/${encodeURIComponent(projectId)}/files${suffix}`,
    );
    return response.files;
  },

  async tree(projectId: string, path = ""): Promise<FileEntry[]> {
    return request<FileEntry[]>(
      `/projects/${encodeURIComponent(projectId)}/tree?path=${encodeURIComponent(path)}`,
    );
  },

  async file(projectId: string, path: string): Promise<FileContent> {
    return request<FileContent>(
      `/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(path)}`,
    );
  },

  /** Raw bytes, used to preview images instead of decoding them as text. */
  async fileBlob(projectId: string, path: string): Promise<Blob> {
    const response = await fetch(
      `${apiBase}${API_BASE}/projects/${encodeURIComponent(projectId)}/raw?path=${encodeURIComponent(path)}`,
      { credentials: "include" },
    );
    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = (await response.json()) as { error?: string };
        message = body.error ?? message;
      } catch {
        // Binary or empty error body.
      }
      throw new ApiError(response.status, message);
    }
    return response.blob();
  },

  async saveFile(
    projectId: string,
    path: string,
    content: string,
    baseHash: string,
  ): Promise<FileContent> {
    return request<FileContent>(`/projects/${encodeURIComponent(projectId)}/file`, {
      method: "PUT",
      ...json({ path, content, baseHash }),
    });
  },

  async makeDir(projectId: string, path: string): Promise<void> {
    await request(`/projects/${encodeURIComponent(projectId)}/mkdir`, {
      method: "POST",
      ...json({ path }),
    });
  },

  async movePath(projectId: string, from: string, to: string): Promise<void> {
    await request(`/projects/${encodeURIComponent(projectId)}/move`, {
      method: "POST",
      ...json({ from, to }),
    });
  },

  async deletePath(projectId: string, path: string): Promise<void> {
    await request(`/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    });
  },

  async uploadFile(projectId: string, path: string, data: string): Promise<void> {
    await request(`/projects/${encodeURIComponent(projectId)}/upload`, {
      method: "POST",
      ...json({ path, data }),
    });
  },

  rawUrl(projectId: string, path: string): string {
    return `${apiBase}${API_BASE}/projects/${encodeURIComponent(projectId)}/raw?path=${encodeURIComponent(path)}`;
  },

  async gitHistory(projectId: string, path: string): Promise<GitHistoryEntry[]> {
    const response = await request<{ history: GitHistoryEntry[] }>(
      `/projects/${encodeURIComponent(projectId)}/git/history?path=${encodeURIComponent(path)}`,
    );
    return response.history;
  },

  async search(projectId: string, query: string): Promise<SearchMatch[]> {
    return request<SearchMatch[]>(`/projects/${encodeURIComponent(projectId)}/search`, {
      method: "POST",
      ...json({ query, limit: 100 }),
    });
  },

  async gitBranches(projectId: string): Promise<{ current: string; branches: string[] }> {
    return request(`/projects/${encodeURIComponent(projectId)}/git/branches`);
  },

  async gitCheckout(projectId: string, name: string): Promise<void> {
    await request(`/projects/${encodeURIComponent(projectId)}/git/checkout`, {
      method: "POST",
      ...json({ name }),
    });
  },

  async gitStatus(projectId: string): Promise<string> {
    const response = await request<{ status: string }>(
      `/projects/${encodeURIComponent(projectId)}/git/status`,
    );
    return response.status;
  },

  async gitFileVersions(projectId: string, path: string, staged: boolean): Promise<{ original: string; modified: string }> {
    return request<{ original: string; modified: string }>(
      `/projects/${encodeURIComponent(projectId)}/git/file?path=${encodeURIComponent(path)}&staged=${staged ? "true" : "false"}`,
    );
  },

  async gitDiff(projectId: string, path: string, staged: boolean): Promise<string> {
    const response = await request<{ diff: string }>(
      `/projects/${encodeURIComponent(projectId)}/git/diff?path=${encodeURIComponent(path)}&staged=${staged ? "true" : "false"}`,
    );
    return response.diff;
  },

  async gitBlame(projectId: string, path: string): Promise<GitBlameLine[]> {
    const response = await request<{ lines: GitBlameLine[] }>(
      `/projects/${encodeURIComponent(projectId)}/git/blame?path=${encodeURIComponent(path)}`,
    );
    return response.lines;
  },

  async gitStage(projectId: string, paths: string[]): Promise<void> {
    await request(`/projects/${encodeURIComponent(projectId)}/git/stage`, {
      method: "POST",
      ...json({ paths }),
    });
  },

  async gitUnstage(projectId: string, paths: string[]): Promise<void> {
    await request(`/projects/${encodeURIComponent(projectId)}/git/unstage`, {
      method: "POST",
      ...json({ paths }),
    });
  },

  async gitDeleteOtherBranches(projectId: string): Promise<number> {
    const response = await request<{ deleted: number }>(
      `/projects/${encodeURIComponent(projectId)}/git/branches`,
      { method: "DELETE" },
    );
    return response.deleted;
  },

  async gitCreateBranch(projectId: string, name: string): Promise<string> {
    const response = await request<{ name: string }>(
      `/projects/${encodeURIComponent(projectId)}/git/branch`,
      { method: "POST", ...json({ name }) },
    );
    return response.name;
  },

  async gitDiscard(projectId: string, paths: string[], staged: boolean): Promise<void> {
    await request(`/projects/${encodeURIComponent(projectId)}/git/discard`, {
      method: "POST",
      ...json({ paths, staged }),
    });
  },

  async gitCommit(projectId: string, message: string): Promise<string> {
    const response = await request<{ output: string }>(
      `/projects/${encodeURIComponent(projectId)}/git/commit`,
      { method: "POST", ...json({ message }) },
    );
    return response.output;
  },

  async layout(projectId: string): Promise<WorkspaceLayout> {
    return request<WorkspaceLayout>(`/projects/${encodeURIComponent(projectId)}/workspace`);
  },

  async saveLayout(projectId: string, layout: WorkspaceLayout): Promise<void> {
    await request(`/projects/${encodeURIComponent(projectId)}/workspace`, {
      method: "PUT",
      body: JSON.stringify(layout),
    });
  },

  async workspaceMessages<T>(projectId: string, query: WorkspaceMessageQuery): Promise<WorkspaceMessagePage<T>> {
    const params = new URLSearchParams({
      mode: query.mode,
      scope: query.scope ?? "all",
      limit: String(query.limit ?? 30),
    });
    if (query.channel) params.set("channel", query.channel);
    if (query.before) {
      params.set("beforeAt", String(query.before.createdAt));
      params.set("beforeChannel", query.before.channel);
      params.set("beforeId", query.before.id);
    }
    return request<WorkspaceMessagePage<T>>(
      `/projects/${encodeURIComponent(projectId)}/workspace/messages?${params}`,
    );
  },

  async chatMessages<T>(projectId: string, chatId: string, query: { before?: WorkspaceMessageCursor | null; limit?: number } = {}): Promise<WorkspaceMessagePage<T>> {
    return this.workspaceMessages<T>(projectId, {
      mode: "chat",
      channel: chatId,
      scope: "all",
      before: query.before,
      limit: query.limit,
    });
  },

  async saveChatMessages(projectId: string, messages: unknown[]): Promise<void> {
    return this.saveWorkspaceMessages(projectId, messages);
  },

  async replaceChatMessages(projectId: string, chatId: string, messages: unknown[]): Promise<void> {
    return this.replaceWorkspaceMessages(projectId, { mode: "chat", channel: chatId }, messages);
  },

  async deleteChatMessages(projectId: string, chatId: string, tophId?: string): Promise<number> {
    return this.deleteWorkspaceMessages(projectId, { mode: "chat", channel: chatId, botId: tophId });
  },

  async saveWorkspaceMessages(projectId: string, messages: unknown[]): Promise<void> {
    if (messages.length === 0) return;
    await request(`/projects/${encodeURIComponent(projectId)}/workspace/messages`, {
      method: "PUT",
      ...json({ messages }),
    });
  },

  async replaceWorkspaceMessages(projectId: string, filter: { mode: "chat"; channel: string }, messages: unknown[]): Promise<void> {
    await request(`/projects/${encodeURIComponent(projectId)}/workspace/messages`, {
      method: "PUT",
      ...json({ messages, replace: filter }),
    });
  },

  async deleteWorkspaceMessages(projectId: string, filter: { mode?: "chat"; channel?: string; botId?: string }): Promise<number> {
    const params = new URLSearchParams();
    if (filter.mode) params.set("mode", filter.mode);
    if (filter.channel) params.set("channel", filter.channel);
    if (filter.botId) params.set("botId", filter.botId);
    const response = await request<{ deleted: number }>(
      `/projects/${encodeURIComponent(projectId)}/workspace/messages?${params}`,
      { method: "DELETE" },
    );
    return response.deleted;
  },

  async createTerminal(projectId: string, shell = "bash"): Promise<{ id: string; projectId: string; shell: string }> {
    return request(`/projects/${encodeURIComponent(projectId)}/terminals`, {
      method: "POST",
      body: JSON.stringify({ shell }),
    });
  },

  async terminalSessions(projectId: string): Promise<{ terminals: Array<{ id: string; projectId: string; shell: string }> }> {
    return request(`/projects/${encodeURIComponent(projectId)}/terminals`);
  },

  async terminalShells(): Promise<{ shells: string[] }> {
    return request("/terminals/shells");
  },

  async closeTerminal(terminalId: string): Promise<{ ok: boolean; closed: boolean }> {
    return request(`/terminals/${encodeURIComponent(terminalId)}`, { method: "DELETE" });
  },

  async closeProjectTerminals(projectId: string): Promise<{ ok: boolean; closed: number }> {
    return request(`/projects/${encodeURIComponent(projectId)}/terminals`, {
      method: "DELETE",
    });
  },

  async closeProject(projectId: string): Promise<ProjectCloseResult> {
    return request(`/projects/${encodeURIComponent(projectId)}/close`, {
      method: "POST",
    });
  },



  async ports(): Promise<PortInfo[]> {
    return request("/ports");
  },

  async debugEval(projectId: string, code: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return request(`/projects/${encodeURIComponent(projectId)}/debug/eval`, {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  async debugStart(projectId: string, input: { language: "node" | "python"; mode: "launch" | "attach"; command?: string; address?: string; cwd?: string }): Promise<DebugSessionInfo> {
    return request(`/projects/${encodeURIComponent(projectId)}/debug/session`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async debugSession(projectId: string): Promise<DebugSessionInfo | null> {
    const result = await request<{ session: DebugSessionInfo | null }>(`/projects/${encodeURIComponent(projectId)}/debug/session`);
    return result.session;
  },

  async debugStop(projectId: string): Promise<void> {
    await request(`/projects/${encodeURIComponent(projectId)}/debug/session`, { method: "DELETE" });
  },

  async debugRelease(projectId: string): Promise<void> {
    await request(`/projects/${encodeURIComponent(projectId)}/debug/release`, { method: "POST", body: "{}" });
  },

  async debugConfig(projectId: string): Promise<Partial<DebugProjectConfig>> {
    return request(`/projects/${encodeURIComponent(projectId)}/debug/config`);
  },

  async saveDebugConfig(projectId: string, config: Partial<DebugProjectConfig>): Promise<void> {
    await request(`/projects/${encodeURIComponent(projectId)}/debug/config`, {
      method: "PUT",
      body: JSON.stringify(config),
    });
  },

  debugSocketUrl(projectId: string): string {
    const base = (apiBase || window.location.origin).replace(/\/+$/, "");
    return `${base.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:")}/api/projects/${encodeURIComponent(projectId)}/debug/ws`;
  },

  async dbProfiles(projectRoot?: string): Promise<DBProfile[]> {
    const query = projectRoot ? `?projectRoot=${encodeURIComponent(projectRoot)}` : "";
    return request<DBProfile[]>(`/db/profiles${query}`);
  },

  async createDBProfile(input: DBProfileInput): Promise<DBProfile> {
    return request<DBProfile>("/db/profiles", { method: "POST", ...json(input) });
  },

  async deleteDBProfile(id: string): Promise<void> {
    await request(`/db/profiles/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async testDBProfile(id: string): Promise<void> {
    await request(`/db/profiles/${encodeURIComponent(id)}/test`, {
      method: "POST",
      body: "{}",
    });
  },

  async queryDB(id: string, sql: string, maxRows = 500): Promise<QueryResult> {
    return request<QueryResult>(`/db/profiles/${encodeURIComponent(id)}/query`, {
      method: "POST",
      ...json({ sql, maxRows }),
    });
  },

  async dbSchema(id: string): Promise<SchemaTable[]> {
    return request<SchemaTable[]>(`/db/profiles/${encodeURIComponent(id)}/schema`);
  },

  async insertRow(id: string, change: RowChange): Promise<{ rowsAffected: number }> {
    return request(`/db/profiles/${encodeURIComponent(id)}/row`, {
      method: "POST",
      ...json(change),
    });
  },

  async updateRow(id: string, change: RowChange): Promise<{ rowsAffected: number }> {
    return request(`/db/profiles/${encodeURIComponent(id)}/row`, {
      method: "PUT",
      ...json(change),
    });
  },

  async deleteRow(id: string, change: RowChange): Promise<{ rowsAffected: number }> {
    return request(`/db/profiles/${encodeURIComponent(id)}/row`, {
      method: "DELETE",
      ...json(change),
    });
  },

  async webTargets(): Promise<WebTarget[]> {
    return request<WebTarget[]>("/web-targets");
  },

  async createWebTarget(name: string, url: string): Promise<WebTarget> {
    return request<WebTarget>("/web-targets", {
      method: "POST",
      ...json({ name, url }),
    });
  },

  async deleteWebTarget(id: string): Promise<void> {
    await request(`/web-targets/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async emailAccounts(): Promise<EmailAccount[]> {
    return request<EmailAccount[]>("/email/accounts");
  },

  async createEmailAccount(input: EmailAccountInput): Promise<EmailAccount> {
    return request<EmailAccount>("/email/accounts", { method: "POST", ...json(input) });
  },

  async deleteEmailAccount(id: string): Promise<void> {
    await request(`/email/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async testEmailAccount(id: string): Promise<void> {
    await request(`/email/accounts/${encodeURIComponent(id)}/test`, { method: "POST", ...json({}) });
  },

  async emailMessages(id: string, limit = 20): Promise<EmailMessageSummary[]> {
    return request<EmailMessageSummary[]>(`/email/accounts/${encodeURIComponent(id)}/messages?limit=${limit}`);
  },

  async emailMessage(id: string, uid: string): Promise<EmailMessage> {
    return request<EmailMessage>(`/email/accounts/${encodeURIComponent(id)}/messages/${encodeURIComponent(uid)}`);
  },

  async deleteEmailMessage(id: string, uid: string): Promise<void> {
    await request(`/email/accounts/${encodeURIComponent(id)}/messages/${encodeURIComponent(uid)}/delete`, { method: "POST", ...json({}) });
  },

  async sendEmail(id: string, input: EmailSendInput): Promise<void> {
    await request(`/email/accounts/${encodeURIComponent(id)}/send`, { method: "POST", ...json(input) });
  },
  async workspaceRoots(): Promise<{ roots: string[] }> {
    return request<{ roots: string[] }>("/workspaces/roots");
  },

  async addWorkspaceRoot(path: string): Promise<{ roots: string[] }> {
    return request<{ roots: string[] }>("/workspaces/roots", {
      method: "POST",
      ...json({ path }),
    });
  },

  async removeWorkspaceRoot(path: string): Promise<{ roots: string[] }> {
    return request<{ roots: string[] }>(`/workspaces/roots?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    });
  },

  async aiConfig(): Promise<AIConfig> {
    return request<AIConfig>("/ai/config");
  },

  async aiModels(): Promise<{ models: AIModel[] }> {
    return request<{ models: AIModel[] }>("/ai/models");
  },



  async saveAIConfig(input: AIConfigInput): Promise<AIConfig> {
    return request<AIConfig>("/ai/config", {
      method: "PUT",
      ...json(input),
    });
  },

  async testAI(): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/ai/test", { method: "POST", ...json({}) });
  },

  async aiChat(
    messages: AIMessage[],
    options: { model?: string; effort?: string; yolo?: boolean; projectId?: string; tools?: string[] } = {},
  ): Promise<{ text: string }> {
    return request<{ text: string }>("/ai/chat", {
      method: "POST",
      ...json({ messages, ...options }),
    });
  },

  async aiComplete(input: {
    path: string;
    language: string;
    prefix: string;
    suffix: string;
  }, signal?: AbortSignal): Promise<{ completion: string }> {
    const response = await fetch(`${apiBase}${API_BASE}/ai/complete`, {
      method: "POST",
      credentials: "include",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken() ? { "X-Toph-CSRF": csrfToken() } : {}),
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = (await response.json()) as { error?: string };
        message = body.error ?? message;
      } catch {
        // Keep status text.
      }
      throw new ApiError(response.status, message);
    }
    return (await response.json()) as { completion: string };
  },
};
