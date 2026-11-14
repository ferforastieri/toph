import { useEffect, useRef, useState } from "react";
import { Bot, Boxes, FolderGit2, GitBranch, MoreHorizontal } from "@toph/icons";
import { cx } from "@toph/ui";
import type { ComponentType } from "react";
import type { MobileScreen } from "./mobile-nav";

interface Props {
  screen: MobileScreen;
  onSelect: (screen: MobileScreen) => void;
  onProjects: () => void;
  projectsOpen?: boolean;
}

const tabs: Array<{ id: MobileScreen | "projects"; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "workspace", label: "Trabalho", icon: Boxes },
  { id: "scm", label: "Git", icon: GitBranch },
  { id: "bots", label: "Toph", icon: Bot },
  { id: "more", label: "Mais", icon: MoreHorizontal },
  { id: "projects", label: "Projetos", icon: FolderGit2 },
];

const moreScreens: MobileScreen[] = ["db", "web", "debug", "more"];

const VISIBLE_MS = 4000;

/**
 * The mobile tab bar, as the native one in Tophs: the bar's own face, labels under
 * the glyphs and the current tab in ink. It hides itself and comes back on a swipe
 * up, stays a few seconds and goes again when a tab is chosen.
 */
export default function MobileBottomNav({ screen, onSelect, onProjects, projectsOpen = false }: Props) {
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    function arm() {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setVisible(false), VISIBLE_MS);
    }
    function show() {
      setVisible(true);
      arm();
    }
    function onStart(event: TouchEvent) {
      startY.current = event.touches[0]?.clientY ?? null;
    }
    function onMove(event: TouchEvent) {
      if (startY.current === null) return;
      const y = event.touches[0]?.clientY ?? startY.current;
      if (startY.current - y > 42) {
        startY.current = null;
        show();
      }
    }
    function onEnd() {
      startY.current = null;
    }
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  // Opening the projects sheet takes the bar away under it.
  useEffect(() => {
    if (projectsOpen) setVisible(false);
  }, [projectsOpen]);

  function choose(item: (typeof tabs)[number]) {
    setVisible(false);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    if (item.id === "projects") onProjects();
    else onSelect(item.id);
  }

  return (
    <nav
      aria-label="Navegação principal"
      aria-hidden={visible ? undefined : true}
      className={cx(
        "fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur-xl transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
      )}
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <div className="grid grid-cols-5 px-1.5 pb-1 pt-1.5">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = item.id === "projects" ? projectsOpen : screen === item.id || (item.id === "more" && moreScreens.includes(screen));
          return (
            <button
              key={item.id}
              type="button"
              tabIndex={visible ? 0 : -1}
              onClick={() => choose(item)}
              aria-current={active ? "page" : undefined}
              className={cx(
                "group flex min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-1 transition-[color,transform] duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                active ? "text-text-primary" : "text-text-tertiary",
              )}
            >
              <Icon className={cx("size-[22px]", active && "stroke-[1.8]")} />
              <span className={cx("max-w-full truncate text-[10px] leading-3", active ? "font-semibold" : "font-medium")}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
