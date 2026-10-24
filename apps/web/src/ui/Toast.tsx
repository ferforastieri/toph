import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import type { Toast as ToastModel } from "../store";
import { IconButton } from "@toph/ui";

interface Props {
  toast: ToastModel;
  onDismiss: (id: number) => void;
}

export function Toast({ toast, onDismiss }: Props) {
  const Icon = toast.kind === "error" ? TriangleAlert : toast.kind === "success" ? CircleCheck : Info;
  return (
    <div className={`toast ui-toast ${toast.kind}`} role="status">
      <Icon size={15} />
      <span>{toast.message}</span>
      <IconButton label="Dismiss" onClick={() => onDismiss(toast.id)}><X size={13} /></IconButton>
    </div>
  );
}

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastModel[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toasts ui-toasts">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
