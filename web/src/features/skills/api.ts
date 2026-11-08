import { request } from "../../shared/api";

export type SkillState = "active" | "pending" | "archived";

export interface SkillRecord {
  id: string;
  projectId: string;
  name: string;
  description: string;
  body: string;
  /** Empty means every Toph in the project. */
  agents: string[];
  state: SkillState;
  replaces?: string | null;
  proposedBy?: string | null;
  reason?: string | null;
  source?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SkillVersion {
  id: number;
  skillId: string;
  name: string;
  description: string;
  body: string;
  by: string;
  at: number;
}

export interface SkillDraft {
  id?: string;
  name: string;
  description: string;
  body: string;
  agents: string[];
  source?: string | null;
}

const root = (project: string) => `/projects/${encodeURIComponent(project)}/skills`;
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const skillApi = {
  list: (project: string) => request<SkillRecord[]>(root(project)),
  save: (project: string, input: SkillDraft) => request<SkillRecord>(root(project), post(input)),
  decide: (project: string, id: string, approve: boolean) =>
    request<SkillRecord | null>(`${root(project)}/${encodeURIComponent(id)}/decide`, post({ approve })),
  archive: (project: string, id: string, archived: boolean) =>
    request<SkillRecord>(`${root(project)}/${encodeURIComponent(id)}/archive`, post({ archived })),
  remove: (project: string, id: string) =>
    request<{ ok: boolean }>(`${root(project)}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  versions: (project: string, id: string) =>
    request<SkillVersion[]>(`${root(project)}/${encodeURIComponent(id)}/versions`),
  restore: (project: string, id: string, versionId: number) =>
    request<SkillRecord>(`${root(project)}/${encodeURIComponent(id)}/restore`, post({ versionId })),
};
