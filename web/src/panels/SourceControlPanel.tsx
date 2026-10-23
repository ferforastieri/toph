import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, GitBranch, Minus, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { api, type Project } from "../api";
import { expandGitPattern, sanitizeBranchName } from "../lib";
import { suggestGitChanges } from "../gitAi";
import { useSettings } from "../settings";
import { useApp } from "../store";
import { useAI } from "../ai";
import { Button } from "../ui/Button";
import FileIcon from "../ui/FileIcon";
import { useConfirm } from "../ui/Confirm";

interface Props {
  project: Project;
  onOpenDiff: (path: string, staged: boolean) => void;
}

interface Change {
  path: string;
  index: string;
  worktree: string;
  staged: boolean;
  unstaged: boolean;
}

function parseStatus(raw: string): { branch: string; changes: Change[] } {
  let branch = "";
  const changes: Change[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    if (line.startsWith("## ")) {
      branch = line.slice(3).split("...")[0].split(" ")[0] ?? "";
      continue;
    }
    if (line.length < 4) continue;
    const index = line[0];
    const worktree = line[1];
    let path = line.slice(3);
    if (path.includes(" -> ")) path = path.split(" -> ").pop() ?? path;
    path = path.replace(/^"|"$/g, "");
    if (!path) continue;
    changes.push({
      path,
      index,
      worktree,
      staged: index !== " " && index !== "?",
      unstaged: worktree !== " " || index === "?",
    });
  }
  return { branch, changes };
}

function statusLabel(change: Change): string {
  if (change.index === "?") return "U";
  if (change.index !== " ") return change.index;
  return change.worktree.trim() || "M";
}

export default function SourceControlPanel({ project, onOpenDiff }: Props) {
  const notify = useApp((state) => state.notify);
  const user = useApp((state) => state.user);
  const aiConfig = useAI((state) => state.config);
  const settings = useSettings();
  const iconTheme = useSettings((state) => state.iconTheme);
  const confirm = useConfirm();
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await api.gitStatus(project.id);
      setStatus(next);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read Git status.");
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const parsed = useMemo(() => parseStatus(status), [status]);
  const staged = parsed.changes.filter((change) => change.staged);
  const unstaged = parsed.changes.filter((change) => change.unstaged);

  async function stage(paths: string[]) {
    if (!paths.length) return;
    setBusy("stage");
    try {
      await api.gitStage(project.id, paths);
      await load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not stage files.");
    } finally {
      setBusy("");
    }
  }

  async function unstage(paths: string[]) {
    if (!paths.length) return;
    setBusy("unstage");
    try {
      await api.gitUnstage(project.id, paths);
      await load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not unstage files.");
    } finally {
      setBusy("");
    }
  }

  async function collectDiff(stagedOnly: boolean): Promise<string> {
    const entries = stagedOnly ? staged : [...staged, ...unstaged];
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const change of entries) {
      if (seen.has(change.path)) continue;
      seen.add(change.path);
      const isStaged = stagedOnly || (change.staged && !change.unstaged);
      const diff = await api.gitDiff(project.id, change.path, isStaged).catch(() => "");
      if (diff) parts.push(diff);
    }
    return parts.join("\n").slice(0, 16000);
  }

  async function buildCommitMessage(): Promise<string> {
    const diff = await collectDiff(true) || await collectDiff(false);
    const suggestion = await suggestGitChanges(aiConfig, diff, parsed.branch);
    const generated = expandGitPattern(settings.gitCommitPattern, {
      repo: project.name,
      branch: parsed.branch,
      user: user?.username ?? "",
      task: suggestion.task,
      slug: suggestion.slug,
      summary: suggestion.summary,
    }).replace(/\s+/g, " ").trim();
    return generated || suggestion.summary || "chore: update project files";
  }

  async function generateMessage() {
    if (busy) return;
    setBusy("generate");
    try {
      setMessage(await buildCommitMessage());
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not generate commit message.");
    } finally {
      setBusy("");
    }
  }

  async function commit() {
    if (!staged.length) return;
    setBusy("commit");
    try {
      const finalMessage = message.trim() || await buildCommitMessage();
      await api.gitCommit(project.id, finalMessage);
      setMessage("");
      await load();
      notify("success", "Changes committed.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not commit changes.");
    } finally {
      setBusy("");
    }
  }

  async function createBranch() {
    setBusy("branch");
    try {
      const diff = await collectDiff(false);
      const suggestion = await suggestGitChanges(aiConfig, diff, parsed.branch);
      const base = sanitizeBranchName(expandGitPattern(settings.gitBranchPattern, {
        repo: project.name,
        branch: parsed.branch,
        user: user?.username ?? "",
        task: suggestion.task,
        slug: suggestion.slug || "update",
        summary: suggestion.summary,
      }));
      let name = base;
      for (let attempt = 2; attempt < 8; attempt += 1) {
        try {
          const created = await api.gitCreateBranch(project.id, name);
          await load();
          notify("success", `Branch ${created} created and checked out.`);
          return;
        } catch (err) {
          const text = err instanceof Error ? err.message : "";
          if (!/already exists|já existe/i.test(text)) throw err;
          name = `${base}-${attempt}`;
        }
      }
      throw new Error("Could not create a unique branch name.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not create branch.");
    } finally {
      setBusy("");
    }
  }

  async function discard(paths: string[], stagedChange: boolean) {
    if (!paths.length) return;
    const ok = await confirm({
      title: "Discard changes?",
      message: `Discard ${paths.length === 1 ? paths[0] : `${paths.length} files`}? This cannot be undone.`,
      confirmLabel: "Discard",
      danger: true,
    });
    if (!ok) return;
    setBusy("discard");
    try {
      await api.gitDiscard(project.id, paths, stagedChange);
      await load();
      notify("success", "Changes discarded.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not discard changes.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="panel scm-panel">
      <div className="panel-heading">
        <span>Source Control</span>
        <Button className="icon-button" title="Refresh" onClick={() => void load()}>
          <RefreshCw size={14} />
        </Button>
      </div>
      <div className="scm-branch">
        <GitBranch size={13} />
        <span>{parsed.branch || "detached"}</span>
        <b>{parsed.changes.length}</b>
        <Button
          className="icon-button scm-branch-button"
          title="Create branch from pattern"
          aria-label="Create branch from pattern"
          disabled={Boolean(busy)}
          onClick={() => void createBranch()}
        >
          <GitBranch size={13} />
          <Plus size={9} className="scm-branch-plus" />
        </Button>
      </div>

      {error && <div className="panel-error">{error}</div>}

      <div className="scm-commit">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Message (Ctrl+Enter to commit)"
          aria-label="Commit message"
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void commit();
          }}
        />
        <div className="scm-commit-actions">
          <Button
            className="ghost scm-generate"
            title="Generate message from pattern"
            disabled={Boolean(busy)}
            onClick={() => void generateMessage()}
          >
            <Sparkles size={13} />
          </Button>
          <Button
            className="primary scm-commit-button"
            disabled={staged.length === 0 || Boolean(busy)}
            onClick={() => void commit()}
          >
            <Check size={13} /> Commit
          </Button>
        </div>
      </div>

      <div className="scm-sections">
        {staged.length > 0 && (
          <section className="scm-section">
            <div className="scm-section-head">
              <span>Staged Changes</span>
              <span className="scm-section-actions">
                <Button className="icon-button" title="Unstage all" onClick={() => void unstage(staged.map((change) => change.path))}>
                  <Minus size={13} />
                </Button>
                <Button className="icon-button danger" title="Discard all staged changes" onClick={() => void discard(staged.map((change) => change.path), true)}>
                  <Trash2 size={13} />
                </Button>
              </span>
            </div>
            {staged.map((change) => (
              <div className="scm-file" key={`staged:${change.path}`}>
                <Button className="scm-file-main" title={change.path} onClick={() => onOpenDiff(change.path, true)}>
                  <span className={`scm-status ${change.index.trim() || "M"}`}>{statusLabel(change)}</span>
                  <FileIcon name={change.path} iconTheme={iconTheme} size={13} />
                  <span className="scm-path">{change.path}</span>
                </Button>
                <Button className="scm-action" title="Unstage" onClick={() => void unstage([change.path])}>
                  <Minus size={12} />
                </Button>
                <Button className="scm-action danger" title="Discard changes" onClick={() => void discard([change.path], true)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
          </section>
        )}

        <section className="scm-section">
          <div className="scm-section-head">
            <span>Changes</span>
            {unstaged.length > 0 && (
              <span className="scm-section-actions">
                <Button className="icon-button" title="Stage all" onClick={() => void stage(unstaged.map((change) => change.path))}>
                  <Plus size={13} />
                </Button>
                <Button className="icon-button danger" title="Discard all changes" onClick={() => void discard(unstaged.map((change) => change.path), false)}>
                  <Trash2 size={13} />
                </Button>
              </span>
            )}
          </div>
          {unstaged.length === 0 && staged.length === 0 && !error && (
            <div className="scm-empty">No changes.</div>
          )}
          {unstaged.map((change) => (
            <div className="scm-file" key={`unstaged:${change.path}`}>
              <Button className="scm-file-main" title={change.path} onClick={() => onOpenDiff(change.path, false)}>
                <span className={`scm-status ${change.index === "?" ? "U" : change.worktree.trim() || "M"}`}>
                  {statusLabel(change)}
                </span>
                <FileIcon name={change.path} iconTheme={iconTheme} size={13} />
                <span className="scm-path">{change.path}</span>
              </Button>
              <Button className="scm-action" title="Stage" onClick={() => void stage([change.path])}>
                <Plus size={12} />
              </Button>
              <Button className="scm-action danger" title="Discard changes" onClick={() => void discard([change.path], false)}>
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
