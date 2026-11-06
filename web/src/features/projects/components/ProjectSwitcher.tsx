import { useState } from "react";
import { Search, X } from "@toph/icons";
import { useApp } from "../../../app/store";
import { Avatar } from "@/shared/boardui/base/avatar/avatar";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Input } from "@/shared/boardui/base/input/input";
import NotificationBadge from "../../notifications/components/NotificationBadge";

interface Props {
  onSelect: (id: string) => void;
  onCloseProject?: (id: string) => void;
  /** Only list projects that are not already open in the workspace. */
  onlyClosed?: boolean;
}

/** The project switcher: one search field and the available repositories. */
export default function ProjectSwitcher({ onSelect, onCloseProject, onlyClosed = false }: Props) {
  const projects = useApp((state) => state.projects);
  const openProjectIds = useApp((state) => state.openProjectIds);
  const notifications = useApp((state) => state.notifications);
  const [query, setQuery] = useState("");

  const normalized = query.trim().toLowerCase();
  const visible = projects
    .filter((project) => !onlyClosed || !openProjectIds.includes(project.id))
    .filter((project) =>
      !normalized
      || project.name.toLowerCase().includes(normalized)
      || project.root.toLowerCase().includes(normalized),
    )
    .sort((a, b) => {
      const aOpen = openProjectIds.includes(a.id) ? 0 : 1;
      const bOpen = openProjectIds.includes(b.id) ? 0 : 1;
      return aOpen - bOpen || a.name.localeCompare(b.name);
    });

  const unreadFor = (projectId: string) =>
    notifications.filter((notification) => !notification.read && notification.projectId === projectId).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <span className="pointer-events-none absolute start-2.5 top-1/2 z-10 -translate-y-1/2 text-text-tertiary"><Search size={14} /></span>
        <Input
          value={query}
          onChange={setQuery}
          placeholder="Pesquisar repositório"
          aria-label="Pesquisar repositório"
          className="[&_input]:ps-8"
        />
      </div>
      <div className="flex items-center justify-between px-1 text-caption-2-regular text-text-tertiary">
        <span>Repositórios disponíveis</span>
        <span>{visible.length}</span>
      </div>
      <div className="flex max-h-[min(420px,50vh)] flex-col gap-0.5 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-caption-2-regular text-text-tertiary">
            {onlyClosed ? "Todos os projetos já estão abertos." : "Nenhum repositório encontrado."}
          </p>
        ) : null}
        {visible.map((item) => {
          const open = openProjectIds.includes(item.id);
          return (
            <div key={item.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-2 text-start text-text-primary transition-colors hover:bg-dropdown-item-hover-background focus-visible:bg-dropdown-item-hover-background"
              >
                <Avatar size="sm" initials={item.name.slice(0, 1).toUpperCase()} className="bg-accent-500/15 text-caption-2-semibold text-accent-500" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-body-2-medium text-text-primary">{item.name}</span>
                    {open ? <span className="shrink-0 rounded-full bg-accent-500/10 px-1.5 text-[9px] font-medium uppercase tracking-wide text-accent-600">aberto</span> : null}
                  </span>
                  <span className="truncate text-caption-1-regular text-text-secondary">{item.root}</span>
                </span>
                <NotificationBadge count={unreadFor(item.id)} className="shrink-0 text-text-tertiary" />
              </button>
              {open && onCloseProject ? (
                <Button
                  variant="ghost"
                  size="xs"
                  iconOnly
                  leadingIcon={X}
                  aria-label={`Fechar ${item.name}`}
                  title="Fechar projeto"
                  onClick={() => onCloseProject(item.id)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
