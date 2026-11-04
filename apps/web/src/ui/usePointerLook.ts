import { useEffect, useRef } from "react";

interface Options {
  /** Maximum horizontal travel in pixels. */
  max?: number;
  /** Maximum tilt in degrees. */
  tilt?: number;
  disabled?: boolean;
}

/**
 * Makes a Toph avatar follow the pointer. The offsets are written as CSS
 * variables straight to the element, so pointer movement never re-renders
 * React or the surrounding chat.
 */
export function usePointerLook<T extends HTMLElement>({ max = 4, tilt = 5, disabled = false }: Options = {}) {
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
      const strength = Math.min(1, distance / Math.max(160, rect.width * 4));
      const lookX = (dx / distance) * max * strength;
      const lookY = (dy / distance) * max * 0.65 * strength;
      element.style.setProperty("--toph-look-x", `${lookX.toFixed(2)}px`);
      element.style.setProperty("--toph-look-y", `${lookY.toFixed(2)}px`);
      element.style.setProperty("--toph-look-tilt", `${((dx / distance) * tilt * strength).toFixed(2)}deg`);
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
      element.style.setProperty("--toph-look-tilt", "0deg");
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
  }, [disabled, max, tilt]);

  return ref;
}

export const pointerLookStyle = {
  transform: "translate3d(var(--toph-look-x, 0px), var(--toph-look-y, 0px), 0) rotate(var(--toph-look-tilt, 0deg))",
  transition: "transform 90ms linear",
} as const;
