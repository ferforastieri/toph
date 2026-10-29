import { useEffect, useRef } from "react";
import { useApp } from "../store";
import { Notification, NotificationViewport } from "@/boardui/base/notification/notification";

export default function Toasts() {
  const toasts = useApp((state) => state.toasts);
  const dismiss = useApp((state) => state.dismissToast);
  const seen = useRef(new Set<number>());

  useEffect(() => {
    for (const item of toasts) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      window.dispatchEvent(new CustomEvent("toph:output", { detail: { text: `[app] ${item.message}` } }));
    }
  }, [toasts]);

  return (
    <NotificationViewport position="bottom-end">
      {toasts.map((item) => (
        <Notification
          key={item.id}
          title={item.message}
          status={item.kind === "error" ? "error" : item.kind === "success" ? "success" : "information"}
          onDismiss={() => dismiss(item.id)}
          className="bg-background-primary-default shadow-dropdown"
        />
      ))}
    </NotificationViewport>
  );
}
