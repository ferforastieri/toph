import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

interface Props {
  orientation: "vertical" | "horizontal";
  value: number;
  min: number;
  max: number;
  invert?: boolean;
  label: string;
  className?: string;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}

export default function ResizeHandle({
  orientation,
  value,
  min,
  max,
  invert = false,
  label,
  className = "",
  onChange,
  onCommit,
}: Props) {
  const drag = useRef<{ x: number; y: number; start: number; last: number } | null>(null);
  const [active, setActive] = useState(false);

  function clamp(next: number) {
    return Math.min(max, Math.max(min, Math.round(next)));
  }

  function down(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      start: value,
      last: value,
    };
    setActive(true);
    document.body.classList.add("resize-active");
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const delta = orientation === "vertical"
      ? event.clientX - drag.current.x
      : event.clientY - drag.current.y;
    const next = clamp(drag.current.start + (invert ? -delta : delta));
    drag.current.last = next;
    onChange(next);
  }

  function end() {
    if (!drag.current) return;
    onCommit(drag.current.last);
    drag.current = null;
    setActive(false);
    document.body.classList.remove("resize-active");
  }

  return (
    <div
      className={`resize-handle ${orientation} ${className} ${active ? "dragging" : ""}`.trim()}
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    />
  );
}
