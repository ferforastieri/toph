import { useMemo, useState } from "react";
import { Moon, Plus, Sun, X } from "@toph/icons";
import BrandMark from "@toph/brand";
import { useApp } from "../store";
import { useSettings } from "../settings";
import NotificationBadge from "./NotificationBadge";
import ProjectSwitcher from "./ProjectSwitcher";
import { Button } from "@/boardui/base/buttons/button";
import { Modal } from "@/boardui/base/modal/modal";
import { cx } from "@/boardui/utils/cx";

interface Props {
  onOpenProject: (projectId: string) => void;
  onCloseProject: (projectId: string) => void;
  onGoHome: () => void;
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

/** Fixed workspace bar: open projects on the left, theme and Toph on the right. */
export default function TopBar({ onOpenProject, onCloseProject, onGoHome }: Props) {
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
      <header className="relative z-50 mx-1 mt-1 flex h-12 shrink-0 items-center gap-1.5 rounded-2xl border border-border-button-white bg-background-primary-default px-2 shadow-sidebar">
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
                  "pe-7",
                )}
              >
                <button
                  type="button"
                  onClick={() => openProject(project.id)}
                  className="flex h-full min-w-0 flex-1 items-center ps-2.5 text-start text-caption-1-medium"
                  title={`${project.name}\n${project.root}`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="max-w-[180px] truncate">{project.name}</span>
                </button>
                {unread > 0 ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      markProjectNotificationsRead(project.id);
                    }}
                    className="absolute end-0 top-0 flex size-4 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                    aria-label={`Marcar ${unread} notificações de ${project.name} como lidas`}
                    title={`${unread} notificações — clique para marcar como lidas`}
                  >
                    <NotificationBadge count={unread} size={14} />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseProject(project.id);
                  }}
                  className="absolute bottom-0.5 end-0.5 flex size-3.5 items-center justify-center rounded-full text-text-tertiary opacity-0 transition-opacity hover:bg-background-primary-hover hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
                  aria-label={`Fechar ${project.name}`}
                  title={`Fechar ${project.name}`}
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => {
              if (activeProjectId) onGoHome();
              else setPickerOpen(true);
            }}
            className="flex size-9 items-center justify-center rounded-xl transition-colors hover:bg-background-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            aria-label="Ir para o Toph"
            title="Ir para o Toph"
          >
            <BrandMark size="small" className="size-7" />
          </button>
        </div>
      </header>

      <Modal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Abrir projeto"
        description="Escolha um repositório que ainda não está aberto."
        size="md"
        bodyClassName="p-4"
      >
        <ProjectSwitcher
          onlyClosed
          onSelect={(projectId) => {
            setPickerOpen(false);
            openProject(projectId);
          }}
        />
      </Modal>
    </>
  );
}
