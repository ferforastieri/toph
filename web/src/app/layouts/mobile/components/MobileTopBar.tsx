import type { ComponentType } from "react";
import { Bell, MessageCircleQuestion, MessageSquare, X } from "@toph/icons";
import type { Project } from "../../../../shared/api";
import ProjectMonogram from "../../../../features/projects/components/ProjectMonogram";
import { useProjectQuestion, useProjectRunning } from "../../../../features/agents/activity";
import { cx } from "@toph/ui";
import BrandGlyph from "../../../../shared/ui/BrandGlyph";

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
  const question = useProjectQuestion(project.id);
  const running = useProjectRunning(project.id);
  return (
    <header className="mobile-topbar relative z-20 shrink-0 overflow-visible px-3.5 py-2.5 backdrop-blur-xl">
      <div className="pointer-events-none absolute -right-12 -top-20 size-44 rounded-full bg-accent-500/10 blur-3xl" />
      <div className="relative flex w-full min-w-0 items-center gap-3">
        <span className={cx(
          "flex size-10 shrink-0 items-center justify-center rounded-2xl",
          brandIcon ? "mobile-topbar__brand text-text-primary shadow-xs" : "bg-accent-500/10 text-accent-600",
        )}>
          {brandIcon ? <BrandGlyph size={24} /> : <Icon className="size-[18px]" />}
        </span>
        {hideTitle ? <div className="min-w-0 flex-1" /> : (
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="mobile-topbar__title truncate font-semibold leading-6 tracking-[-0.01em] text-text-primary">{title}</h1>
            {secondary ? <p className="truncate text-[11.5px] leading-4 text-text-secondary">{secondary}</p> : null}
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          {onTophs ? (
            <button
              type="button"
              onClick={onTophs}
              aria-label="Abrir sessões"
              title="Sessões"
              className="mobile-topbar__sessions flex h-8 items-center gap-1.5 rounded-full px-2.5 text-caption-2-semibold text-text-secondary shadow-xs transition-[background-color,color,border-color,transform] duration-300 hover:text-text-primary active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              <MessageSquare className="size-3.5" />
              <span className="hidden min-[380px]:inline">Sessões</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onProjects}
            aria-label={`Projeto ${project.name}. ${question ? "Pergunta pendente. " : unreadCount > 0 ? `${unreadCount} notificações não lidas. ` : ""}${running ? "Agente rodando. " : ""}Ver projetos abertos`}
            title={`${project.name}\n${project.root}`}
            className="relative flex size-10 shrink-0 items-center justify-center rounded-2xl border border-transparent bg-transparent transition-[background-color,border-color,transform] duration-300 hover:bg-background-primary-hover active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <span className="relative inline-flex shrink-0">
              <ProjectMonogram project={project} size={30} />
              {running ? (
                <span className="absolute -bottom-1 -end-1 z-10 flex size-2.5" title="Agente rodando" aria-label="Agente rodando">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-lime-text opacity-50" />
                  <span className="relative inline-flex size-2.5 rounded-full border border-background-primary-default bg-status-lime-text" />
                </span>
              ) : null}
            </span>
            {question ? (
              <span className="absolute -end-0.5 -top-0.5 z-10 flex size-4 items-center justify-center rounded-full bg-accent-500 text-background-primary-default shadow-sm" title="Pergunta pendente" aria-label="Pergunta pendente">
                <MessageCircleQuestion size={11} />
              </span>
            ) : unreadCount > 0 ? (
              <span className="absolute -end-0.5 -top-0.5 z-10 flex size-4 items-center justify-center rounded-full bg-background-primary-default text-accent-500 shadow-sm">
                <Bell size={11} className="bell-ring origin-top" />
              </span>
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
