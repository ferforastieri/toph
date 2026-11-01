import type { ComponentType, ReactNode } from "react";
import { Bell, FolderGit2, LayoutPanelLeft } from "@toph/icons";
import { Badge } from "@/boardui/base/badges/badge";
import { cx } from "@/boardui/utils/cx";
import { Button } from "@/boardui/base/buttons/button";

interface Props {
  title: string;
  subtitle?: string;
  projectName: string;
  unreadCount: number;
  icon: ComponentType<{ className?: string }>;
  onMenu: () => void;
  onNotifications: () => void;
  onProjects: () => void;
  extraActions?: ReactNode;
  hideTitle?: boolean;
}

/** Compact version of the mobile hero header, with the app controls on the right. */
export default function MobileTopBar({ title, subtitle, projectName, unreadCount, icon: Icon, onMenu, onNotifications, onProjects, extraActions, hideTitle = false }: Props) {
  return (
    <header className={cx(
      "relative shrink-0 overflow-hidden px-3 pt-2",
      extraActions ? "border-b-0 bg-transparent pb-1" : "border-b border-separator-border bg-background-secondary-default pb-2.5",
    )}>
      {!extraActions ? <div className="pointer-events-none absolute -right-10 -top-16 size-36 rounded-full bg-accent-500/10 blur-2xl" /> : null}
      <div className="relative flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          aria-label="Abrir menu"
          title="Abrir menu"
          onClick={onMenu}
          className={cx(
            "relative flex size-9 shrink-0 items-center justify-center rounded-2xl text-accent-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            extraActions ? "border-0 bg-transparent shadow-none hover:bg-background-primary-hover" : "border border-accent-500/20 bg-accent-500/10 shadow-xs hover:bg-accent-500/15",
          )}
        >
          <Icon className="size-4.5" />
          <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border border-border-button-default bg-background-primary-default text-foreground-icon-secondary shadow-xs">
            <LayoutPanelLeft className="size-2.5" />
          </span>
        </button>
        {extraActions ? (
          <div className="flex min-w-0 flex-1 items-center gap-0.5">{extraActions}</div>
        ) : !hideTitle ? (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="truncate text-title-2-medium text-text-primary">{title}</h1>
            <p className="truncate text-caption-2-regular text-text-secondary">{subtitle ?? projectName}</p>
          </div>
        ) : null}
        <div className="flex shrink-0 items-center gap-0.5">
          <div className="relative">
            <Button
              variant="ghost"
              size="small"
              iconOnly
              leadingIcon={Bell}
              aria-label={unreadCount > 0 ? `Notificações, ${unreadCount} não lidas` : "Notificações"}
              title="Notificações"
              onClick={onNotifications}
              className="size-9"
            />
            {unreadCount > 0 ? (
              <Badge color="primary" className="pointer-events-none absolute -right-0.5 -top-0.5 min-w-4 px-1 text-[10px]">
                {unreadCount > 9 ? "9+" : unreadCount}
              </Badge>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="small"
            leadingIcon={FolderGit2}
            aria-label={`Projeto ${projectName}. Selecionar projeto`}
            title="Selecionar projeto"
            onClick={onProjects}
            className="h-9 gap-1 px-1"
          >
            <span className={cx("min-w-0 truncate text-caption-1-medium", extraActions ? "max-w-16" : "max-w-24")}>{projectName}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
