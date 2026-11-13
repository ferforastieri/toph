import { createPortal } from "react-dom";
import { Icon } from "@toph/ui";
import { useApp } from "../../../app/store";

/**
 * The Tophs toast: the kit's own `.ac-toast` card (surface, hairline, overlay
 * shadow and the tone's glow), with its icon, one line of words and the close
 * on the first line. Bottom-right, as in Tophs.
 */
export default function Toasts() {
  const toasts = useApp((state) => state.toasts);
  const dismiss = useApp((state) => state.dismissToast);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="ac-toasts" aria-live="polite">
      {toasts.map((item) => {
        const tone = item.kind === "error" ? "error" : item.kind === "success" ? "success" : "info";
        return (
          <div key={item.id} className={`ac-toast ac-toast--${tone}`} role={tone === "error" ? "alert" : "status"}>
            <Icon name={tone === "error" ? "alert" : "check"} />
            <span className="ac-toast__text">{item.message}</span>
            <button
              type="button"
              className="ac-btn ac-btn--ghost ac-btn--sm ac-btn--icon ac-toast__close"
              aria-label="Fechar"
              onClick={() => dismiss(item.id)}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
