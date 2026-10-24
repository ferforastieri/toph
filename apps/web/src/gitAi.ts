import { api, openCodeBase, type AIConfig } from "./api";

export interface GitSuggestion {
  task: string;
  slug: string;
  summary: string;
}

function csrfToken(): string {
  return document.cookie.match(/(?:^|;\s*)toph_csrf=([^;]+)/)?.[1] ?? "";
}

function fallback(diff: string, branch: string): GitSuggestion {
  const task = diff.match(/\b[A-Z][A-Z0-9]{1,12}-\d+\b/)?.[0]
    ?? branch.match(/\b[A-Z][A-Z0-9]{1,12}-\d+\b/)?.[0]
    ?? "";
  return { task, slug: "update", summary: "update project files" };
}

function parse(text: string, diff: string, branch: string): GitSuggestion {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return fallback(diff, branch);
  try {
    const value = JSON.parse(match[0]) as Partial<GitSuggestion>;
    return {
      task: String(value.task ?? "").trim().toUpperCase(),
      slug: String(value.slug ?? "").trim(),
      summary: String(value.summary ?? "").trim(),
    };
  } catch (error) {
    return fallback(diff, branch);
  }
}

export async function suggestGitChanges(
  config: AIConfig | null,
  diff: string,
  branch: string,
): Promise<GitSuggestion> {
  if (!config || !diff.trim()) return fallback(diff, branch);
  const prompt = `You are a Git assistant. Read the diff and infer the task/changes.
Return ONLY valid JSON, with no Markdown:
{"task":"ISSUE-KEY-OR-EMPTY","slug":"short-kebab-case","summary":"short imperative summary"}
Rules:
- task should be an issue key like VG-780 when one appears in the diff or branch; otherwise empty.
- slug must be 2-5 lowercase kebab-case words describing the change.
- summary must be one concise imperative sentence, without the issue key.
Branch: ${branch || "unknown"}
Diff:
${diff.slice(0, 16000)}`;
  try {
    if (config.provider === "opencode") {
      const split = config.model.indexOf("/");
      const model = split > 0
        ? { providerID: config.model.slice(0, split), id: config.model.slice(split + 1) }
        : undefined;
      const response = await fetch(`${openCodeBase()}/api/experimental/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Toph-CSRF": csrfToken(),
        },
        body: JSON.stringify({ prompt, model }),
      });
      if (!response.ok) return fallback(diff, branch);
      const payload = await response.json() as { data?: { text?: string }; text?: string };
      return parse(payload.data?.text ?? payload.text ?? "", diff, branch);
    }
    const result = await api.aiChat([{ role: "user", content: prompt }], {
      model: config.model,
      effort: "",
      yolo: false,
    });
    return parse(result.text, diff, branch);
  } catch (error) {
    return fallback(diff, branch);
  }
}
