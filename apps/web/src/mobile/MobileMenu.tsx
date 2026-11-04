import { Bot, Bug, Database, FileCode2, Files, GitBranch, Globe2, MessageSquare, TerminalSquare } from "@toph/icons";
import type { User } from "../api";
import { Button } from "@/boardui/base/buttons/button";
import { Badge } from "@/boardui/base/badges/badge";
import { usePet } from "../pet";
import PetSprite from "../ui/PetSprite";
import { cx } from "@/boardui/utils/cx";
import type { ComponentType } from "react";

export type MobileScreen = "bots" | "files" | "scm" | "db" | "web" | "debug" | "workspace";

interface Props {
  screen: MobileScreen;
  hasWorkspace: boolean;
  user: User | null;
  projectName: string;
  branch: string;
  unreadCount: number;
  onSelect: (screen: MobileScreen) => void;
  onConversations: () => void;
  onBranch: () => void;
  onAccount: () => void;
  onNotifications: () => void;
  onTerminal: () => void;
  onClose: () => void;
}

const screens: Array<{ id: MobileScreen; label: string; description: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "bots", label: "Chat", description: "Sua conversa atual", icon: Bot },
  { id: "files", label: "Arquivos", description: "Explore o repositório", icon: Files },
  { id: "scm", label: "Git", description: "Mudanças, branches e commits", icon: GitBranch },
  { id: "db", label: "Bancos", description: "Conexões, schemas e queries", icon: Database },
  { id: "web", label: "Web apps", description: "Sites e ferramentas internas", icon: Globe2 },
  { id: "debug", label: "Debug", description: "Breakpoints, stack e console", icon: Bug },
  { id: "workspace", label: "Editor", description: "Aba ativa do workspace", icon: FileCode2 },
];

export default function MobileMenu({
  screen,
  hasWorkspace,
  user,
  projectName,
  branch,
  unreadCount,
  onSelect,
  onConversations,
  onBranch,
  onAccount,
  onNotifications,
  onTerminal,
  onClose,
}: Props) {
  const pet = usePet();
  return (
    <div className="fixed inset-0 z-[130]">
      <button
        type="button"
        aria-label="Fechar menu"
        className="mobile-backdrop-in absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <aside className="mobile-drawer-in absolute bottom-[calc(var(--safe-bottom)+0.5rem)] left-[calc(var(--safe-left)+0.5rem)] top-[calc(var(--safe-top)+0.5rem)] flex w-[min(calc(100vw-3rem-var(--safe-left)-var(--safe-right)),360px)] flex-col overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar">
        <div className="flex w-full items-center gap-2 border-b border-separator-border p-3">
          <button
            type="button"
            aria-label={unreadCount > 0 ? `Notificações, ${unreadCount} não lidas` : "Notificações"}
            title="Notificações"
            onClick={onNotifications}
            className={cx("relative shrink-0 rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring", unreadCount > 0 && "pet-notification")}
          >
            <PetSprite kind={pet.kind} size={38} commits={pet.commits} />
            {unreadCount > 0 ? (
              <Badge color="primary" className="pointer-events-none absolute -right-1 -top-1 min-w-4 px-1 text-[10px]">
                {unreadCount > 9 ? "9+" : unreadCount}
              </Badge>
            ) : null}
          </button>
          <button
            type="button"
            title="Abrir conta"
            onClick={onAccount}
            className="flex min-w-0 flex-1 flex-col text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <span className="truncate text-body-medium text-text-primary">{user?.username ?? "Conta"}</span>
            <span className="truncate text-caption-1-regular text-text-secondary">{projectName}</span>
          </button>
        </div>

        <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          <Button
            variant="ghost"
            leadingIcon={MessageSquare}
            onClick={onConversations}
            className="h-auto w-full justify-start gap-2 px-3 py-2.5 text-start"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-body-2-medium">Conversas</span>
              <span className="text-caption-2-regular text-text-tertiary">Trocar de Toph ou equipe</span>
            </span>
          </Button>
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
          <Button variant="ghost" leadingIcon={GitBranch} className="h-auto w-full justify-start gap-2 px-3 py-2.5" onClick={onBranch}>
            <span className="flex min-w-0 flex-1 flex-col text-start">
              <span className="text-body-2-medium">Branch</span>
              <span className="truncate text-caption-2-regular text-text-tertiary">{branch || "detached"}</span>
            </span>
          </Button>
          <Button variant="ghost" leadingIcon={TerminalSquare} className="h-auto w-full justify-start gap-2 px-3 py-2.5" onClick={onTerminal}>
            <span className="flex min-w-0 flex-1 flex-col text-start">
              <span className="text-body-2-medium">Terminal</span>
              <span className="text-caption-2-regular text-text-tertiary">Shell do projeto</span>
            </span>
          </Button>
        </div>
      </aside>
    </div>
  );
}
