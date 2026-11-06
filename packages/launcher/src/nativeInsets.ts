interface NativeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
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
    };
  } catch {
    return null;
  }
}

export function installNativeInsets(): void {
  if (installed) return;
  installed = true;
  const root = document.documentElement;

  const apply = () => {
    const insets = readInsets();
    if (!insets) return;
    root.style.setProperty("--native-safe-top", `${insets.top}px`);
    root.style.setProperty("--native-safe-bottom", `${insets.bottom}px`);
    root.style.setProperty("--native-safe-left", `${insets.left}px`);
    root.style.setProperty("--native-safe-right", `${insets.right}px`);
  };

  apply();
  window.addEventListener("resize", apply, { passive: true });
  window.addEventListener("orientationchange", apply, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) apply();
  });
}
