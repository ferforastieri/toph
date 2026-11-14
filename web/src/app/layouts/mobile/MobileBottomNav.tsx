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

export default function MobileBottomNav({ screen, onSelect, onProjects, projectsOpen = false }: Props) {
  return (
    <nav
      aria-label="Navegação principal"
      className="relative z-30 shrink-0 border-t border-separator-border bg-background-secondary-default/95 px-1.5 pb-1 pt-1.5 backdrop-blur-xl"
    >
      <div className="grid grid-cols-5 gap-0.5">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = item.id === "projects" ? projectsOpen : screen === item.id || (item.id === "more" && moreScreens.includes(screen));
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => (item.id === "projects" ? onProjects() : onSelect(item.id))}
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
