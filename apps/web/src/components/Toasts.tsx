import { useApp } from "../store";
import { ToastViewport } from "../ui/Toast";

export default function Toasts() {
  const toasts = useApp((state) => state.toasts);
  const dismiss = useApp((state) => state.dismissToast);
  return <ToastViewport toasts={toasts} onDismiss={dismiss} />;
}
