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

export interface Repository {
  name: string;
  path: string;
  root: string;
  relative: string;
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


export interface AIConfig {
  provider: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  autocomplete: boolean;
  systemPrompt: string;
  hasKey: boolean;
}

export interface AIConfigInput {
  provider: string;
  baseUrl: string;
  apiKey?: string;
  clearKey?: boolean;
  model: string;
  maxTokens: number;
  temperature: number;
  autocomplete: boolean;
  systemPrompt: string;
}

export interface AIModel {
  id: string;
  label: string;
  provider: string;
  variants?: string[];
  inputs?: string[];
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
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

export interface WorkspaceLayout {
  tabs: unknown[];
  activeTabId: string | null;
  sidebar?: string;
  terminalOpen?: boolean;
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

export function setApiBase(value: string): void {
  apiBase = value.trim().replace(/\/+$/, "");
}

export function getApiBase(): string {
  return apiBase;
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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

  async startUpdate(): Promise<UpdateStart> {
    return request("/update", { method: "POST", ...json({}) });
  },

  async registerPushToken(token: string, platform: string): Promise<void> {
    await request("/push/tokens", {
      method: "POST",
      ...json({ token, platform }),
    });
  },

  async login(username: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>("/auth/login", {
      method: "POST",
      ...json({ username, password, kind: "web" }),
    });
  },

  async me(): Promise<User> {
    const response = await request<{ user: User }>("/auth/me");
    return response.user;
  },

  async logout(): Promise<void> {
    await request("/auth/logout", { method: "POST", body: JSON.stringify({}) });
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

  async createTerminal(projectId: string): Promise<{ id: string; projectId: string }> {
    return request(`/projects/${encodeURIComponent(projectId)}/terminals`, {
      method: "POST",
      body: "{}",
    });
  },

  async closeProjectTerminals(projectId: string): Promise<{ ok: boolean; closed: number }> {
    return request(`/projects/${encodeURIComponent(projectId)}/terminals`, {
      method: "DELETE",
    });
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
    options: { model?: string; effort?: string; yolo?: boolean } = {},
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

export function openCodeBase(): string {
  return `${apiBase}${API_BASE}/opencode`;
}
