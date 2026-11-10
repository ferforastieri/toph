import type { ReactNode } from "react";
import { useApp } from "../store";
import ProjectTophAvatar from "../../features/projects/components/ProjectTophAvatar";

interface Props {
  control?: ReactNode;
  icon?: ReactNode;
  title: string;
  count?: ReactNode;
  actions?: ReactNode;
}

export default function SidebarHeader({ control, icon, title, count, actions }: Props) {
  const project = useApp((state) => state.projects.find((item) => item.id === state.activeProjectId) ?? null);
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-separator-border px-2">
      {control}
      {icon}
      <strong className="min-w-0 truncate text-body-2-medium text-text-primary">{title}</strong>
      {count}
      <span className="min-w-0 flex-1" />
      {project ? (
        <span
          className="flex min-w-0 shrink items-center gap-1 text-caption-2-regular text-text-tertiary"
          title={`${project.name}\n${project.root}`}
          aria-label={`Projeto ${project.name}`}
        >
          <ProjectTophAvatar project={project} size={14} showInitial />
          <span className="min-w-0 truncate">{project.name}</span>
        </span>
      ) : null}
      {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
    </header>
  );
}
