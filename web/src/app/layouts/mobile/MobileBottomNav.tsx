import { Bot, Boxes, Files, GitBranch, MoreHorizontal } from "@toph/icons";
import { cx } from "@toph/ui";
import type { ComponentType } from "react";
import type { MobileScreen } from "./mobile-nav";

interface Props {
  screen: MobileScreen;
  onSelect: (screen: MobileScreen) => void;
}

const tabs: Array<{ id: MobileScreen; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "workspace", label: "Trabalho", icon: Boxes },
  { id: "scm", label: "Git", icon: GitBranch },
  { id: "bots", label: "Toph", icon: Bot },
  { id: "files", label: "Arquivos", icon: Files },
  { id: "more", label: "Mais", icon: MoreHorizontal },
];

const moreScreens: MobileScreen[] = ["db", "web", "debug", "more"];
const MARK = `${import.meta.env.BASE_URL}brand/toph-mark-eyeless.png?v=3`;

/**
 * The always-there mobile tab bar, in the native tab bar's shape: labels under
 * the glyphs, the current tab in ink and Projetos wearing the project it is on.
 */
export default function MobileBottomNav({ screen, onSelect }: Props) {
  return (
    <nav
      aria-label="Navegação principal"
      className="mobile-tabbar-nav relative z-30 shrink-0 backdrop-blur-xl"
      style={{ paddingBottom: "calc(0.25rem + var(--safe-bottom))" }}
    >
      <div className="mobile-tabbar">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = screen === item.id || (item.id === "more" && moreScreens.includes(screen));
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={cx(
                "group flex min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-1 transition-[color,transform] duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                active ? "text-text-primary" : "text-text-tertiary",
              )}
            >
              {item.id === "bots" ? (
                <span
                  className="toph-tab-mark"
                  style={{
                    WebkitMaskImage: `url("${MARK}")`,
                    maskImage: `url("${MARK}")`,
                  }}
                  aria-hidden="true"
                />
              ) : (
                <Icon className="toph-tab-icon" />
              )}
              <span className={cx("max-w-full truncate text-[10px] leading-3", active ? "font-semibold" : "font-medium")}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
