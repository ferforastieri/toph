import { flushSync } from "react-dom";

type ViewTransition = { ready: Promise<void>; finished: Promise<void> };
type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => ViewTransition };

const STYLE_ID = "toph-theme-transition";
let running = false;

function blurredCircleMask() {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
    '<defs><filter id="blur" x="-50%" y="-50%" width="200%" height="200%">',
    '<feGaussianBlur stdDeviation="2" /></filter></defs>',
    '<circle cx="50" cy="50" r="42" fill="white" filter="url(#blur)" />',
    "</svg>",
  ].join("");
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function installStyle(x: number, y: number, radius: number) {
  document.getElementById(STYLE_ID)?.remove();
  const mask = blurredCircleMask();
  const size = radius * 2.5;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    ::view-transition-new(root) {
      -webkit-mask-image: ${mask};
      mask-image: ${mask};
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      animation: toph-theme-mask-reveal 820ms cubic-bezier(0.16, 1, 0.3, 1) both;
      transform-origin: ${x}px ${y}px;
      will-change: -webkit-mask-size, -webkit-mask-position, mask-size, mask-position;
    }
    @keyframes toph-theme-mask-reveal {
      from {
        -webkit-mask-position: ${x}px ${y}px;
        mask-position: ${x}px ${y}px;
        -webkit-mask-size: 0px 0px;
        mask-size: 0px 0px;
      }
      to {
        -webkit-mask-position: ${x - size / 2}px ${y - size / 2}px;
        mask-position: ${x - size / 2}px ${y - size / 2}px;
        -webkit-mask-size: ${size}px ${size}px;
        mask-size: ${size}px ${size}px;
      }
    }
  `;
  document.head.appendChild(style);
  return style;
}

/**
 * The next theme grows out of the press as a soft circle (the Faang app's
 * view transition). Reduced motion and browsers without the API just apply it.
 */
export async function runThemeTransition(origin: { x: number; y: number }, apply: () => void) {
  const doc = document as ViewTransitionDocument;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (!doc.startViewTransition || reduceMotion || running) {
    apply();
    return;
  }
  const x = Math.min(Math.max(origin.x, 0), window.innerWidth);
  const y = Math.min(Math.max(origin.y, 0), window.innerHeight);
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  running = true;
  document.documentElement.classList.add("theme-transitioning");
  const style = installStyle(x, y, radius);
  try {
    const transition = doc.startViewTransition(() => {
      flushSync(apply);
    });
    await transition.ready;
    await transition.finished;
  } finally {
    style.remove();
    document.documentElement.classList.remove("theme-transitioning");
    running = false;
  }
}
