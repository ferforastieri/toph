import { Bell, Bot, Database, FileCode2, Files, FolderGit2, GitBranch, Globe2, TerminalSquare } from "@toph/icons";
import type { User } from "../api";
import { Avatar } from "@/boardui/base/avatar/avatar";
import { Badge } from "@/boardui/base/badges/badge";
import { Button } from "@/boardui/base/buttons/button";
import type { ComponentType } from "react";

export type MobileScreen = "bots" | "files" | "scm" | "db" | "web" | "workspace";

interface Props {
  screen: MobileScreen;
  hasWorkspace: boolean;
  user: User | null;
  projectName: string;
  branch: string;
  unreadCount: number;
  onSelect: (screen: MobileScreen) => void;
  onProjects: () => void;
  onBranch: () => void;
  onNotifications: () => void;
  onAccount: () => void;
  onTerminal: () => void;
  onClose: () => void;
}

const screens: Array<{ id: MobileScreen; label: string; description: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "bots", label: "Bots", description: "Equipe e conversa do projeto", icon: Bot },
  { id: "files", label: "Arquivos", description: "Explore o repositório", icon: Files },
  { id: "scm", label: "Git", description: "Mudanças, branches e commits", icon: GitBranch },
  { id: "db", label: "Bancos", description: "Conexões, schemas e queries", icon: Database },
  { id: "web", label: "Web apps", description: "Sites e ferramentas internas", icon: Globe2 },
  { id: "workspace", label: "Editor", description: "Aba ativa do workspace", icon: FileCode2 },
];

function initials(username?: string): string {
  const value = username?.trim();
  if (!value) return "?";
  const parts = value.split(/[\s._-]+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return value.slice(0, 2).toUpperCase();
}

export default function MobileMenu({
  screen,
  hasWorkspace,
  user,
  projectName,
  branch,
  unreadCount,
  onSelect,
  onProjects,
  onBranch,
  onNotifications,
  onAccount,
  onTerminal,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-[130]">
      <button
        type="button"
        aria-label="Fechar menu"
        className="mobile-backdrop-in absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <aside className="mobile-drawer-in absolute bottom-[calc(var(--safe-bottom)+0.5rem)] left-[calc(var(--safe-left)+0.5rem)] top-[calc(var(--safe-top)+0.5rem)] flex w-[min(calc(100vw-1rem-var(--safe-left)-var(--safe-right)),390px)] flex-col overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar">
        <button
          type="button"
          className="flex w-full items-center gap-3 border-b border-separator-border p-3 text-start hover:bg-background-primary-hover"
          onClick={onAccount}
        >
          <Avatar size="md" initials={initials(user?.username)} className="bg-accent-500/15 text-accent-500" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-body-medium text-text-primary">{user?.username ?? "Conta"}</span>
            <span className="truncate text-caption-1-regular text-text-secondary">{projectName}</span>
          </span>
        </button>

        <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          {screens.map((item) => {
            const disabled = item.id === "workspace" && !hasWorkspace;
            return (
              <Button
                key={item.id}
                variant={screen === item.id ? "secondary" : "ghost"}
                leadingIcon={item.icon}
                disabled={disabled}
                onClick={() => onSelect(item.id)}
                className="h-auto w-full justify-start gap-2 px-3 py-2.5 text-start"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body-2-medium">{item.label}</span>
                  <span className="text-caption-2-regular text-text-tertiary">{item.description}</span>
                </span>
              </Button>
            );
          })}
        </div>

        <div className="flex shrink-0 flex-col gap-1 border-t border-separator-border p-2">
          <Button variant="ghost" className="h-auto w-full justify-start gap-2 px-3 py-2.5" onClick={onBranch}>
            <GitBranch className="size-4 text-foreground-icon-secondary" />
            <span className="flex min-w-0 flex-1 flex-col text-start">
              <span className="text-body-2-medium">Branch</span>
              <span className="truncate text-caption-2-regular text-text-tertiary">{branch || "detached"}</span>
            </span>
          </Button>
          <Button variant="ghost" className="h-auto w-full justify-start gap-2 px-3 py-2.5" onClick={onNotifications}>
            <Bell className="size-4 text-foreground-icon-secondary" />
            <span className="flex flex-1 text-body-2-medium">Notificações</span>
            {unreadCount > 0 ? <Badge color="primary">{unreadCount > 9 ? "9+" : unreadCount}</Badge> : null}
          </Button>
          <Button variant="ghost" leadingIcon={FolderGit2} className="h-auto w-full justify-start gap-2 px-3 py-2.5" onClick={onProjects}>
            <span className="flex-1 text-body-2-medium">Projetos</span>
          </Button>
          <Button variant="ghost" leadingIcon={TerminalSquare} className="h-auto w-full justify-start gap-2 px-3 py-2.5" onClick={onTerminal}>
            <span className="flex-1 text-body-2-medium">Terminal</span>
          </Button>
        </div>
      </aside>
    </div>
  );
}
