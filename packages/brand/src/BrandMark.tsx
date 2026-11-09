import { useEffect, useRef } from "react";

interface Props {
  size?: "small" | "large" | "";
  className?: string;
  /** Makes the mark follow the pointer like the Toph avatars. */
  look?: boolean;
}

const EYES = [
  { left: "37.7%", top: "21.1%", rx: "12%", ry: "11%" },
  { left: "61.9%", top: "21.1%", rx: "12%", ry: "11%" },
];

const mask = ({ left, top, rx, ry }: (typeof EYES)[number]) =>
  `radial-gradient(ellipse ${rx} ${ry} at ${left} ${top}, #000 52%, transparent 100%)`;

export default function BrandMark({ size = "small", className = "", look = true }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const base = `${import.meta.env.BASE_URL}brand/toph-mark-eyeless.png?v=3`;
  const eyes = `${import.meta.env.BASE_URL}brand/toph-mark.png?v=3`;
  const pixels = size === "large" ? 56 : size === "small" ? 28 : undefined;

  useEffect(() => {
    const element = ref.current;
    if (!element || !look || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    let frame = 0;
    let point = { x: 0, y: 0 };
    const reset = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      element.style.setProperty("--look-x", "0px");
      element.style.setProperty("--look-y", "0px");
    };
    const paint = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      if (!rect.width) return;
      const dx = point.x - (rect.left + rect.width / 2);
      const dy = point.y - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy) || 1;
      const travel = Math.min(5, Math.max(1.5, rect.width * 0.075));
      const strength = Math.min(1, distance / 180);
      element.style.setProperty("--look-x", `${(dx / distance * travel * strength).toFixed(2)}px`);
      element.style.setProperty("--look-y", `${(dy / distance * travel * 0.65 * strength).toFixed(2)}px`);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      point = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
    };
  }, [look]);

  return (
    <span
      ref={look ? ref : undefined}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`.trim()}
      style={pixels ? { width: pixels, height: pixels } : undefined}
      aria-hidden="true"
    >
      <img src={base} alt="" className="block size-full object-contain" draggable={false} />
      {look
        ? EYES.map((eye, index) => (
            <span
              key={index}
              className="pointer-events-none absolute inset-0 block"
              style={{
                transform: "translate3d(var(--look-x, 0px), var(--look-y, 0px), 0)",
                transition: "transform 70ms linear",
                WebkitMaskImage: mask(eye),
                maskImage: mask(eye),
                WebkitMaskSize: "100% 100%",
                maskSize: "100% 100%",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
              }}
            >
              <img src={eyes} alt="" className="block size-full object-contain" draggable={false} />
            </span>
          ))
        : null}
    </span>
  );
}
