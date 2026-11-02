import { useEffect, useMemo } from "react";
import { Bell, Bot } from "@toph/icons";
import { useApp, type AppNotification } from "../store";
import { Button } from "@/boardui/base/buttons/button";
import { Modal } from "@/boardui/base/modal/modal";
import { Badge } from "@/boardui/base/badges/badge";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenNotification: (notification: AppNotification) => void;
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

export default function MobileNotificationsSheet({ open, onClose, onOpenNotification }: Props) {
  const notifications = useApp((state) => state.notifications);
  const projects = useApp((state) => state.projects);
  const markAllNotificationsRead = useApp((state) => state.markAllNotificationsRead);
  const items = useMemo(
    () => [...notifications].sort((a, b) => b.createdAt - a.createdAt),
    [notifications],
  );
  const unread = items.filter((notification) => !notification.read).length;
  const projectName = (projectId?: string) => projects.find((project) => project.id === projectId)?.name ?? "";

  useEffect(() => {
    if (open) markAllNotificationsRead();
  }, [markAllNotificationsRead, open]);

  return (
    <Modal isOpen={open} onClose={onClose} title="Notificações" description="Todas as notificações da sua conta" placement="bottom" size="sm" bodyClassName="p-2" swipeToClose>
      <div className="mb-2 flex items-center justify-between rounded-2xl border border-border-button-default bg-background-secondary-default px-3 py-2">
        <span className="flex items-center gap-2 text-body-2-medium text-text-primary">
          <Bell className="size-4 text-accent-500" /> Todas as notificações
        </span>
        <Badge color={unread > 0 ? "primary" : "neutral"}>{items.length}</Badge>
      </div>
      <div className="flex max-h-[min(58dvh,480px)] flex-col gap-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-background-secondary-default text-text-tertiary">
              <Bell className="size-5" />
            </span>
            <strong className="text-body-2-medium text-text-primary">Tudo em dia</strong>
            <p className="text-caption-1-regular text-text-secondary">Nenhuma notificação.</p>
          </div>
        ) : items.map((notification) => (
          <Button
            key={notification.id}
            variant="ghost"
            className="h-auto w-full justify-start gap-3.5 rounded-2xl px-2.5 py-2.5 text-start"
            onClick={() => { onOpenNotification(notification); onClose(); }}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-500/10 text-accent-500">
              <Bot className="size-4" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1 ps-0.5">
              <span className="flex min-w-0 items-baseline justify-between gap-2">
                <strong className="truncate text-caption-1-semibold text-text-primary">{notification.title}</strong>
                <span className="shrink-0 text-caption-2-regular text-text-tertiary">{timeAgo(notification.createdAt)}</span>
              </span>
              {notification.botRole ? <span className="text-caption-2-regular text-accent-500">{notification.botRole}</span> : null}
              <span className="line-clamp-2 text-caption-1-regular text-text-secondary">{notification.body}</span>
              {projectName(notification.projectId) ? <span className="truncate text-caption-2-regular text-text-tertiary">{projectName(notification.projectId)}</span> : null}
            </span>
          </Button>
        ))}
      </div>
    </Modal>
  );
}
