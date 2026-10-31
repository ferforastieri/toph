import { useEffect, useMemo, useState } from "react";
import { Check, GitBranch, Plus, RefreshCw, Trash2, Undo2 } from "@toph/icons";
import { api, type Project } from "../../api";
import { useApp } from "../../store";
import { parseGitStatus, statusLabel, type GitChange } from "../../gitStatus";
import { basename, dirname } from "../../lib";
import { usePet } from "../../pet";
import { useConfirm } from "../../ui/confirm";
import FileIcon from "../../ui/FileIcon";
import GitStatusIcon from "../../ui/GitStatusIcon";
import { Badge } from "@/boardui/base/badges/badge";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";

interface Props {
  project: Project;
  branch: string;
  onOpenDiff: (path: string, staged: boolean) => void;
  onBranch: () => void;
}

export default function GitScreen({ project, branch, onOpenDiff, onBranch }: Props) {
  const notify = useApp((state) => state.notify);
  const confirm = useConfirm();
  const feedPet = usePet((state) => state.feed);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const parsed = useMemo(() => parseGitStatus(status), [status]);
  const staged = parsed.changes.filter((change) => change.staged);
  const unstaged = parsed.changes.filter((change) => change.unstaged);

  async function load() {
    try {
      setStatus(await api.gitStatus(project.id));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ler o Git.");
    }
  }

  useEffect(() => { void load(); }, [project.id]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("toph:git-changed", refresh);
    return () => window.removeEventListener("toph:git-changed", refresh);
  }, [project.id]);

  async function mutate(kind: string, action: () => Promise<void>) {
    setBusy(kind);
    try {
      await action();
      await load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy("");
    }
  }

  async function commit() {
    if (!staged.length) return;
    await mutate("commit", async () => {
      await api.gitCommit(project.id, message.trim() || "chore: update project files");
      setMessage("");
      feedPet();
      notify("success", "Alterações commitadas.");
    });
  }

  async function discard(change: GitChange) {
    const ok = await confirm({
      title: "Descartar alterações?",
      message: `Descartar ${change.path}? Essa ação não pode ser desfeita.`,
      confirmLabel: "Descartar",
      danger: true,
    });
    if (!ok) return;
    await mutate(`discard:${change.path}`, () => api.gitDiscard(project.id, [change.path], change.staged && !change.unstaged));
  }

  function changeRow(change: GitChange, index: number) {
    const stagedChange = change.staged && !change.unstaged;
    const key = `${change.path}:${index}`;
    return (
      <div key={key} className="flex min-h-14 items-center gap-2 border-t border-separator-border px-3 py-2 first:border-t-0">
        <FileIcon name={basename(change.path)} path={change.path} size={17} />
        <button type="button" className="flex min-w-0 flex-1 flex-col items-start text-start" onClick={() => onOpenDiff(change.path, stagedChange)}>
          <span className="w-full truncate text-body-2-medium text-text-primary">{basename(change.path)}</span>
          <span className="w-full truncate text-caption-2-regular text-text-tertiary">{dirname(change.path) || "raiz"}</span>
        </button>
        <GitStatusIcon status={statusLabel(change)} size={14} />
        {stagedChange ? (
          <Button variant="ghost" size="xs" iconOnly leadingIcon={Undo2} aria-label="Despreparar" onClick={() => void mutate("unstage", () => api.gitUnstage(project.id, [change.path]))} />
        ) : (
          <Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Preparar" onClick={() => void mutate("stage", () => api.gitStage(project.id, [change.path]))} />
        )}
        <Button variant="ghost" size="xs" iconOnly leadingIcon={Trash2} aria-label="Descartar" onClick={() => void discard(change)} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background-secondary-default">
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <Button variant="secondary" leadingIcon={GitBranch} className="h-11 w-full justify-start" onClick={onBranch}>
          <span className="flex min-w-0 flex-1 flex-col text-start">
            <span className="text-caption-2-regular text-text-tertiary">Branch atual</span>
            <span className="truncate text-body-2-medium text-text-primary">{branch || parsed.branch || "detached"}</span>
          </span>
          <Badge color="neutral">{parsed.changes.length}</Badge>
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-3xl border border-border-button-white bg-background-primary-default p-3 shadow-xs">
            <p className="text-caption-2-regular text-text-tertiary">Alterações</p>
            <p className="mt-1 text-title-2-medium text-text-primary">{unstaged.length}</p>
          </div>
          <div className="rounded-3xl border border-border-button-white bg-background-primary-default p-3 shadow-xs">
            <p className="text-caption-2-regular text-text-tertiary">Preparadas</p>
            <p className="mt-1 text-title-2-medium text-text-primary">{staged.length}</p>
          </div>
        </div>

        <section className="overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-xs">
          <div className="flex items-center justify-between gap-2 border-b border-separator-border px-3 py-3">
            <strong className="text-body-2-medium text-text-primary">Alterações</strong>
            <Button variant="ghost" size="xs" iconOnly leadingIcon={RefreshCw} aria-label="Atualizar" onClick={() => void load()} />
          </div>
          {error ? <p className="p-3 text-caption-1-regular text-text-error-primary">{error}</p> : null}
          {!error && parsed.changes.length === 0 ? (
            <p className="p-4 text-center text-caption-1-regular text-text-secondary">Nenhuma alteração no workspace.</p>
          ) : null}
          {[...staged, ...unstaged].map(changeRow)}
        </section>

        <section className="rounded-3xl border border-border-button-white bg-background-primary-default p-3 shadow-xs">
          <div className="mb-2 flex items-center justify-between">
            <strong className="text-body-2-medium text-text-primary">Commit</strong>
            <Badge color={staged.length > 0 ? "primary" : "neutral"}>{staged.length} preparada{staged.length === 1 ? "" : "s"}</Badge>
          </div>
          <Input value={message} onChange={setMessage} placeholder="Mensagem do commit" aria-label="Mensagem do commit" fieldClassName="h-10" />
          <Button className="mt-2 h-11 w-full justify-center" leadingIcon={Check} disabled={!staged.length || Boolean(busy)} onClick={() => void commit()}>
            {busy === "commit" ? "Commitando..." : "Commit"}
          </Button>
        </section>
      </div>
    </div>
  );
}
