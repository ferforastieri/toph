import { useEffect, useRef } from "react";

interface Options {
  /** Maximum travel in pixels, regardless of avatar size. */
  max?: number;
  /** Disable tracking without unmounting the component. */
  disabled?: boolean;
}

/**
 * Makes a Toph look at the pointer, using the same travel as the landing hero:
 * about 3px on small avatars and at most 8px on larger ones. Only the
 * `--toph-look-x` / `--toph-look-y` CSS variables change, so the avatar body
 * never moves and pointer movement never re-renders React.
 *
 * Touch has no hover on mobile, so a finger drag also updates the gaze.
 */
export function usePointerLook<T extends HTMLElement>({ max = 8, disabled = false }: Options = {}) {
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
      const strength = Math.min(1, distance / 240);
      const travel = Math.min(max, Math.max(1, rect.width * (rect.width < 100 ? 0.09 : 0.03)));
      const lookX = (dx / distance) * travel * strength;
      const lookY = (dy / distance) * travel * 0.65 * strength;
      element.style.setProperty("--toph-look-x", `${lookX.toFixed(2)}px`);
      element.style.setProperty("--toph-look-y", `${lookY.toFixed(2)}px`);
    };

    const aim = (x: number, y: number) => {
      point = { x, y };
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    const onPointerMove = (event: PointerEvent) => aim(event.clientX, event.clientY);
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) aim(touch.clientX, touch.clientY);
    };
    const reset = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      element.style.setProperty("--toph-look-x", "0px");
      element.style.setProperty("--toph-look-y", "0px");
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
    };
  }, [disabled, max]);

  return ref;
}
