import { request, getApiBase } from "../../shared/api";
import type { ChatMessage, ChatToph } from "../conversations/store";
import type { AgentAttachment } from "../conversations/components/AgentComposer";
import type { AgentQuestion } from "../conversations/components/AgentQuestionCard";

export interface AgentRun {
  id: string; sessionId: string; parentId?: string; chatId: string; agentId: string;
  state: "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled" | "interrupted";
  error: string; createdAt: number; finishedAt?: number;
}
export interface Approval { id: string; runId: string; agentId: string; name: string; arguments: string }
export interface AgentQuestionPrompt {
  id: string; runId: string; agentId: string; name: string; arguments: string;
  questions: AgentQuestion[];
}
/** A pending ask_user call, enough to flag the project and open its chat. */
export interface PendingQuestion {
  id: string; chatId: string; runId: string; agentId: string;
}
export interface NativeMessage extends ChatMessage { seq?: number; runId?: string; model?: string; agentMode?: "build" | "plan"; activity?: string; phase?: string }
export interface AgentSnapshot { messages: NativeMessage[]; drafts: NativeMessage[]; runs: AgentRun[]; approvals: Approval[]; questions: AgentQuestionPrompt[]; hasMore: boolean; cursor: number | null }
export interface AgentSearchResult { id: string; sessionId: string; chatId: string; agentId: string; role: "user" | "assistant"; text: string; createdAt: number }
export interface TophUsage { agentId: string; inputTokens: number; outputTokens: number; cachedTokens: number; calls: number }
export interface AgentUsage { inputTokens: number; outputTokens: number; cachedTokens: number; calls: number; byAgent?: TophUsage[] }
export interface Connection { id: string; label: string; provider: string; baseUrl: string; model: string; hasKey: boolean }
export interface McpServer { id: string; name: string; transport: "stdio" | "http"; url: string; command: string[]; token?: string; env?: Record<string, string>; envKeys?: string[]; hasToken: boolean; timeoutSeconds?: number; autoApprove?: boolean }

export interface EngineInfo {
  id: string;
  label: string;
  binary: string;
  installed: boolean;
  path?: string;
  login: string;
  install: string;
  site: string;
  supported: boolean;
}
export interface EngineTest {
  ok: boolean;
  installed: boolean;
  path?: string;
  version?: string;
  message: string;
  modelCount?: number;
  models?: string[];
}
export interface EngineInstall {
  ok: boolean;
  installed: boolean;
  already: boolean;
  path?: string;
  output: string;
  message: string;
}
export interface EngineUpdate {
  ok: boolean;
  installed: boolean;
  path?: string | null;
  version?: string | null;
  output: string;
  message: string;
}
export interface UsageWindow {
  percent: number;
  limited: boolean;
  resetsAt: number;
}
export interface UsageLimits {
  workspace?: { id: string; name: string; usageURL: string };
  go?: { rolling: UsageWindow; weekly: UsageWindow; monthly: UsageWindow };
  budgets?: unknown[];
}
export interface EngineLimits {
  ok: boolean;
  data?: UsageLimits | null;
  message?: string;
}

const root = (project: string) => `/projects/${encodeURIComponent(project)}/agent`;
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
export const agentApi = {
  start: (project: string, input: { requestId: string; chatId: string; chatDescription?: string; agentId: string; text: string; agents: Array<ChatToph & { chatId: string }>; attachments?: AgentAttachment[] }) => request<AgentRun>(`${root(project)}/runs`, { ...post(input), signal: AbortSignal.timeout(120_000) }),
  activeRuns: (project: string) => request<AgentRun[]>(`${root(project)}/runs`),
  pendingQuestions: (project: string) => request<PendingQuestion[]>(`${root(project)}/questions`),
  cancel: (project: string, run: string) => request(`${root(project)}/runs/${encodeURIComponent(run)}/cancel`, post({})),
  cancelAgent: (project: string, agentId: string) => request(`${root(project)}/cancel`, post({ agentId })),
  deleteChat: (project: string, chatId: string) => request(`${root(project)}/chats/${encodeURIComponent(chatId)}`, { method: "DELETE" }),
  snapshot: (project: string, chat: string, before?: number | null) => request<AgentSnapshot>(`${root(project)}/snapshot?chatId=${encodeURIComponent(chat)}${before == null ? "" : `&before=${before}`}`),
  searchMessages: (project: string, query: string) => request<AgentSearchResult[]>(`${root(project)}/search?q=${encodeURIComponent(query)}`),
  events: (project: string) => `${getApiBase()}/api${root(project)}/events`,
  switchSession: (project: string, agentId: string, sessionId: string | null, chatId: string) => request(`${root(project)}/sessions`, post({ agentId, sessionId, chatId })),
  deleteToph: (project: string, agentId: string) => request(`${root(project)}/tophs/${encodeURIComponent(agentId)}`, { method: "DELETE" }),
  approve: (project: string, call: string, approved: boolean) => request(`${root(project)}/approvals/${encodeURIComponent(call)}`, post({ approved })),
  answer: (project: string, call: string, answer: string) => request(`${root(project)}/approvals/${encodeURIComponent(call)}`, post({ answers: answer })),
  usage: (project: string, chat?: string) => request<AgentUsage>(`${root(project)}/usage${chat ? `?chatId=${encodeURIComponent(chat)}` : ""}`),
  connections: () => request<Connection[]>("/ai/connections"),
  saveConnection: (input: Partial<Connection> & { apiKey?: string; clearKey?: boolean }) => request("/ai/connections", post(input)),
  deleteConnection: (id: string) => request(`/ai/connections/${encodeURIComponent(id)}`, { method: "DELETE" }),
  mcpServers: () => request<McpServer[]>("/mcp/servers"),
  saveMcp: (input: Partial<McpServer> & { token?: string; env?: Record<string, string> }) => request<{ ok: boolean; id?: string }>("/mcp/servers", post(input)),
  deleteMcp: (id: string) => request(`/mcp/servers/${encodeURIComponent(id)}`, { method: "DELETE" }),
  testMcp: (id: string) => request<{ ok: boolean; tools: number }>(`/mcp/servers/${encodeURIComponent(id)}/test`, post({})),
};

export const engineApi = {
  list: () => request<EngineInfo[]>("/engines"),
  test: (id: string) => request<EngineTest>(`/engines/${encodeURIComponent(id)}/test`, post({})),
  install: (id: string) => request<EngineInstall>(`/engines/${encodeURIComponent(id)}/install`, post({})),
  update: (id: string) => request<EngineUpdate>(`/engines/${encodeURIComponent(id)}/update`, post({})),
  limits: (id: string) => request<EngineLimits>(`/engines/${encodeURIComponent(id)}/limits`),
};

export function isActive(run: AgentRun): boolean { return ["queued", "running", "waiting"].includes(run.state); }
