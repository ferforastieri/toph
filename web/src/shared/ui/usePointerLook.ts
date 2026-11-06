import { useEffect, useRef } from "react";

interface Options {
  /** Maximum travel in pixels, regardless of avatar size. */
  max?: number;
  /** Travel as a fraction of the avatar width. */
  strength?: number;
  disabled?: boolean;
}

/**
 * Makes a Toph look at the pointer. Only the `--toph-look-x` and
 * `--toph-look-y` CSS variables change, so the avatar body never moves and
 * pointer movement never re-renders React.
 */
export function usePointerLook<T extends HTMLElement>({ max = 4, strength = 0.025, disabled = false }: Options = {}) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || disabled || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    let frame = 0;
    let point = { x: 0, y: 0 };

    const paint = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dx = point.x - (rect.left + rect.width / 2);
      const dy = point.y - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy) || 1;
      const strengthFactor = Math.min(1, distance / Math.max(160, rect.width * 4));
      const travel = Math.min(max, Math.max(1, rect.width * strength));
      const lookX = (dx / distance) * travel * strengthFactor;
      const lookY = (dy / distance) * travel * 0.65 * strengthFactor;
      element.style.setProperty("--toph-look-x", `${lookX.toFixed(2)}px`);
      element.style.setProperty("--toph-look-y", `${lookY.toFixed(2)}px`);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      point = { x: event.clientX, y: event.clientY };
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    const reset = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      element.style.setProperty("--toph-look-x", "0px");
      element.style.setProperty("--toph-look-y", "0px");
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
    };
  }, [disabled, max, strength]);

  return ref;
}
