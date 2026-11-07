import { Bell, CheckCheck, X } from "@toph/icons";
import { useApp } from "../../../app/store";
import { Button } from "@/shared/boardui/base/buttons/button";
import { cx } from "@/shared/boardui/utils/cx";

function relativeTime(createdAt: number): string {
  const seconds = Math.max(1, Math.floor((Date.now() - createdAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

function initials(value: string): string {
  return value.trim().slice(0, 1).toUpperCase() || "T";
}

export default function NotificationList({ onNavigate }: { onNavigate?: () => void }) {
  const notifications = useApp((state) => state.notifications);
  const projects = useApp((state) => state.projects);
  const markRead = useApp((state) => state.markNotificationRead);
  const markAllRead = useApp((state) => state.markAllNotificationsRead);
  const clear = useApp((state) => state.clearNotifications);
  const setActiveProject = useApp((state) => state.setActiveProject);
  const setSidebar = useApp((state) => state.setSidebar);

  function open(notification: (typeof notifications)[number]) {
    markRead(notification.id);
    const projectId = notification.projectId;
    if (projectId && notification.botId) {
      window.dispatchEvent(new CustomEvent("toph:open-bot", {
        detail: {
          projectId,
          botId: notification.botId,
          notificationId: notification.notificationId,
          chatId: notification.chatId,
        },
      }));
    } else if (projectId) {
      setActiveProject(projectId);
      setSidebar("bots");
    }
    onNavigate?.();
  }

  return (
    <div className="flex max-h-[min(520px,70dvh)] w-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-separator-border px-3 py-2">
        <Bell size={14} className="text-accent-500" />
        <strong className="min-w-0 flex-1 text-caption-1-semibold text-text-primary">Notificações</strong>
        {notifications.length > 0 ? (
          <>
            <Button variant="ghost" size="xs" leadingIcon={CheckCheck} onClick={markAllRead}>Marcar todas</Button>
            <Button variant="ghost" size="xs" iconOnly leadingIcon={X} aria-label="Limpar notificações" title="Limpar" onClick={clear} />
          </>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {notifications.length === 0 ? (
          <p className="px-3 py-8 text-center text-caption-1-regular text-text-tertiary">Nenhuma notificação.</p>
        ) : notifications.map((notification) => {
          const project = projects.find((item) => item.id === notification.projectId);
          const projectName = notification.projectName || project?.name || "Projeto";
          const tophName = notification.botName || notification.botRole || "Toph";
          return (
            <button
              key={notification.id}
              type="button"
              onClick={() => open(notification)}
              className={cx(
                "flex w-full min-w-0 items-start gap-2.5 rounded-xl px-2.5 py-2 text-start transition-colors hover:bg-background-primary-hover",
                !notification.read && "bg-accent-500/[0.04]",
              )}
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-caption-1-semibold"
                style={project ? { backgroundColor: `${project.color}22`, color: project.color } : undefined}
              >
                {initials(projectName)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-caption-1-semibold text-text-primary">{tophName}</span>
                  <span className="shrink-0 text-text-tertiary">·</span>
                  <span className="truncate text-caption-2-regular text-text-secondary">{projectName}</span>
                  {!notification.read ? <span className="ms-auto size-1.5 shrink-0 rounded-full bg-accent-500" aria-label="Não lida" /> : null}
                </span>
                <span className="line-clamp-2 text-[11.5px] leading-snug text-text-secondary">{notification.body}</span>
                <span className="text-[10px] text-text-tertiary">{relativeTime(notification.createdAt)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
