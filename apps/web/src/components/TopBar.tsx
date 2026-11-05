import { useMemo, useState, type ReactNode } from "react";
import { Bot, Bug, Database, Files, GitBranch, Globe2, Moon, Plus, Search, Sun, TerminalSquare, X } from "@toph/icons";
import BrandMark from "@toph/brand";
import { useApp, type Sidebar } from "../store";
import { featureEnabled, useSettings, type WorkspaceFeature } from "../settings";
import ProjectSwitcher from "./ProjectSwitcher";
import { Button } from "@/boardui/base/buttons/button";
import { Modal } from "@/boardui/base/modal/modal";
import { cx } from "@/boardui/utils/cx";

const activityItems: Array<{ id: Sidebar; feature: WorkspaceFeature; label: string; icon: typeof Files }> = [
  { id: "files", feature: "files", label: "Explorer", icon: Files },
  { id: "scm", feature: "sourceControl", label: "Source Control", icon: GitBranch },
  { id: "db", feature: "databases", label: "Databases", icon: Database },
  { id: "bots", feature: "bots", label: "Toph", icon: Bot },
  { id: "debug", feature: "debug", label: "Debug", icon: Bug },
  { id: "web", feature: "webApps", label: "Web apps", icon: Globe2 },
];

interface Props {
  onOpenProject: (projectId: string) => void;
  onCloseProject: (projectId: string) => void;
  onGoHome: () => void;
  onQuickOpen: () => void;
  tophControl?: ReactNode;
}

function ThemeToggle() {
  const theme = useSettings((state) => state.theme);
  const setTheme = useSettings((state) => state.setTheme);
  const light = theme === "light";
  return (
    <button
      type="button"
      aria-label={light ? "Ativar modo escuro" : "Ativar modo claro"}
      aria-pressed={light}
      title={light ? "Modo escuro" : "Modo claro"}
      onClick={() => setTheme(light ? "dark" : "light")}
      className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-foreground-icon-secondary transition-colors hover:bg-background-primary-hover hover:text-foreground-icon-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      <Sun className={cx("absolute size-4 transition-all duration-300", light ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0")} />
      <Moon className={cx("absolute size-4 transition-all duration-300", light ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100")} />
    </button>
  );
}

function WorkspaceOptions({ vertical = false, onQuickOpen }: { vertical?: boolean; onQuickOpen: () => void }) {
  const sidebar = useApp((state) => state.sidebar);
  const setSidebar = useApp((state) => state.setSidebar);
  const toggleTerminal = useApp((state) => state.toggleTerminal);
  const terminalOpen = useApp((state) => state.terminalOpen);
  const workspaceFeatures = useSettings((state) => state.workspaceFeatures);
  return (
    <div className={cx("flex items-center", vertical ? "flex-col" : "flex-row")}>
      {activityItems
        .filter((item) => featureEnabled(workspaceFeatures, item.feature))
        .map((item) => {
          const active = sidebar === item.id;
          return (
            <Button
              key={item.id}
              variant={active ? "secondary" : "ghost"}
              size="small"
              iconOnly
              leadingIcon={item.icon}
              className={cx("size-8", active && "text-accent-500")}
              aria-label={item.label}
              aria-pressed={active}
              title={item.label}
              onClick={() => setSidebar(item.id)}
            />
          );
        })}
      {featureEnabled(workspaceFeatures, "files") ? (
        <Button
          variant="ghost"
          size="small"
          iconOnly
          leadingIcon={Search}
          className="size-8"
          aria-label="Busca rápida"
          title="Busca rápida"
          onClick={onQuickOpen}
        />
      ) : null}
      {featureEnabled(workspaceFeatures, "terminal") ? (
        <Button
          variant={terminalOpen ? "secondary" : "ghost"}
          size="small"
          iconOnly
          leadingIcon={TerminalSquare}
          className={cx("size-8", terminalOpen && "text-accent-500")}
          aria-label="Terminal"
          aria-pressed={terminalOpen}
          title="Terminal"
          onClick={toggleTerminal}
        />
      ) : null}
    </div>
  );
}

/** Small unread marker attached to a project tile. */
function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[9px] font-semibold leading-none tabular-nums text-[#1b1b1b] ring-2 ring-background-primary-default"
      aria-hidden="true"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function ProjectPicker({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (projectId: string) => void }) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Abrir projeto"
      description="Escolha um repositório que ainda não está aberto."
      size="md"
      bodyClassName="p-4"
    >
      <ProjectSwitcher
        onlyClosed
        onSelect={(projectId) => {
          onClose();
          onSelect(projectId);
        }}
      />
    </Modal>
  );
}

/** Fixed workspace bar: open projects on the left, actions and Toph on the right. */
export default function TopBar({ onOpenProject, onCloseProject, onGoHome, onQuickOpen, tophControl }: Props) {
  const projects = useApp((state) => state.projects);
  const openProjectIds = useApp((state) => state.openProjectIds);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const notifications = useApp((state) => state.notifications);
  const markProjectNotificationsRead = useApp((state) => state.markProjectNotificationsRead);
  const [pickerOpen, setPickerOpen] = useState(false);

  const openProjects = useMemo(
    () => openProjectIds
      .map((id) => projects.find((project) => project.id === id))
      .filter((project): project is NonNullable<typeof project> => Boolean(project)),
    [openProjectIds, projects],
  );

  function unreadFor(projectId: string): number {
    return notifications.filter((notification) => !notification.read && notification.projectId === projectId).length;
  }

  function openProject(projectId: string): void {
    markProjectNotificationsRead(projectId);
    onOpenProject(projectId);
  }

  return (
    <>
      <header className="relative z-50 mx-1 mt-1 flex h-12 shrink-0 items-center gap-1.5 rounded-3xl border border-border-button-white bg-background-primary-default px-2.5 shadow-sidebar">
        <button
          type="button"
          onClick={() => {
            if (activeProjectId) onGoHome();
            else setPickerOpen(true);
          }}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-background-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          aria-label="Ir para o Toph"
          title="Ir para o Toph"
        >
          <BrandMark size="small" className="size-7" />
        </button>

        <Button
          variant="ghost"
          size="small"
          iconOnly
          leadingIcon={Plus}
          aria-label="Abrir projeto"
          title="Abrir projeto"
          className="shrink-0"
          onClick={() => setPickerOpen(true)}
        />

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {openProjects.length === 0 ? (
            <span className="truncate px-1 text-caption-2-regular text-text-tertiary">Nenhum projeto aberto</span>
          ) : null}
          {openProjects.map((project) => {
            const active = project.id === activeProjectId;
            const unread = unreadFor(project.id);
            return (
              <div
                key={project.id}
                className={cx(
                  "group relative flex h-8 shrink-0 items-center rounded-xl border transition-colors",
                  active
                    ? "border-accent-500/35 bg-accent-500/10 text-text-primary"
                    : "border-transparent text-text-secondary hover:bg-background-primary-hover hover:text-text-primary",
                )}
              >
                <button
                  type="button"
                  onClick={() => openProject(project.id)}
                  className="relative flex h-full min-w-0 items-center gap-1.5 ps-1.5 pe-2.5 text-start text-caption-1-medium"
                  title={`${project.name}\n${project.root}`}
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] font-semibold"
                    style={{ backgroundColor: `${project.color || "#FFB547"}22`, color: project.color || "#FFB547" }}
                    aria-hidden="true"
                  >
                    {project.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="max-w-[160px] truncate">{project.name}</span>
                  <UnreadBadge count={unread} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseProject(project.id);
                  }}
                  className="pointer-events-none absolute end-1 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-full text-status-rose-text opacity-0 transition-opacity hover:bg-status-rose-background focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none group-hover:pointer-events-auto group-hover:opacity-100"
                  aria-label={`Fechar ${project.name}`}
                  title={`Fechar ${project.name}`}
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="mx-1 h-5 w-px shrink-0 bg-separator-border" aria-hidden="true" />
          <WorkspaceOptions onQuickOpen={onQuickOpen} />
          <ThemeToggle />
          {tophControl}
        </div>
      </header>

      <ProjectPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={openProject} />
    </>
  );
}

/** Vertical project bar used when the header is configured to the left. */
export function ProjectRail({ onOpenProject, onCloseProject, onGoHome, onQuickOpen, tophControl }: Props) {
  const projects = useApp((state) => state.projects);
  const openProjectIds = useApp((state) => state.openProjectIds);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const notifications = useApp((state) => state.notifications);
  const markProjectNotificationsRead = useApp((state) => state.markProjectNotificationsRead);
  const [pickerOpen, setPickerOpen] = useState(false);

  const openProjects = useMemo(
    () => openProjectIds
      .map((id) => projects.find((project) => project.id === id))
      .filter((project): project is NonNullable<typeof project> => Boolean(project)),
    [openProjectIds, projects],
  );

  function unreadFor(projectId: string): number {
    return notifications.filter((notification) => !notification.read && notification.projectId === projectId).length;
  }

  function openProject(projectId: string): void {
    markProjectNotificationsRead(projectId);
    onOpenProject(projectId);
  }

  return (
    <>
      <aside className="relative z-40 me-1 flex w-16 shrink-0 flex-col items-center gap-1 rounded-3xl border border-border-button-white bg-background-primary-default px-1 py-2 shadow-sidebar" aria-label="Projetos e ferramentas">
        <button
          type="button"
          onClick={() => {
            if (activeProjectId) onGoHome();
            else setPickerOpen(true);
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-background-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          aria-label="Ir para o Toph"
          title="Ir para o Toph"
        >
          <BrandMark size="small" className="size-6" />
        </button>
        <Button variant="ghost" size="small" iconOnly leadingIcon={Plus} aria-label="Abrir projeto" title="Abrir projeto" onClick={() => setPickerOpen(true)} />
        <span className="my-0.5 h-px w-8 shrink-0 bg-separator-border" aria-hidden="true" />
        <div className="flex w-full flex-col items-center gap-1">
          {openProjects.map((project) => {
            const active = project.id === activeProjectId;
            const unread = unreadFor(project.id);
            return (
              <div key={project.id} className="group relative">
                <button
                  type="button"
                  onClick={() => openProject(project.id)}
                  className={cx(
                    "relative flex size-9 items-center justify-center rounded-xl border text-[11px] font-semibold transition-colors",
                    active
                      ? "border-accent-500/40 bg-accent-500/10 text-text-primary"
                      : "border-transparent text-text-secondary hover:bg-background-primary-hover hover:text-text-primary",
                  )}
                  style={{ color: active ? project.color || "#FFB547" : undefined }}
                  aria-label={`Abrir ${project.name}`}
                  aria-current={active ? "page" : undefined}
                  title={`${project.name}\n${project.root}`}
                >
                  {project.name.slice(0, 1).toUpperCase()}
                  <UnreadBadge count={unread} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseProject(project.id);
                  }}
                  className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-background-primary-default/90 text-status-rose-text opacity-0 transition-opacity hover:bg-status-rose-background focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none group-hover:pointer-events-auto group-hover:opacity-100"
                  aria-label={`Fechar ${project.name}`}
                  title={`Fechar ${project.name}`}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
        <span className="my-0.5 h-px w-8 shrink-0 bg-separator-border" aria-hidden="true" />
        <WorkspaceOptions vertical onQuickOpen={onQuickOpen} />
        <div className="mt-auto flex flex-col items-center gap-1">
          <ThemeToggle />
          {tophControl}
        </div>
      </aside>

      <ProjectPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={openProject} />
    </>
  );
}
