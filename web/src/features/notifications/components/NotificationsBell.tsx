import { useEffect, useRef, useState } from "react";
import { Bell } from "@toph/icons";
import { useApp } from "../../../app/store";
import NotificationList from "./NotificationList";
import { cx } from "@/shared/boardui/utils/cx";

interface Props {
  vertical?: boolean;
  side?: "bottom" | "right";
}

export default function NotificationsBell({ vertical = false, side = "bottom" }: Props) {
  const unread = useApp((state) => state.notifications.filter((notification) => !notification.read).length);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative flex shrink-0">
      <button
        type="button"
        aria-label={unread > 0 ? `Notificações, ${unread} não lidas` : "Notificações"}
        aria-expanded={open}
        title="Notificações"
        onClick={() => setOpen((value) => !value)}
        className={cx(
          "relative flex items-center justify-center rounded-full text-foreground-icon-secondary transition-colors hover:bg-background-primary-hover hover:text-foreground-icon-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          vertical ? "size-10" : "size-9",
          open && "bg-background-primary-hover text-foreground-icon-primary",
        )}
      >
        <Bell className="size-[18px]" />
        {unread > 0 ? (
          <span className="absolute -end-0.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-accent-500 px-1 text-[9px] font-semibold leading-none tabular-nums text-[#1b1b1b] shadow-sm ring-2 ring-background-primary-default">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className={cx(
            "dropdown-reveal absolute z-[200] w-[min(390px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-border-button-default bg-background-primary-default shadow-dropdown",
            side === "right" ? "bottom-0 start-full ms-2" : "end-0 top-full mt-2",
          )}
        >
          <NotificationList onNavigate={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
