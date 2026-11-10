import type { ReactNode } from "react";
import { useApp } from "../store";

interface Props {
  control?: ReactNode;
  icon?: ReactNode;
  title: string;
  count?: ReactNode;
  actions?: ReactNode;
}

export default function SidebarHeader({ control, icon, title, count, actions }: Props) {
  const project = useApp((state) => state.projects.find((item) => item.id === state.activeProjectId) ?? null);
  const color = project?.color || "#FFB547";
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-separator-border px-2">
      {control}
      {icon}
      <strong className="min-w-0 shrink-0 truncate text-body-2-medium text-text-primary">{title}</strong>
      {count}
      {project ? (
        <span
          className="flex min-w-0 items-center gap-1.5 text-caption-1-regular text-text-secondary"
          title={`${project.name}\n${project.root}`}
          aria-label={`Projeto ${project.name}`}
        >
          <span
            className="flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold leading-none"
            style={{ backgroundColor: `${color}22`, color }}
            aria-hidden="true"
          >
            {project.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 truncate">{project.name}</span>
        </span>
      ) : null}
      <span className="min-w-0 flex-1" />
      {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
    </header>
  );
}
