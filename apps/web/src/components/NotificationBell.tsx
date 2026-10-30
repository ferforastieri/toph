import { useMemo, useState } from "react";
import { Bell, Bot } from "@toph/icons";
import { useApp, type AppNotification } from "../store";
import HeaderAccordion from "./HeaderAccordion";

interface Props {
  projectId: string;
  projectName: string;
  onOpen: (notification: AppNotification) => void;
  align?: "left" | "right";
}

function timeAgo(timestamp: number): string {
  const value = Number.isFinite(timestamp) ? timestamp : Date.now();
  const seconds = Math.max(0, Math.round((Date.now() - value) / 1000));
  if (seconds < 60) return "agora";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d`;
  return new Date(value).toLocaleDateString("pt-BR");
}

export default function NotificationBell({ projectId, projectName, onOpen, align = "left" }: Props) {
  const notifications = useApp((state) => state.notifications);
  const markProjectNotificationsRead = useApp((state) => state.markProjectNotificationsRead);
  const [open, setOpen] = useState(false);
  const items = useMemo(
    () => notifications
      .filter((notification) => notification.projectId === projectId)
      .sort((a, b) => b.createdAt - a.createdAt),
    [notifications, projectId],
  );
  const unread = items.filter((notification) => !notification.read).length;

  return (
    <HeaderAccordion
      id={`notifications-${projectId}`}
      isOpen={open}
      onOpenChange={(next) => {
        if (next) markProjectNotificationsRead(projectId);
        setOpen(next);
      }}
      title={
        <span className="header-accordion-label flex items-center gap-1 text-caption-1-medium leading-none">
          <Bell size={14} className={unread > 0 ? "text-accent-500" : undefined} />
          {unread > 0 && <span className="text-accent-500">{unread > 9 ? "9+" : unread}</span>}
        </span>
      }
      triggerClassName="h-7 min-w-7 justify-center px-1.5 text-caption-1-medium text-text-secondary hover:bg-background-primary-hover"
      panelClassName={`${align === "right" ? "right-0" : "left-0"} w-[340px]`}
      contentClassName="p-0"
    >
        <div className="flex items-center gap-2.5 border-b border-separator-border p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-500">
            <Bell size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <strong className="text-body-2-medium text-text-primary">Notificações</strong>
            <p className="truncate text-caption-2-regular text-text-tertiary">{projectName}</p>
          </div>
          <span className="shrink-0 rounded-full bg-background-secondary-default px-2 py-0.5 text-caption-2-regular text-text-tertiary">{items.length}</span>
        </div>
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-background-secondary-default text-text-tertiary">
                <Bell size={18} />
              </span>
              <p className="text-caption-1-regular text-text-secondary">Nenhuma notificação neste projeto.</p>
            </div>
          ) : items.slice(0, 20).map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => { setOpen(false); onOpen(notification); }}
              className="flex w-full items-start gap-2.5 rounded-xl border border-transparent p-2.5 text-start transition-colors hover:border-accent-500/20 hover:bg-accent-500/[0.06]"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-500/10 text-accent-500">
                <Bot size={15} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {!notification.read && <span className="size-1.5 shrink-0 rounded-full bg-accent-500" />}
                    <strong className="truncate text-caption-1-semibold text-text-primary">{notification.title}</strong>
                  </span>
                  <span className="shrink-0 text-caption-2-regular text-text-tertiary">{timeAgo(notification.createdAt)}</span>
                </span>
                {notification.botRole && <span className="text-caption-2-regular text-accent-500">{notification.botRole}</span>}
                <span className="line-clamp-2 text-caption-1-regular leading-relaxed text-text-secondary">{notification.body}</span>
              </span>
            </button>
          ))}
        </div>
    </HeaderAccordion>
  );
}
