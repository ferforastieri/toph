import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "@toph/ui";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  panelClassName?: string;
}

export default function ActivityPopover({ open, onOpenChange, trigger, children, panelClassName }: Props) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onOpenChange(false);
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
      {open ? (
        <div className={cx("dropdown-reveal absolute left-full top-0 z-[120] ms-1 overflow-hidden rounded-2xl border border-border-button-default bg-background-primary-default shadow-dropdown", panelClassName)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
