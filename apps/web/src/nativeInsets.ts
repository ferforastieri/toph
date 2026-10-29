interface NativeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
  keyboard?: number;
}

interface TophInsetsBridge {
  insets?: () => string;
}

let installed = false;

function readInsets(): NativeInsets | null {
  const bridge = (window as unknown as { TophInsets?: TophInsetsBridge }).TophInsets;
  if (!bridge?.insets) return null;
  try {
    const parsed = JSON.parse(bridge.insets()) as Partial<NativeInsets>;
    const values = [parsed.top, parsed.bottom, parsed.left, parsed.right];
    if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
      return null;
    }
    return {
      top: Math.max(0, parsed.top ?? 0),
      bottom: Math.max(0, parsed.bottom ?? 0),
      left: Math.max(0, parsed.left ?? 0),
      right: Math.max(0, parsed.right ?? 0),
      keyboard: Math.max(0, parsed.keyboard ?? 0),
    };
  } catch {
    return null;
  }
}

export function installNativeInsets(): void {
  if (installed) return;
  installed = true;
  const root = document.documentElement;
  let frame = 0;

  const apply = () => {
    frame = 0;
    const insets = readInsets();
    const viewport = window.visualViewport;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const viewportOffsetTop = viewport?.offsetTop ?? 0;
    const visualKeyboard = Math.max(0, window.innerHeight - viewportHeight - viewportOffsetTop);
    const keyboard = Math.max(visualKeyboard, insets?.keyboard ?? 0);

    root.style.setProperty("--visual-viewport-height", `${viewportHeight}px`);
    root.style.setProperty("--visual-viewport-offset-top", `${viewportOffsetTop}px`);
    root.style.setProperty("--keyboard-inset", `${keyboard}px`);
    root.classList.toggle("keyboard-open", keyboard > 80);

    if (!insets) return;
    root.style.setProperty("--native-safe-top", `${insets.top}px`);
    root.style.setProperty("--native-safe-bottom", `${insets.bottom}px`);
    root.style.setProperty("--native-safe-left", `${insets.left}px`);
    root.style.setProperty("--native-safe-right", `${insets.right}px`);
  };

  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(apply);
  };

  apply();
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("orientationchange", schedule, { passive: true });
  window.addEventListener("focusin", schedule, { passive: true });
  window.addEventListener("focusout", schedule, { passive: true });
  window.visualViewport?.addEventListener("resize", schedule, { passive: true });
  window.visualViewport?.addEventListener("scroll", schedule, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule();
  });
}
