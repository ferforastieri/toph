import { api, type AIConfig } from "../../shared/api";

export interface GitSuggestion { task: string; slug: string; summary: string }

export async function suggestGitChanges(config: AIConfig | null, diff: string, branch: string): Promise<GitSuggestion> {
  if (!config?.model) throw new Error("Configure um modelo para gerar a sugestão.");
  if (!diff.trim()) throw new Error("Não há alterações para analisar.");
  const prompt = `Read the Git diff and return only valid JSON: {"task":"ISSUE-KEY-OR-EMPTY","slug":"short-kebab-case","summary":"short imperative summary"}. Infer an issue key only when present. Branch: ${branch}\nDiff:\n${diff.slice(0, 16000)}`;
  const result = await api.aiChat([{ role: "user", content: prompt }], { model: config.model });
  const raw = result.text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const value = JSON.parse(raw) as GitSuggestion;
  if (typeof value.task !== "string" || typeof value.slug !== "string" || typeof value.summary !== "string") throw new Error("O modelo retornou uma sugestão inválida.");
  return value;
}
