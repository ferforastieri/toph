import { useEffect, useRef } from "react";
import { useApp } from "../store";
import { useIsMobile } from "../ui/useIsMobile";
import { Notification, NotificationViewport } from "@/boardui/base/notification/notification";

export default function Toasts() {
  const toasts = useApp((state) => state.toasts);
  const dismiss = useApp((state) => state.dismissToast);
  const mobile = useIsMobile();
  const seen = useRef(new Set<number>());

  useEffect(() => {
    for (const item of toasts) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      window.dispatchEvent(new CustomEvent("toph:output", { detail: { text: `[app] ${item.message}` } }));
    }
  }, [toasts]);

  return (
    <NotificationViewport
      position="bottom-center"
      className="w-[min(300px,calc(100vw-var(--safe-left)-var(--safe-right)-24px))]"
      style={mobile ? { bottom: "calc(0.75rem + var(--safe-bottom))" } : undefined}
    >
      {toasts.map((item) => (
        <Notification
          key={item.id}
          title={item.message}
          status={item.kind === "error" ? "error" : item.kind === "success" ? "success" : "information"}
          autoDismissDuration={5000}
          compact
          onDismiss={() => dismiss(item.id)}
          className="border-border-button-default bg-background-secondary-default shadow-dropdown"
        />
      ))}
    </NotificationViewport>
  );
}
