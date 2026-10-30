import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Minus,
  Plus,
  Bot,
  FileDiff,
  Undo2,
} from "@toph/icons";
import { api, type Project } from "../api";
import { expandGitPattern, sanitizeBranchName } from "../lib";
import { suggestGitChanges } from "../gitAi";
import { parseGitStatus, statusLabel } from "../gitStatus";
import { useSettings } from "../settings";
import { useApp } from "../store";
import { useAI } from "../ai";
import { usePet } from "../pet";
import { Button } from "@/boardui/base/buttons/button";
import { IconButton } from "@/boardui/base/buttons/icon-button";
import { Input } from "@/boardui/base/input/input";
import { Badge } from "@/boardui/base/badges/badge";
import FileIcon from "../ui/FileIcon";
import GitStatusIcon from "../ui/GitStatusIcon";
import { useConfirm } from "../ui/confirm";
import { useProjectEvents } from "../projectEvents";


function changeName(path: string): string {
  return path.split("/").pop() || path;
}

function changeDir(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

interface Props {
  project: Project;
  onOpenDiff: (path: string, staged: boolean) => void;
  embedded?: boolean;
  onStatusChange?: (status: string) => void;
  view?: "full" | "changes" | "commit" | "scm";
}

export default function SourceControlPanel({
  project,
  onOpenDiff,
  embedded = false,
  onStatusChange,
  view = "full",
}: Props) {
  const notify = useApp((state) => state.notify);
  const user = useApp((state) => state.user);
  const aiConfig = useAI((state) => state.config);
  const settings = useSettings();
  const confirm = useConfirm();
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [changesOpen, setChangesOpen] = useState(true);
  const showBranch = view === "full";
  const showCommit = view !== "changes";
  const showChanges = view !== "commit";

  const load = useCallback(async () => {
    try {
      const next = await api.gitStatus(project.id);
      setStatus(next);
      setError("");
      onStatusChange?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read Git status.");
    }
  }, [onStatusChange, project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useProjectEvents(project.id, ["git", "files"], () => void load());

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("toph:git-changed", refresh);
    return () => window.removeEventListener("toph:git-changed", refresh);
  }, [load]);

  const parsed = useMemo(() => parseGitStatus(status), [status]);
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
      const petEnabled = usePet.getState().enabled;
      usePet.getState().feed();
      setMessage("");
      await load();
      notify("success", petEnabled ? "Changes committed. Seu pet foi alimentado." : "Changes committed.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not commit changes.");
    } finally {
      setBusy("");
    }
  }

  async function discardAll() {
    const paths = [...new Set([...staged, ...unstaged].map((change) => change.path))];
    if (!paths.length) return;
    const ok = await confirm({
      title: "Discard all changes?",
      message: `Discard all ${paths.length} changed file${paths.length === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Discard all",
      danger: true,
    });
    if (!ok) return;
    setBusy("discard");
    try {
      await api.gitDiscard(project.id, paths, true);
      await api.gitDiscard(project.id, paths, false);
      await load();
      notify("success", "All changes discarded.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not discard changes.");
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
    <div className="flex min-h-0 flex-col">
      {!embedded && (
        <div className="flex h-9 shrink-0 items-center border-b px-3 text-body-2-medium text-text-secondary">
          Source Control
        </div>
      )}
      {showBranch && (
        <div className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5">
          <GitBranch size={13} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs">{parsed.branch || "detached"}</span>
          <Badge color="neutral">{parsed.changes.length}</Badge>
          <Button variant="ghost" size="xs" aria-label={changesOpen ? "Recolher alterações" : "Expandir alterações"} onClick={() => setChangesOpen((current) => !current)}>
            {changesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </Button>
          <Button variant="ghost" size="xs" aria-label="Discard all changes" disabled={Boolean(busy) || parsed.changes.length === 0} onClick={() => void discardAll()}><Undo2 size={13} /></Button>
          <Button variant="ghost" size="xs" aria-label="Create branch from pattern" disabled={Boolean(busy)} onClick={() => void createBranch()}><GitBranch size={13} /></Button>
        </div>
      )}
      {error && <div className="mx-2 mt-2 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">{error}</div>}
      {showCommit && (
        <div
          className="flex shrink-0 flex-col gap-2 border-b p-2"
          onKeyDownCapture={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void commit(); } }}
        >
          <div className="relative w-full">
            <Input value={message} onChange={setMessage} placeholder={`Message (Ctrl+Enter to commit on "${parsed.branch || "detached"}")`} aria-label="Commit message" fieldClassName="w-full pe-9" />
            <IconButton
              icon={Bot}
              size="small"
              aria-label="Generate message from pattern"
              title="Generate commit message"
              disabled={Boolean(busy)}
              onClick={() => void generateMessage()}
              className="absolute end-1 top-1/2 size-6 -translate-y-1/2 border-transparent bg-transparent p-0 shadow-none [&_svg]:size-4"
            />
          </div>
          <Button size="small" className="w-full justify-center" disabled={staged.length === 0 || Boolean(busy)} onClick={() => void commit()} leadingIcon={Check}>Commit</Button>
        </div>
      )}
      {showChanges && (view === "changes" || changesOpen) && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {staged.length > 0 && (
            <section className="border-b pb-1">
              <div className="flex h-8 items-center justify-between px-2">
                <span className="text-caption-1-semibold uppercase tracking-wide text-text-secondary">Staged Changes</span>
                <span className="flex items-center gap-1">
                  <Button variant="ghost" size="xs" iconOnly leadingIcon={Minus} aria-label="Unstage all" title="Unstage all" onClick={() => void unstage(staged.map((change) => change.path))} />
                  <Button variant="ghost" size="xs" iconOnly leadingIcon={Undo2} aria-label="Discard all staged changes" title="Discard all staged changes" onClick={() => void discard(staged.map((change) => change.path), true)} />
                  <span className="flex size-5 items-center justify-center rounded-full bg-background-tertiary-default text-caption-2-semibold text-text-secondary">{staged.length}</span>
                </span>
              </div>
              {staged.map((change) => (
                <div className="group relative flex h-8 items-center gap-0.5 px-1" key={`staged:${change.path}`}>
                  <Button variant="ghost" size="small" className="h-8 min-w-0 flex-1 justify-start gap-1.5 px-1.5 pe-9" title={change.path} onClick={() => onOpenDiff(change.path, true)}>
                    <FileIcon name={change.path} path={change.path} size={14} />
                    <span className="shrink-0 truncate text-body-2-medium text-text-primary">{changeName(change.path)}</span>
                    <span className="min-w-0 flex-1 truncate text-caption-1-regular text-text-tertiary">{changeDir(change.path)}</span>
                  </Button>
                  <span className="absolute end-6 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 bg-background-primary-default ps-1 group-hover:flex">
                    <Button variant="ghost" size="xs" iconOnly leadingIcon={FileDiff} aria-label="Open changes" title="Open changes" onClick={() => onOpenDiff(change.path, true)} />
                    <Button variant="ghost" size="xs" iconOnly leadingIcon={Minus} aria-label="Unstage" title="Unstage" onClick={() => void unstage([change.path])} />
                    <Button variant="ghost" size="xs" iconOnly leadingIcon={Undo2} aria-label="Discard changes" title="Discard changes" onClick={() => void discard([change.path], true)} />
                  </span>
                  <GitStatusIcon status={statusLabel(change)} staged size={13} className="me-0.5" />
                </div>
              ))}
            </section>
          )}
          <section className="pb-1">
            <div className="flex h-8 items-center justify-between px-2">
              <span className="text-caption-1-semibold uppercase tracking-wide text-text-secondary">Changes</span>
              <span className="flex items-center gap-1">
                <Button variant="ghost" size="xs" iconOnly leadingIcon={Undo2} aria-label="Discard all changes" title="Discard all changes" disabled={unstaged.length === 0} onClick={() => void discard(unstaged.map((change) => change.path), false)} />
                <Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Stage all" title="Stage all" disabled={unstaged.length === 0} onClick={() => void stage(unstaged.map((change) => change.path))} />
                <span className="flex size-5 items-center justify-center rounded-full bg-background-tertiary-default text-caption-2-semibold text-text-secondary">{unstaged.length}</span>
              </span>
            </div>
            {unstaged.length === 0 && staged.length === 0 && !error && <div className="px-2 py-3 text-[11px] text-muted-foreground">Nenhuma alteração.</div>}
            {unstaged.map((change) => (
              <div className="group relative flex h-8 items-center gap-0.5 px-1" key={`unstaged:${change.path}`}>
                <Button variant="ghost" size="small" className="h-8 min-w-0 flex-1 justify-start gap-1.5 px-1.5 pe-9" title={change.path} onClick={() => onOpenDiff(change.path, false)}>
                  <FileIcon name={change.path} path={change.path} size={14} />
                  <span className="shrink-0 truncate text-body-2-medium text-text-primary">{changeName(change.path)}</span>
                  <span className="min-w-0 flex-1 truncate text-caption-1-regular text-text-tertiary">{changeDir(change.path)}</span>
                </Button>
                <span className="absolute end-6 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 bg-background-primary-default ps-1 group-hover:flex">
                  <Button variant="ghost" size="xs" iconOnly leadingIcon={FileDiff} aria-label="Open changes" title="Open changes" onClick={() => onOpenDiff(change.path, false)} />
                  <Button variant="ghost" size="xs" iconOnly leadingIcon={Undo2} aria-label="Discard changes" title="Discard changes" onClick={() => void discard([change.path], false)} />
                  <Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Stage" title="Stage changes" onClick={() => void stage([change.path])} />
                </span>
                <GitStatusIcon status={statusLabel(change)} size={13} className="me-0.5" />
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
