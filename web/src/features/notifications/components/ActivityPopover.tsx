import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "@toph/ui";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  panelClassName?: string;
}

/**
 * A panel beside its trigger, on the floating layer: it must sit above the
 * window's other columns (the branch picker over the editor), so it is portalled
 * to <body> and fixed where the trigger is, never clipped by a sidebar.
 */
export default function ActivityPopover({ open, onOpenChange, trigger, children, panelClassName }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const measure = () => {
      const rect = root.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(460, window.innerWidth - 64);
      const left = Math.max(8, Math.min(rect.right + 4, window.innerWidth - width - 8));
      const top = Math.max(8, rect.top);
      setPos({ left, top, maxHeight: window.innerHeight - top - 8 });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !panel.current?.contains(target)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={root} className="relative flex shrink-0">
      {trigger}
      {open && pos
        ? createPortal(
            <div
              ref={panel}
              className={cx("dropdown-reveal fixed overflow-hidden rounded-2xl border border-border-button-default bg-background-primary-default shadow-dropdown", panelClassName)}
              style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight, zIndex: 200 }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
