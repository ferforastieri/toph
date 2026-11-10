import { useMemo, useState, type ReactNode } from "react";
import { Bell, Bot, Bug, Database, Files, GitBranch, Globe2, Moon, Plus, Search, Sun, TerminalSquare, X } from "@toph/icons";
import BrandMark from "@toph/brand";
import { useApp, type Sidebar } from "../store";
import { featureEnabled, useSettings, type WorkspaceFeature } from "../../features/settings/store";
import type { Project } from "../../shared/api";
import ProjectSwitcher from "../../features/projects/components/ProjectSwitcher";
import ProjectMonogram from "../../features/projects/components/ProjectMonogram";
import QuickOpen from "../../features/explorer/components/QuickOpen";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Modal } from "@/shared/boardui/base/modal/modal";
import { cx } from "@/shared/boardui/utils/cx";

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
  onOpenAuxiliary?: (sidebar: Sidebar) => void;
  project?: Project | null;
  onOpenFile?: (path: string, line?: number) => void;
  quickOpenToken?: number;
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
      className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-foreground-icon-secondary transition-colors hover:bg-background-primary-hover hover:text-foreground-icon-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      <Sun className={cx("absolute size-[18px] transition-all duration-300", light ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0")} />
      <Moon className={cx("absolute size-[18px] transition-all duration-300", light ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100")} />
    </button>
  );
}

function WorkspaceOptions({ vertical = false, onQuickOpen, onOpenAuxiliary }: { vertical?: boolean; onQuickOpen?: () => void; onOpenAuxiliary?: (sidebar: Sidebar) => void }) {
  const sidebar = useApp((state) => state.sidebar);
  const setSidebar = useApp((state) => state.setSidebar);
  const toggleTerminal = useApp((state) => state.toggleTerminal);
  const terminalOpen = useApp((state) => state.terminalOpen);
  const workspaceFeatures = useSettings((state) => state.workspaceFeatures);
  const buttonSize = vertical ? "medium" : "small";
  const buttonClass = vertical ? "size-10 [&_svg]:size-5" : "size-9 [&_svg]:size-5";
  return (
    <div className={cx("flex items-center", vertical ? "flex-col gap-2" : "flex-row gap-1")}>
      {activityItems
        .filter((item) => featureEnabled(workspaceFeatures, item.feature))
        .map((item) => {
          const active = sidebar === item.id;
          return (
            <Button
              key={item.id}
              variant={active ? "secondary" : "ghost"}
              size={buttonSize}
              iconOnly
              leadingIcon={item.icon}
              className={cx(buttonClass, active && "text-accent-500")}
              aria-label={item.label}
              aria-pressed={active}
              title={`${item.label} · botão direito ou Alt+clique abre na área auxiliar`}
              onClick={(event) => {
                if (event.altKey && onOpenAuxiliary) {
                  event.preventDefault();
                  onOpenAuxiliary(item.id);
                  return;
                }
                setSidebar(item.id);
              }}
              onContextMenu={(event) => {
                if (!onOpenAuxiliary) return;
                event.preventDefault();
                onOpenAuxiliary(item.id);
              }}
            />
          );
        })}
      {vertical && featureEnabled(workspaceFeatures, "files") ? (
        <Button
          variant="ghost"
          size={buttonSize}
          iconOnly
          leadingIcon={Search}
          className={buttonClass}
          aria-label="Busca rápida"
          title="Busca rápida"
          onClick={onQuickOpen}
        />
      ) : null}
      {featureEnabled(workspaceFeatures, "terminal") ? (
        <Button
          variant={terminalOpen ? "secondary" : "ghost"}
          size={buttonSize}
          iconOnly
          leadingIcon={TerminalSquare}
          className={cx(buttonClass, terminalOpen && "text-accent-500")}
          aria-label="Terminal"
          aria-pressed={terminalOpen}
          title="Terminal"
          onClick={toggleTerminal}
        />
      ) : null}
    </div>
  );
}

/** Swinging bell attached to a project that still has unread notifications. */
function ProjectNotificationBell({ projectId, projectName, count, size = 13 }: { projectId: string; projectName: string; count: number; size?: number }) {
  const markProjectNotificationsRead = useApp((state) => state.markProjectNotificationsRead);
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        markProjectNotificationsRead(projectId);
      }}
      className="flex items-center justify-center rounded-full bg-background-primary-default p-0.5 text-accent-500 shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      aria-label={`${count} notificações de ${projectName} — marcar como lidas`}
      title={`${count} notificações — clique para marcar como lidas`}
    >
      <Bell size={size} className="bell-ring origin-top" />
    </button>
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
export default function TopBar({ onOpenProject, onCloseProject, onGoHome, project = null, onOpenFile = () => undefined, quickOpenToken = 0, onOpenAuxiliary, tophControl }: Props) {
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
      <header className="relative z-50 mx-1 mt-1 flex h-11 shrink-0 items-center gap-1.5 rounded-3xl border border-border-button-white bg-background-primary-default px-2.5 shadow-sidebar">
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
          size="medium"
          iconOnly
          leadingIcon={Plus}
          aria-label="Abrir projeto"
          title="Abrir projeto"
          className="size-9 shrink-0 [&_svg]:size-5"
          onClick={() => setPickerOpen(true)}
        />

        <div className="flex min-w-0 shrink items-center gap-1 overflow-x-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                  "group relative flex h-8 shrink-0 items-center rounded-xl border pe-5 transition-colors",
                  active
                    ? "border-accent-500/35 bg-accent-500/10 text-text-primary"
                    : "border-transparent text-text-secondary hover:bg-background-primary-hover hover:text-text-primary",
                )}
              >
                {unread > 0 ? (
                  <span className="absolute -start-0.5 -top-2 z-10">
                    <ProjectNotificationBell projectId={project.id} projectName={project.name} count={unread} size={12} />
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => openProject(project.id)}
                  className="flex h-full min-w-0 items-center gap-1.5 ps-1.5 pe-1 text-start text-caption-1-medium"
                  title={`${project.name}\n${project.root}`}
                  aria-current={active ? "page" : undefined}
                >
                  <ProjectMonogram project={project} size={20} />
                  <span className="max-w-[160px] truncate">{project.name}</span>
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

        <div className="flex min-w-0 flex-1 items-center justify-center px-2">
          <QuickOpen project={project} focusToken={quickOpenToken} onOpenFile={onOpenFile} className="max-w-[320px]" />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <WorkspaceOptions onOpenAuxiliary={onOpenAuxiliary} />
          <Button variant="ghost" size="small" iconOnly leadingIcon={Search} aria-label="Busca global" title="Busca global (Ctrl+K)" onClick={() => window.dispatchEvent(new CustomEvent("toph:global-search"))} />
          <span className="h-5 w-px shrink-0 bg-separator-border" aria-hidden="true" />
          <ThemeToggle />
          {tophControl}
        </div>
      </header>

      <ProjectPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={openProject} />
    </>
  );
}

/** Vertical project bar used when the header is configured to the left. */
export function ProjectRail({ onOpenProject, onCloseProject, onGoHome, onQuickOpen, onOpenAuxiliary, tophControl }: Props) {
  const projects = useApp((state) => state.projects);
  const openProjectIds = useApp((state) => state.openProjectIds);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const notifications = useApp((state) => state.notifications);
  const markProjectNotificationsRead = useApp((state) => state.markProjectNotificationsRead);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);

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
      <aside className="relative z-50 me-1 flex w-12 shrink-0 flex-col items-center gap-2 rounded-3xl border border-border-button-white bg-background-primary-default px-0 py-3 shadow-sidebar" aria-label="Projetos e ferramentas">
        <button
          type="button"
          onClick={() => {
            if (activeProjectId) onGoHome();
            else setPickerOpen(true);
          }}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-background-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          aria-label="Ir para o Toph"
          title="Ir para o Toph"
        >
          <BrandMark size="small" className="size-7" />
        </button>
        <Button variant="ghost" size="medium" iconOnly leadingIcon={Plus} className="size-10 [&_svg]:size-5" aria-label="Abrir projeto" title="Abrir projeto" onClick={() => setPickerOpen(true)} />
        <span className="h-px w-8 shrink-0 bg-separator-border" aria-hidden="true" />
        <div className="flex w-full flex-col items-center gap-2">
          {openProjects.map((project) => {
            const active = project.id === activeProjectId;
            const unread = unreadFor(project.id);
            return (
              <div
                key={project.id}
                className="group relative"
                onPointerEnter={() => setHoveredProject(project.id)}
                onPointerLeave={() => setHoveredProject((current) => (current === project.id ? null : current))}
                onFocus={() => setHoveredProject(project.id)}
                onBlur={() => setHoveredProject((current) => (current === project.id ? null : current))}
              >
                {unread > 0 ? (
                  <span className="absolute -end-1 -top-1 z-10">
                    <ProjectNotificationBell projectId={project.id} projectName={project.name} count={unread} size={12} />
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => openProject(project.id)}
                  className={cx(
                    "flex size-10 items-center justify-center rounded-xl border transition-colors",
                    active
                      ? "border-accent-500/40 bg-accent-500/10"
                      : "border-transparent hover:bg-background-primary-hover",
                  )}
                  aria-label={`Abrir ${project.name}`}
                  aria-current={active ? "page" : undefined}
                >
                  <ProjectMonogram project={project} size={30} />
                </button>
                {hoveredProject === project.id ? (
                  <span className="pointer-events-none absolute start-full top-1/2 z-50 ms-1 -translate-y-1/2 rounded-xl border border-border-button-default bg-background-primary-default px-2.5 py-1.5 shadow-dropdown">
                    <span className="block max-w-[260px] truncate text-caption-1-medium text-text-primary">{project.name}</span>
                    <span className="block max-w-[260px] truncate text-[10px] text-text-tertiary">{project.root}</span>
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseProject(project.id);
                  }}
                  className={cx(
                    "absolute -bottom-1 -start-1 z-10 flex size-4 items-center justify-center rounded-full bg-background-primary-default text-status-rose-text shadow-sm transition-opacity hover:bg-status-rose-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                    hoveredProject === project.id ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                  aria-label={`Fechar ${project.name}`}
                  title={`Fechar ${project.name}`}
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
        <span className="h-px w-8 shrink-0 bg-separator-border" aria-hidden="true" />
        <WorkspaceOptions vertical onQuickOpen={onQuickOpen} onOpenAuxiliary={onOpenAuxiliary} />
        <div className="mt-auto flex flex-col items-center gap-2">
          <ThemeToggle />
          {tophControl}
        </div>
      </aside>

      <ProjectPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={openProject} />
    </>
  );
}
