import { Bot, Boxes, FolderGit2, GitBranch, MoreHorizontal } from "@toph/icons";
import { cx } from "@toph/ui";
import type { ComponentType } from "react";
import type { Project } from "../../../shared/api";
import ProjectMonogram from "../../../features/projects/components/ProjectMonogram";
import type { MobileScreen } from "./mobile-nav";

interface Props {
  screen: MobileScreen;
  onSelect: (screen: MobileScreen) => void;
  onProjects: () => void;
  projectsOpen?: boolean;
  project?: Project | null;
}

const tabs: Array<{ id: MobileScreen | "projects"; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "workspace", label: "Trabalho", icon: Boxes },
  { id: "scm", label: "Git", icon: GitBranch },
  { id: "bots", label: "Toph", icon: Bot },
  { id: "more", label: "Mais", icon: MoreHorizontal },
  { id: "projects", label: "Projetos", icon: FolderGit2 },
];

const moreScreens: MobileScreen[] = ["db", "web", "debug", "more"];

/**
 * The always-there mobile tab bar, in the native tab bar's shape: labels under
 * the glyphs, the current tab in ink and Projetos wearing the project it is on.
 */
export default function MobileBottomNav({ screen, onSelect, onProjects, projectsOpen = false, project = null }: Props) {
  return (
    <nav
      aria-label="Navegação principal"
      className="relative z-30 shrink-0 border-t border-[var(--line)] bg-[var(--bg)]/95 pb-1 pt-1.5 backdrop-blur-xl"
      style={{ paddingBottom: "calc(0.25rem + var(--safe-bottom))" }}
    >
      <div className="grid grid-cols-5 px-1.5">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = item.id === "projects" ? projectsOpen : screen === item.id || (item.id === "more" && moreScreens.includes(screen));
          const projects = item.id === "projects";
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => { if (item.id === "projects") onProjects(); else onSelect(item.id); }}
              aria-current={active ? "page" : undefined}
              title={projects ? project?.name ?? item.label : item.label}
              className={cx(
                "group flex min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-1 transition-[color,transform] duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                active ? "text-text-primary" : "text-text-tertiary",
              )}
            >
              {projects && project ? (
                <span className="flex size-[22px] items-center justify-center">
                  <ProjectMonogram project={project} size={22} />
                </span>
              ) : (
                <Icon className={cx("size-[22px]", active && "stroke-[1.8]")} />
              )}
              <span className={cx("max-w-full truncate text-[10px] leading-3", active ? "font-semibold" : "font-medium")}>
                {projects && project ? project.name : item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
