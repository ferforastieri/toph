import { request, getApiBase } from "../../shared/api";
import type { ChatMessage, ChatToph } from "../conversations/store";
import type { AgentAttachment } from "../conversations/components/AgentComposer";

export interface AgentRun {
  id: string; sessionId: string; parentId?: string; chatId: string; agentId: string;
  state: "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled" | "interrupted";
  error: string; createdAt: number; finishedAt?: number;
}
export interface AgentSession { id: string; chatId: string; agentId: string; title: string; archived: boolean; createdAt: number; updatedAt: number }
export interface Approval { id: string; runId: string; agentId: string; name: string; arguments: string }
export interface NativeMessage extends ChatMessage { seq?: number }
export interface AgentSnapshot { messages: NativeMessage[]; drafts: NativeMessage[]; runs: AgentRun[]; approvals: Approval[]; hasMore: boolean; cursor: number | null }
export interface AgentUsage { inputTokens: number; outputTokens: number; cachedTokens: number; calls: number }
export interface Connection { id: string; label: string; provider: string; baseUrl: string; model: string; hasKey: boolean }
export interface McpServer { id: string; name: string; transport: "stdio" | "http"; url: string; command: string[]; hasToken: boolean }

const root = (project: string) => `/projects/${encodeURIComponent(project)}/agent`;
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
export const agentApi = {
  start: (project: string, input: { requestId: string; chatId: string; agentId: string; text: string; agents: ChatToph[]; attachments?: AgentAttachment[] }) => request<AgentRun>(`${root(project)}/runs`, post(input)),
  cancel: (project: string, run: string) => request(`${root(project)}/runs/${encodeURIComponent(run)}/cancel`, post({})),
  cancelAgent: (project: string, agentId: string) => request(`${root(project)}/cancel`, post({ agentId })),
  snapshot: (project: string, chat: string, before?: number | null) => request<AgentSnapshot>(`${root(project)}/snapshot?chatId=${encodeURIComponent(chat)}${before == null ? "" : `&before=${before}`}`),
  events: (project: string) => `${getApiBase()}/api${root(project)}/events`,
  sessions: (project: string, agent: string) => request<AgentSession[]>(`${root(project)}/sessions?agentId=${encodeURIComponent(agent)}`),
  switchSession: (project: string, agentId: string, sessionId: string | null) => request(`${root(project)}/sessions`, post({ agentId, sessionId })),
  approve: (project: string, call: string, approved: boolean) => request(`${root(project)}/approvals/${encodeURIComponent(call)}`, post({ approved })),
  usage: (project: string) => request<AgentUsage>(`${root(project)}/usage`),
  connections: () => request<Connection[]>("/ai/connections"),
  saveConnection: (input: Partial<Connection> & { apiKey?: string; clearKey?: boolean }) => request("/ai/connections", post(input)),
  deleteConnection: (id: string) => request(`/ai/connections/${encodeURIComponent(id)}`, { method: "DELETE" }),
  mcpServers: () => request<McpServer[]>("/mcp/servers"),
  saveMcp: (input: Partial<McpServer> & { token?: string }) => request("/mcp/servers", post(input)),
  deleteMcp: (id: string) => request(`/mcp/servers/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export function isActive(run: AgentRun): boolean { return ["queued", "running", "waiting"].includes(run.state); }
