import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { useApp, type AppNotification } from "../store";
import { Button } from "@toph/ui";

type Variant = "activity" | "titlebar";

interface Props {
  variant: Variant;
  onOpen: (notification: AppNotification) => void;
}

function relativeTime(value: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - value) / 1000));
  if (seconds < 60) return "agora";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(value);
}

export default function NotificationBell({ variant, onOpen }: Props) {
  const notifications = useApp((state) => state.notifications);
  const markAllRead = useApp((state) => state.markAllNotificationsRead);
  const markRead = useApp((state) => state.markNotificationRead);
  const clearNotifications = useApp((state) => state.clearNotifications);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((notification) => !notification.read).length;

  function updatePosition() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (variant === "titlebar") {
      setPosition({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    } else {
      setPosition({
        bottom: Math.max(8, window.innerHeight - rect.bottom),
        left: rect.right + 8,
      });
    }
  }

  function toggle() {
    if (!open) updatePosition();
    setOpen((current) => !current);
  }

  useEffect(() => {
    if (!open) return;
    const reposition = () => updatePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, variant]);

  useEffect(() => {
    if (!open) return;
    markAllRead();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [markAllRead, open]);

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        className={`notification-button notification-${variant} ${open ? "open" : ""}`}
        title={unread ? `${unread} notificação(ões) não lida(s)` : "Notificações"}
        aria-label={unread ? `${unread} notificações não lidas` : "Notificações"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <Bell size={18} strokeWidth={1.8} />
        {unread > 0 && <span className="notification-badge">{unread > 9 ? "9+" : unread}</span>}
      </Button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className={`avatar-menu notification-menu notification-menu-${variant}`}
            style={position}
            role="dialog"
            aria-label="Notificações"
          >
            <div className="notification-menu-head">
              <div>
                <strong>Notificações</strong>
                <small>
                  {notifications.length
                    ? `${notifications.length} ${notifications.length === 1 ? "notificação" : "notificações"}`
                    : "Tudo em dia"}
                </small>
              </div>
              {notifications.length > 0 && (
                <Button
                  className="icon-button"
                  title="Limpar notificações"
                  aria-label="Limpar notificações"
                  onClick={clearNotifications}
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="notification-empty">
                <CheckCheck size={20} />
                <span>Nenhuma notificação por enquanto.</span>
              </div>
            ) : (
              <div className="notification-list">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className={`notification-item ${notification.read ? "" : "unread"}`}
                    onClick={() => {
                      markRead(notification.id);
                      setOpen(false);
                      onOpen(notification);
                    }}
                  >
                    <span className="notification-item-dot" aria-hidden="true" />
                    <span className="notification-item-copy">
                      <span className="notification-item-top">
                        <strong>{notification.title}</strong>
                        <small>{relativeTime(notification.createdAt)}</small>
                      </span>
                      <span>{notification.body}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
