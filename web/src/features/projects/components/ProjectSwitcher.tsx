import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, FolderGit2, LoaderCircle, Search, X } from "@toph/icons";
import { api, ApiError, type Repository } from "../../../shared/api";
import { useApp } from "../../../app/store";
import ProjectTophAvatar from "./ProjectTophAvatar";
import { Button } from "@toph/ui/app";
import { Input } from "@toph/ui/app";
import NotificationBadge from "../../notifications/components/NotificationBadge";

interface Props {
  onSelect: (id: string) => void;
  onCloseProject?: (id: string) => void;
  /** Only list projects that are not already open in the workspace. */
  onlyClosed?: boolean;
  /** Only list the projects that are open right now (the mobile rail). */
  onlyOpen?: boolean;
  /** Header label, when the caller wants a different wording. */
  heading?: string;
  /** Extra action rendered on the right side of the header. */
  action?: ReactNode;
}

/** The project switcher: existing projects plus every Git repository found
 * under the configured workspace roots, so the picker can open a repo that
 * has not been added as a project yet. */
export default function ProjectSwitcher({ onSelect, onCloseProject, onlyClosed = false, onlyOpen = false, heading, action }: Props) {
  const projects = useApp((state) => state.projects);
  const openProjectIds = useApp((state) => state.openProjectIds);
  const notifications = useApp((state) => state.notifications);
  const setProjects = useApp((state) => state.setProjects);
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<Repository[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [opening, setOpening] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // The open-projects rail never adds repositories, so it does not pay for it.
    if (onlyOpen) {
      setReposLoading(false);
      return;
    }
    let cancelled = false;
    api.repos()
      .then((items) => {
        if (cancelled) return;
        setRepos(items);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Não foi possível buscar os repositórios.");
      })
      .finally(() => {
        if (!cancelled) setReposLoading(false);
      });
    return () => { cancelled = true; };
  }, [onlyOpen]);

  const normalized = query.trim().toLowerCase();
  const visible = projects
    .filter((project) => !onlyClosed || !openProjectIds.includes(project.id))
    .filter((project) => !onlyOpen || openProjectIds.includes(project.id))
    .filter((project) =>
      !normalized
      || project.name.toLowerCase().includes(normalized)
      || project.root.toLowerCase().includes(normalized),
    )
    .sort((a, b) => {
      if (onlyOpen) {
        return openProjectIds.indexOf(a.id) - openProjectIds.indexOf(b.id);
      }
      const aOpen = openProjectIds.includes(a.id) ? 0 : 1;
      const bOpen = openProjectIds.includes(b.id) ? 0 : 1;
      return aOpen - bOpen || a.name.localeCompare(b.name);
    });

  const availableRepos = useMemo(
    () =>
      repos
        .filter((repo) => !projects.some((project) => project.root === repo.path))
        .filter((repo) =>
          !normalized
          || `${repo.name} ${repo.relative} ${repo.path}`.toLowerCase().includes(normalized),
        ),
    [normalized, projects, repos],
  );

  const unreadFor = (projectId: string) =>
    notifications.filter((notification) => !notification.read && notification.projectId === projectId).length;

  async function openRepo(repo: Repository) {
    if (opening) return;
    setOpening(repo.path);
    setError("");
    try {
      let project = projects.find((item) => item.root === repo.path);
      if (!project) {
        try {
          project = await api.createProject(repo.name, repo.path, "#FFB547");
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 409) throw err;
          const next = await api.projects();
          setProjects(next);
          project = next.find((item) => item.root === repo.path);
        }
        if (!project) throw new Error("O repositório foi criado, mas não apareceu na lista de projetos.");
        const next = await api.projects();
        setProjects(next);
      }
      onSelect(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o repositório.");
      setOpening("");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <span className="pointer-events-none absolute start-2.5 top-1/2 z-10 -translate-y-1/2 text-text-tertiary"><Search size={14} /></span>
        <Input
          value={query}
          onChange={setQuery}
          placeholder={onlyOpen ? "Pesquisar projeto" : "Pesquisar repositório"}
          aria-label={onlyOpen ? "Pesquisar projeto" : "Pesquisar repositório"}
          className="[&_input]:ps-8"
        />
      </div>
      {error ? <p role="alert" className="rounded-lg border border-status-rose-border bg-status-rose-bg px-2 py-1.5 text-caption-2-regular text-status-rose-text">{error}</p> : null}
      <div className="flex items-center justify-between px-1 text-caption-2-regular text-text-tertiary">
        <span>{heading || (onlyOpen ? "Abertos agora" : "Projetos")}</span>
        <span className="flex items-center gap-1.5">{visible.length}{action}</span>
      </div>
      <div className="flex max-h-[min(260px,32vh)] flex-col gap-0.5 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-2 py-4 text-center text-caption-2-regular text-text-tertiary">
            {onlyClosed ? "Todos os projetos já estão abertos." : onlyOpen ? "Nenhum projeto aberto." : "Nenhum projeto encontrado."}
          </p>
        ) : null}
        {visible.map((item) => {
          const open = openProjectIds.includes(item.id);
          return (
            <div key={item.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-2 text-start text-text-primary transition-colors hover:bg-dropdown-item-hover-background focus-visible:bg-dropdown-item-hover-background"
              >
                <ProjectTophAvatar project={item} size={28} showInitial />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-body-2-medium text-text-primary">{item.name}</span>
                    {open && !onlyOpen ? <span className="shrink-0 rounded-full bg-accent-500/10 px-1.5 text-[9px] font-medium uppercase tracking-wide text-accent-600">aberto</span> : null}
                  </span>
                  <span className="truncate text-caption-1-regular text-text-secondary">{item.root}</span>
                </span>
                {onlyOpen && unreadFor(item.id) > 0 ? (
                  <Bell size={13} className="shrink-0 text-accent-500" aria-label={`${unreadFor(item.id)} notificações não lidas`} />
                ) : (
                  <NotificationBadge count={unreadFor(item.id)} className="shrink-0 text-text-tertiary" />
                )}
              </button>
              {open && onCloseProject ? (
                <Button
                  variant="ghost"
                  size="xs"
                  iconOnly
                  leadingIcon={X}
                  aria-label={`Fechar ${item.name}`}
                  title="Fechar projeto"
                  onClick={() => onCloseProject(item.id)}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {onlyOpen ? null : (
        <>
          <div className="flex items-center justify-between border-t border-separator-border pt-2 px-1 text-caption-2-regular text-text-tertiary">
            <span className="flex items-center gap-1.5"><FolderGit2 size={12} /> Repositórios no servidor</span>
            <span>{reposLoading ? <LoaderCircle size={11} className="animate-spin" /> : availableRepos.length}</span>
          </div>
          <div className="flex max-h-[min(220px,28vh)] flex-col gap-0.5 overflow-y-auto">
            {reposLoading ? (
              <p role="status" className="flex items-center justify-center gap-2 px-2 py-4 text-caption-2-regular text-text-tertiary"><LoaderCircle size={13} className="animate-spin" /> Procurando repositórios…</p>
            ) : null}
            {!reposLoading && availableRepos.length === 0 ? (
              <p className="px-2 py-4 text-center text-caption-2-regular text-text-tertiary">
                {query.trim() ? "Nenhum repositório encontrado." : "Nenhum repositório Git encontrado nas pastas permitidas."}
              </p>
            ) : null}
            {availableRepos.map((repo) => (
              <button
                key={repo.path}
                type="button"
                onClick={() => void openRepo(repo)}
                disabled={Boolean(opening)}
                title={repo.path}
                className="flex min-w-0 items-center gap-2.5 rounded-xl p-2 text-start text-text-primary transition-colors hover:bg-dropdown-item-hover-background focus-visible:bg-dropdown-item-hover-background disabled:opacity-60"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border-button-default bg-background-secondary-default/60 text-foreground-icon-secondary">
                  {opening === repo.path ? <LoaderCircle size={14} className="animate-spin" /> : <FolderGit2 size={14} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-2-medium text-text-primary">{repo.name}</span>
                  <span className="truncate text-caption-1-regular text-text-secondary">{repo.relative}</span>
                </span>
                <span className="shrink-0 rounded-full border border-border-button-default px-1.5 text-[9px] font-medium text-text-tertiary">abrir</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
