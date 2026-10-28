import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useApp } from "../store";

export default function Toasts() {
  const toasts = useApp((state) => state.toasts);
  const dismiss = useApp((state) => state.dismissToast);
  const seen = useRef(new Set<number>());

  useEffect(() => {
    for (const item of toasts) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      if (item.kind === "error") toast.error(item.message);
      else if (item.kind === "success") toast.success(item.message);
      else toast(item.message);
      dismiss(item.id);
    }
  }, [dismiss, toasts]);

  return null;
}
