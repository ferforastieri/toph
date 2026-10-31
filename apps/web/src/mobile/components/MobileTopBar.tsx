import { Bell, FolderGit2, LayoutPanelLeft } from "@toph/icons";
import { Badge } from "@/boardui/base/badges/badge";
import { Button } from "@/boardui/base/buttons/button";

interface Props {
  title: string;
  projectName: string;
  unreadCount: number;
  onMenu: () => void;
  onNotifications: () => void;
  onProjects: () => void;
}

/** Compact app bar shared by every mobile screen. */
export default function MobileTopBar({ title, projectName, unreadCount, onMenu, onNotifications, onProjects }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-separator-border bg-background-primary-default px-2">
      <Button
        variant="ghost"
        size="small"
        iconOnly
        leadingIcon={LayoutPanelLeft}
        aria-label="Abrir menu"
        title="Abrir menu"
        onClick={onMenu}
        className="size-9 shrink-0"
      />
      <h1 className="min-w-0 flex-1 truncate text-title-3-medium text-text-primary">{title}</h1>
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
          className="h-9 max-w-[132px] gap-1 px-1.5"
        >
          <span className="min-w-0 truncate text-caption-1-medium">{projectName}</span>
        </Button>
      </div>
    </header>
  );
}
