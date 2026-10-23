import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, GitBranch, Minus, Plus, RefreshCw } from "lucide-react";
import { api, type Project } from "../api";
import { useApp } from "../store";
import { Button } from "../ui/Button";

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

  async function commit() {
    if (!message.trim() || !staged.length) return;
    setBusy("commit");
    try {
      await api.gitCommit(project.id, message.trim());
      setMessage("");
      await load();
      notify("success", "Changes committed.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not commit changes.");
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
        <Button
          className="primary scm-commit-button"
          disabled={!message.trim() || staged.length === 0 || Boolean(busy)}
          onClick={() => void commit()}
        >
          <Check size={13} /> Commit
        </Button>
      </div>

      <div className="scm-sections">
        {staged.length > 0 && (
          <section className="scm-section">
            <div className="scm-section-head">
              <span>Staged Changes</span>
              <Button className="icon-button" title="Unstage all" onClick={() => void unstage(staged.map((change) => change.path))}>
                <Minus size={13} />
              </Button>
            </div>
            {staged.map((change) => (
              <div className="scm-file" key={`staged:${change.path}`}>
                <Button className="scm-file-main" title={change.path} onClick={() => onOpenDiff(change.path, true)}>
                  <span className={`scm-status ${change.index.trim() || "M"}`}>{statusLabel(change)}</span>
                  <span className="scm-path">{change.path}</span>
                </Button>
                <Button className="scm-action" title="Unstage" onClick={() => void unstage([change.path])}>
                  <Minus size={12} />
                </Button>
              </div>
            ))}
          </section>
        )}

        <section className="scm-section">
          <div className="scm-section-head">
            <span>Changes</span>
            {unstaged.length > 0 && (
              <Button className="icon-button" title="Stage all" onClick={() => void stage(unstaged.map((change) => change.path))}>
                <Plus size={13} />
              </Button>
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
                <span className="scm-path">{change.path}</span>
              </Button>
              <Button className="scm-action" title="Stage" onClick={() => void stage([change.path])}>
                <Plus size={12} />
              </Button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
