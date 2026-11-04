import type { ComponentType } from "react";
import { Bell, FolderGit2, LayoutPanelLeft, Menu } from "@toph/icons";
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
  hideTitle?: boolean;
  floating?: boolean;
}

/** Compact version of the mobile hero header, with the app controls on the right. */
export default function MobileTopBar({ title, subtitle, projectName, unreadCount, icon: Icon, onMenu, onNotifications, onProjects, hideTitle = false, floating = false }: Props) {
  const secondary = subtitle === undefined ? projectName : subtitle;
  return (
    <header className={cx(
      floating
        ? "fixed inset-x-3 top-[calc(var(--safe-top)+0.5rem)] z-50 flex items-center justify-between gap-2"
        : "relative shrink-0 overflow-hidden border-b border-separator-border bg-background-secondary-default px-3 pb-2 pt-2",
    )}>
      <div className="pointer-events-none absolute -right-10 -top-16 size-36 rounded-full bg-accent-500/10 blur-2xl" />
      <div className="relative flex w-full min-w-0 items-center gap-2">
        <button
          type="button"
          aria-label="Abrir menu"
          title="Abrir menu"
          onClick={onMenu}
          className={cx(
            "relative flex shrink-0 items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            floating
              ? "size-10 rounded-full bg-foreground-icon-primary/10 text-text-primary shadow-xs backdrop-blur-md hover:bg-foreground-icon-primary/15"
              : "size-9 rounded-xl border border-accent-500/20 bg-accent-500/10 text-accent-500 shadow-xs hover:bg-accent-500/15",
          )}
        >
          {floating ? <Menu className="size-5" /> : <Icon className="size-4" />}
          {!floating ? (
            <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full border border-border-button-default bg-background-primary-default text-foreground-icon-secondary shadow-xs">
              <LayoutPanelLeft className="size-2" />
            </span>
          ) : null}
        </button>
        {!floating && !hideTitle ? (
          <div className="flex min-w-0 flex-1 flex-col gap-0">
            <h1 className="truncate text-[20px] leading-6 font-medium text-text-primary">{title}</h1>
            {secondary ? <p className="truncate text-caption-2-regular text-text-secondary">{secondary}</p> : null}
          </div>
        ) : floating ? (
          <div className="min-w-0 flex-1" />
        ) : null}
        <div className={cx("flex min-w-0 shrink-0 items-center gap-0.5", floating && "max-w-[calc(100vw-4.5rem)] justify-end rounded-full bg-foreground-icon-primary/10 p-1 shadow-xs backdrop-blur-md")}>
          <div className="relative shrink-0">
            <Button
              variant="ghost"
              size="small"
              iconOnly
              leadingIcon={Bell}
              aria-label={unreadCount > 0 ? `Notificações, ${unreadCount} não lidas` : "Notificações"}
              title="Notificações"
              onClick={onNotifications}
              className={cx("rounded-full", floating ? "size-8" : "size-9 [&_svg]:size-4")}
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
            className={cx("shrink-0 gap-1 rounded-full", floating ? "h-8 px-1" : "h-9 px-1 [&_svg]:size-4")}
          >
            <span className="min-w-0 max-w-24 truncate text-caption-2-medium">{projectName}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
