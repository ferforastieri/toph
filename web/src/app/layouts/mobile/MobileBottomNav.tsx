import { Bot, Boxes, Files, GitBranch, MoreHorizontal } from "@toph/icons";
import { cx } from "@/shared/boardui/utils/cx";
import type { ComponentType } from "react";
import type { MobileScreen } from "./mobile-nav";

interface Props {
  screen: MobileScreen;
  onSelect: (screen: MobileScreen) => void;
}

const tabs: Array<{ id: MobileScreen; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "bots", label: "Toph", icon: Bot },
  { id: "files", label: "Arquivos", icon: Files },
  { id: "scm", label: "Git", icon: GitBranch },
  { id: "workspace", label: "Trabalho", icon: Boxes },
  { id: "more", label: "Mais", icon: MoreHorizontal },
];

const moreScreens: MobileScreen[] = ["db", "web", "debug", "more"];

export default function MobileBottomNav({ screen, onSelect }: Props) {
  return (
    <nav
      aria-label="Navegação principal"
      className="relative z-30 shrink-0 border-t border-separator-border bg-background-secondary-default/95 px-1.5 pb-1 pt-1.5 backdrop-blur-xl"
    >
      <div className="grid grid-cols-5 gap-0.5">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = screen === item.id || (item.id === "more" && moreScreens.includes(screen));
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={active ? "page" : undefined}
              className={cx(
                "group flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-0.5 py-1 transition-[color,background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                active ? "text-accent-500" : "text-text-tertiary hover:text-text-primary",
              )}
            >
              <span
                className={cx(
                  "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-300",
                  active && "bg-accent-500/12",
                )}
              >
                <Icon className="size-[19px]" />
              </span>
              <span className={cx("max-w-full truncate text-[10px] leading-3", active ? "font-semibold" : "font-medium")}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
