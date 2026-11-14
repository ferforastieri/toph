import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, GitBranch, Minus, Plus, RefreshCw, Settings2, Sparkles, Trash2, TriangleAlert, Undo2 } from "@toph/icons";
import { api, type GitState, type Project } from "../../../../shared/api";
import { useProjectEvents } from "../../../../features/projects/events";
import { useApp } from "../../../store";
import { parseGitStatus, statusLabel, type GitChange } from "../../../../features/git/status";
import { basename, dirname, expandGitPattern } from "../../../../shared/lib";
import { useAI } from "../../../../features/providers/store";
import { useSettings } from "../../../../features/settings/store";
import { suggestGitChanges } from "../../../../features/git/ai";
import { useConfirm } from "../../../../shared/ui/confirm";
import FileIcon from "../../../../features/explorer/components/FileIcon";
import GitStatusIcon from "../../../../features/git/components/GitStatusIcon";
import { Badge } from "@toph/ui/app";
import { Button } from "@toph/ui/app";
import { Input } from "@toph/ui/app";
import { Modal } from "@toph/ui/app";
import { cx } from "@toph/ui";

interface Props {
  project: Project;
  branch: string;
  onOpenDiff: (path: string, staged: boolean) => void;
  onBranch: () => void;
}

export default function GitScreen({ project, branch, onOpenDiff, onBranch }: Props) {
  const notify = useApp((state) => state.notify);
  const user = useApp((state) => state.user);
  const confirm = useConfirm();
  const aiConfig = useAI((state) => state.config);
  const settings = useSettings();
  const [status, setStatus] = useState("");
  const [repoState, setRepoState] = useState<GitState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const parsed = useMemo(() => parseGitStatus(status), [status]);
  const conflicts = parsed.changes.filter((change) => change.conflicted);
  const staged = parsed.changes.filter((change) => change.staged && !change.conflicted);
  const unstaged = parsed.changes.filter((change) => change.unstaged && !change.conflicted);
  const merging = Boolean(repoState?.merging);

  async function load() {
    try {
      const [nextStatus, nextState] = await Promise.all([
        api.gitStatus(project.id),
        api.gitState(project.id).catch(() => null),
      ]);
      setStatus(nextStatus);
      setRepoState(nextState);
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
  // A merge or checkout run in the terminal changes files; follow the project
  // stream so the source control screen is never stale.
  useProjectEvents(project.id, ["git", "files"], () => void load());

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
    return expandGitPattern(settings.gitCommitPattern, {
      repo: project.name,
      branch: parsed.branch,
      user: user?.username ?? "",
      task: suggestion.task,
      slug: suggestion.slug,
      summary: suggestion.summary,
    }).replace(/\s+/g, " ").trim() || suggestion.summary || "chore: update project files";
  }

  async function generateMessage() {
    if (busy) return;
    setBusy("generate");
    try {
      setMessage(await buildCommitMessage());
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível gerar a mensagem.");
    } finally {
      setBusy("");
    }
  }

  async function commit() {
    if (!staged.length) return;
    await mutate("commit", async () => {
      const finalMessage = message.trim() || await buildCommitMessage();
      await api.gitCommit(project.id, finalMessage);
      setMessage("");
      notify("success", "Alterações commitadas.");
    });
  }

  async function discard(paths: string[], stagedChange: boolean) {
    if (!paths.length) return;
    const ok = await confirm({
      title: "Descartar alterações?",
      message: paths.length === 1 ? `Descartar ${paths[0]}? Essa ação não pode ser desfeita.` : `Descartar ${paths.length} arquivos? Essa ação não pode ser desfeita.`,
      confirmLabel: "Descartar",
      danger: true,
    });
    if (!ok) return;
    await mutate("discard", () => api.gitDiscard(project.id, paths, stagedChange));
  }

  async function discardAll() {
    const paths = [...new Set([...staged, ...unstaged].map((change) => change.path))];
    if (!paths.length) return;
    const ok = await confirm({
      title: "Descartar tudo?",
      message: `Descartar todas as ${paths.length} alterações? Essa ação não pode ser desfeita.`,
      confirmLabel: "Descartar tudo",
      danger: true,
    });
    if (!ok) return;
    await mutate("discard-all", async () => {
      await api.gitDiscard(project.id, paths, true);
      await api.gitDiscard(project.id, paths, false);
      notify("success", "Alterações descartadas.");
    });
  }

  async function continueMerge() {
    await mutate("merge-continue", async () => {
      await api.gitMergeContinue(project.id);
      setMessage("");
      notify("success", "Merge concluído.");
    });
  }

  async function abortMerge() {
    const ok = await confirm({
      title: "Abortar o merge?",
      message: "O merge em andamento será desfeito e as alterações não commitadas dele serão perdidas.",
      confirmLabel: "Abortar merge",
      danger: true,
    });
    if (!ok) return;
    await mutate("merge-abort", async () => {
      await api.gitMergeAbort(project.id);
      notify("success", "Merge abortado.");
    });
  }

  function conflictRow(change: GitChange, index: number) {
    return (
      <div key={`conflict:${change.path}:${index}`} className="flex min-h-14 items-center gap-2 border-t border-separator-border px-3 py-2 first:border-t-0">
        <FileIcon name={basename(change.path)} path={change.path} size={17} />
        <button type="button" className="flex min-w-0 flex-1 flex-col items-start text-start" onClick={() => onOpenDiff(change.path, false)}>
          <span className="w-full truncate text-body-2-medium text-text-primary">{basename(change.path)}</span>
          <span className="w-full truncate text-caption-2-regular text-status-rose-text">{dirname(change.path) || "raiz"} · resolver conflito</span>
        </button>
        <GitStatusIcon status="U" size={14} />
        <Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Marcar como resolvido" title="Marcar como resolvido" onClick={() => void mutate("stage-conflict", () => api.gitStage(project.id, [change.path]))} />
      </div>
    );
  }

  function changeRow(change: GitChange, mode: "staged" | "unstaged", index: number) {
    const isStaged = mode === "staged";
    return (
      <div key={`${mode}:${change.path}:${index}`} className="flex min-h-14 items-center gap-2 border-t border-separator-border px-3 py-2 first:border-t-0">
        <FileIcon name={basename(change.path)} path={change.path} size={17} />
        <button type="button" className="flex min-w-0 flex-1 flex-col items-start text-start" onClick={() => onOpenDiff(change.path, isStaged)}>
          <span className="w-full truncate text-body-2-medium text-text-primary">{basename(change.path)}</span>
          <span className="w-full truncate text-caption-2-regular text-text-tertiary">{dirname(change.path) || "raiz"}</span>
        </button>
        <GitStatusIcon status={statusLabel(change)} size={14} />
        {isStaged ? (
          <Button variant="ghost" size="xs" iconOnly leadingIcon={Undo2} aria-label="Despreparar" onClick={() => void mutate("unstage", () => api.gitUnstage(project.id, [change.path]))} />
        ) : (
          <Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Preparar" onClick={() => void mutate("stage", () => api.gitStage(project.id, [change.path]))} />
        )}
        <Button variant="ghost" size="xs" iconOnly leadingIcon={Trash2} aria-label="Descartar" onClick={() => void discard([change.path], isStaged)} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background-secondary-default">
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div className="flex items-stretch gap-2">
          <Button variant="secondary" leadingIcon={GitBranch} className="h-11 min-w-0 flex-1 justify-start" onClick={onBranch}>
            <span className="flex min-w-0 flex-1 flex-col text-start">
              <span className="text-caption-2-regular text-text-tertiary">Branch atual</span>
              <span className="truncate text-body-2-medium text-text-primary">{branch || parsed.branch || "detached"}</span>
            </span>
            {repoState && (repoState.ahead > 0 || repoState.behind > 0) ? (
              <span className="shrink-0 text-caption-2-semibold tabular-nums text-text-tertiary">
                {repoState.ahead > 0 ? `↑${repoState.ahead}` : ""}{repoState.behind > 0 ? `↓${repoState.behind}` : ""}
              </span>
            ) : null}
            <Badge color="neutral">{parsed.changes.length}</Badge>
          </Button>
          <Button variant="secondary" size="small" iconOnly leadingIcon={Settings2} aria-label="Configurações do Git" title="Configurações do Git" onClick={() => setSettingsOpen(true)} className="size-11 shrink-0 rounded-2xl" />
        </div>

        {merging ? (
          <section className="rounded-3xl border border-status-amber-border bg-status-amber-bg p-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-status-amber-text/15 text-status-amber-text"><TriangleAlert size={15} /></span>
              <div className="min-w-0 flex-1">
                <strong className="block text-body-2-medium text-text-primary">Merge em andamento</strong>
                <p className="text-caption-2-regular text-text-secondary">
                  {conflicts.length > 0
                    ? `${conflicts.length} conflito${conflicts.length === 1 ? "" : "s"} para resolver. Abra o arquivo, resolva os marcadores e marque como resolvido.`
                    : "Conflitos resolvidos. Continue para concluir o merge."}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button size="small" className="flex-1 justify-center" leadingIcon={Check} disabled={conflicts.length > 0 || Boolean(busy)} onClick={() => void continueMerge()}>
                {busy === "merge-continue" ? "Concluindo..." : "Continuar merge"}
              </Button>
              <Button variant="secondary" size="small" className="flex-1 justify-center" disabled={Boolean(busy)} onClick={() => void abortMerge()}>
                Abortar
              </Button>
            </div>
          </section>
        ) : null}

        {conflicts.length > 0 ? (
          <section className="overflow-hidden rounded-3xl border border-status-rose-border bg-background-primary-default shadow-xs">
            <div className="flex items-center justify-between gap-2 border-b border-separator-border px-3 py-3">
              <strong className="text-body-2-medium text-text-primary">Conflitos</strong>
              <Badge color="primary">{conflicts.length}</Badge>
            </div>
            {conflicts.map((change, index) => conflictRow(change, index))}
          </section>
        ) : null}

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

        {staged.length > 0 ? (
          <section className="overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-xs">
            <div className="flex items-center justify-between gap-2 border-b border-separator-border px-3 py-3">
              <strong className="text-body-2-medium text-text-primary">Preparadas</strong>
              <div className="flex items-center gap-0.5">
                <Badge color="neutral">{staged.length}</Badge>
                <Button variant="ghost" size="xs" iconOnly leadingIcon={Minus} aria-label="Despreparar todas" title="Despreparar todas" disabled={Boolean(busy)} onClick={() => void mutate("unstage-all", () => api.gitUnstage(project.id, staged.map((change) => change.path)))} />
                <Button variant="ghost" size="xs" iconOnly leadingIcon={Trash2} aria-label="Descartar preparadas" title="Descartar preparadas" disabled={Boolean(busy)} onClick={() => void discard(staged.map((change) => change.path), true)} />
              </div>
            </div>
            {staged.map((change, index) => changeRow(change, "staged", index))}
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-xs">
          <div className="flex items-center justify-between gap-2 border-b border-separator-border px-3 py-3">
            <strong className="text-body-2-medium text-text-primary">Alterações</strong>
            <div className="flex items-center gap-0.5">
              <Badge color="neutral">{unstaged.length}</Badge>
              <Button variant="ghost" size="xs" iconOnly leadingIcon={Undo2} aria-label="Descartar todas" title="Descartar todas" disabled={!unstaged.length || Boolean(busy)} onClick={() => void discard(unstaged.map((change) => change.path), false)} />
              <Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Preparar todas" title="Preparar todas" disabled={!unstaged.length || Boolean(busy)} onClick={() => void mutate("stage-all", () => api.gitStage(project.id, unstaged.map((change) => change.path)))} />
              <Button variant="ghost" size="xs" iconOnly leadingIcon={RefreshCw} aria-label="Atualizar" title="Atualizar" onClick={() => void load()} />
            </div>
          </div>
          {error ? <p className="p-3 text-caption-1-regular text-text-error-primary">{error}</p> : null}
          {!error && parsed.changes.length === 0 ? <p className="p-4 text-center text-caption-1-regular text-text-secondary">Nenhuma alteração no workspace.</p> : null}
          {unstaged.map((change, index) => changeRow(change, "unstaged", index))}
        </section>

        <section className="rounded-3xl border border-border-button-white bg-background-primary-default p-3 shadow-xs">
          <div className="mb-2 flex items-center justify-between gap-2">
            <strong className="text-body-2-medium text-text-primary">Commit</strong>
            <Badge color={staged.length > 0 ? "primary" : "neutral"}>{staged.length} preparada{staged.length === 1 ? "" : "s"}</Badge>
          </div>
          <div className="relative">
            <Input value={message} onChange={setMessage} placeholder="Mensagem do commit" aria-label="Mensagem do commit" fieldClassName="h-10 pe-10" />
            <Button variant="ghost" size="xs" iconOnly leadingIcon={Sparkles} aria-label="Gerar mensagem com IA" title="Gerar mensagem com IA" disabled={Boolean(busy)} onClick={() => void generateMessage()} className="absolute end-1 top-1/2 -translate-y-1/2" />
          </div>
          <Button className="mt-2 h-11 w-full justify-center" leadingIcon={Check} disabled={!staged.length || Boolean(busy)} onClick={() => void commit()}>
            {busy === "commit" ? "Commitando..." : busy === "generate" ? "Gerando..." : "Commit"}
          </Button>
        </section>
      </div>

      <Modal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} title="Opções do Git" description="Ações rápidas do repositório." size="sm" bodyClassName="p-0">
        <div className="overflow-hidden rounded-2xl border border-separator-border">
          {[
            { id: "branch", label: "Trocar branch", icon: GitBranch, onClick: () => { setSettingsOpen(false); onBranch(); } },
            { id: "refresh", label: "Atualizar status", icon: RefreshCw, onClick: () => { setSettingsOpen(false); void load(); } },
            { id: "generate", label: "Gerar mensagem com IA", icon: Sparkles, onClick: () => { setSettingsOpen(false); void generateMessage(); }, disabled: Boolean(busy) },
            { id: "stage", label: "Preparar todas", icon: Plus, onClick: () => { setSettingsOpen(false); void mutate("stage-all", () => api.gitStage(project.id, unstaged.map((change) => change.path))); }, disabled: !unstaged.length || Boolean(busy) },
            { id: "unstage", label: "Despreparar todas", icon: Minus, onClick: () => { setSettingsOpen(false); void mutate("unstage-all", () => api.gitUnstage(project.id, staged.map((change) => change.path))); }, disabled: !staged.length || Boolean(busy) },
            { id: "discard", label: "Descartar todas", icon: Undo2, onClick: () => { setSettingsOpen(false); void discardAll(); }, disabled: (!staged.length && !unstaged.length) || Boolean(busy), danger: true },
          ].map((row, index) => {
            const Icon = row.icon;
            return (
              <button
                key={row.id}
                type="button"
                disabled={row.disabled}
                onClick={row.onClick}
                className={cx(
                  "flex h-12 w-full items-center gap-3 px-3 text-start text-caption-1-medium transition-colors hover:bg-background-primary-hover disabled:opacity-45",
                  index > 0 && "border-t border-separator-border",
                  row.danger ? "text-status-rose-text" : "text-text-primary",
                )}
              >
                <Icon className="size-4 shrink-0 text-text-tertiary" />
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                <ChevronRight className="size-4 shrink-0 text-text-tertiary" />
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
