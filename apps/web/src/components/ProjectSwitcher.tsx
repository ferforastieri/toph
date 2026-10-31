import { FolderGit2, FolderPlus, X } from "@toph/icons";
import { useApp } from "../store";
import { Avatar } from "@/boardui/base/avatar/avatar";
import { Badge } from "@/boardui/base/badges/badge";
import { Button } from "@/boardui/base/buttons/button";

interface Props {
  onSelect: (id: string) => void;
  onCloseProject?: (id: string) => void;
  onOpenRepo: () => void;
}

/**
 * The project switcher body. Shared by the desktop header dropdown and the
 * mobile projects sheet so both have exactly the same visual and behaviour.
 */
export default function ProjectSwitcher({ onSelect, onCloseProject, onOpenRepo }: Props) {
  const projects = useApp((state) => state.projects);
  const openProjectIds = useApp((state) => state.openProjectIds);
  const notifications = useApp((state) => state.notifications);
  const openProjects = openProjectIds
    .map((id) => projects.find((project) => project.id === id))
    .filter((project): project is NonNullable<typeof project> => Boolean(project));
  const closedProjects = projects.filter((project) => !openProjectIds.includes(project.id));
  const unreadFor = (projectId: string) =>
    notifications.filter((notification) => !notification.read && notification.projectId === projectId);

  return (
    <div className="flex flex-col gap-1">
      <div className="px-2 pt-1 text-body-medium text-text-secondary">Projetos abertos · {openProjects.length}</div>
      {openProjects.map((item) => {
        const unread = unreadFor(item.id);
        return (
          <div key={item.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-2 text-start text-text-primary transition-colors hover:bg-dropdown-item-hover-background focus-visible:bg-dropdown-item-hover-background"
            >
              <Avatar size="sm" initials={item.name.slice(0, 1).toUpperCase()} className="bg-background-tertiary-default text-caption-2-semibold" style={{ color: item.color }} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-2-medium text-text-primary">{item.name}</span>
                <span className="truncate text-caption-1-regular text-text-secondary">{item.root}</span>
              </span>
              {unread.length > 0 && <Badge color="primary">{unread.length > 9 ? "9+" : unread.length}</Badge>}
            </button>
            {onCloseProject && (
              <Button
                variant="ghost"
                size="xs"
                iconOnly
                leadingIcon={X}
                aria-label={`Fechar ${item.name}`}
                title="Fechar projeto"
                onClick={() => onCloseProject(item.id)}
              />
            )}
          </div>
        );
      })}
      {closedProjects.length > 0 && (
        <>
          <div className="my-1 h-px bg-border-button-default" />
          <div className="px-2 pt-1 text-body-medium text-text-secondary">Projetos fechados</div>
          {closedProjects.map((item) => {
            const unread = unreadFor(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className="flex min-w-0 items-center gap-2 rounded-lg p-2 text-start text-text-primary transition-colors hover:bg-dropdown-item-hover-background focus-visible:bg-dropdown-item-hover-background"
              >
                <FolderGit2 size={14} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-2-medium text-text-primary">{item.name}</span>
                  <span className="truncate text-caption-1-regular text-text-secondary">{item.root}</span>
                </span>
                {unread.length > 0 && <Badge color="primary">{unread.length > 9 ? "9+" : unread.length}</Badge>}
              </button>
            );
          })}
        </>
      )}
      <div className="my-1 h-px bg-border-button-default" />
      <button type="button" onClick={onOpenRepo} className="flex items-center gap-2 rounded-lg p-2 text-start text-text-primary transition-colors hover:bg-dropdown-item-hover-background focus-visible:bg-dropdown-item-hover-background">
        <FolderPlus size={14} /> Abrir repositório
      </button>
    </div>
  );
}
