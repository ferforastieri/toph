import type { ComponentType } from "react";
import { Users, X } from "@toph/icons";
import type { Project } from "../../../../shared/api";
import NotificationBadge from "../../../../features/notifications/components/NotificationBadge";
import ProjectTophAvatar from "../../../../features/projects/components/ProjectTophAvatar";
import BrandMark from "@toph/brand";
import { cx } from "@/shared/boardui/utils/cx";

interface Props {
  title: string;
  subtitle?: string;
  project: Project;
  unreadCount: number;
  icon: ComponentType<{ className?: string }>;
  onProjects: () => void;
  onTophs?: () => void;
  onClose?: () => void;
  hideTitle?: boolean;
  brandIcon?: boolean;
}

/** Compact header shared by every mobile screen. */
export default function MobileTopBar({
  title,
  subtitle,
  project,
  unreadCount,
  icon: Icon,
  onProjects,
  onTophs,
  onClose,
  hideTitle = false,
  brandIcon = false,
}: Props) {
  const secondary = subtitle === undefined ? project.name : subtitle;
  return (
    <header className="relative z-20 shrink-0 overflow-visible border-b border-separator-border bg-background-secondary-default/95 px-3 py-2 backdrop-blur-xl">
      <div className="pointer-events-none absolute -right-10 -top-16 size-36 rounded-full bg-accent-500/10 blur-2xl" />
      <div className="relative flex w-full min-w-0 items-center gap-2.5">
        <span className={cx(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          brandIcon ? "bg-background-primary-default shadow-xs" : "bg-accent-500/10 text-accent-600",
        )}>
          {brandIcon ? <BrandMark size="small" className="size-7" /> : <Icon className="size-[18px]" />}
        </span>
        {hideTitle ? <div className="min-w-0 flex-1" /> : (
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="truncate text-[19px] font-medium leading-6 text-text-primary">{title}</h1>
            {secondary ? <p className="truncate text-caption-2-regular text-text-secondary">{secondary}</p> : null}
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {onTophs ? (
            <button
              type="button"
              onClick={onTophs}
              aria-label="Abrir Tophs"
              title="Tophs"
              className="flex h-9 items-center gap-1.5 rounded-full border border-border-button-default bg-background-primary-default px-2.5 text-caption-2-semibold text-text-secondary shadow-xs transition-[background-color,color,border-color,transform] duration-300 hover:border-border-button-hover hover:text-text-primary active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              <Users className="size-3.5" />
              <span className="hidden min-[380px]:inline">Tophs</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onProjects}
            aria-label={`Projeto ${project.name}. Selecionar projeto${unreadCount > 0 ? `, ${unreadCount} notificações não lidas` : ""}`}
            title={project.name}
            className="relative flex size-9 shrink-0 items-center justify-center rounded-full border border-border-button-default bg-background-primary-default transition-[border-color,background-color,transform] duration-300 hover:border-border-button-hover hover:bg-background-primary-hover active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <ProjectTophAvatar project={project} size={26} showInitial />
            {unreadCount > 0 ? (
              <NotificationBadge count={unreadCount} size={16} tone="light" className="absolute -bottom-1 -end-1 z-10" />
            ) : null}
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              title="Fechar"
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-background-primary-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
