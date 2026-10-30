import { Bot, ChevronRight, Database, FileCode2, Files, FolderGit2, GitBranch, Globe2, Search, TerminalSquare } from "@toph/icons";
import { Button } from "@/boardui/base/buttons/button";
import { cx } from "@/boardui/utils/cx";
import type { ComponentType } from "react";

export type MobileScreen = "bots" | "files" | "scm" | "db" | "web" | "workspace";

interface Props {
  screen: MobileScreen;
  hasWorkspace: boolean;
  onSelect: (screen: MobileScreen) => void;
  onProjects: () => void;
  onSearch: () => void;
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

export default function MobileMenu({ screen, hasWorkspace, onSelect, onProjects, onSearch, onTerminal, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[130]">
      <button
        type="button"
        aria-label="Fechar menu"
        className="mobile-backdrop-in absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <aside className="mobile-drawer-in absolute bottom-[calc(var(--safe-bottom)+0.5rem)] left-[calc(var(--safe-left)+0.5rem)] top-[calc(var(--safe-top)+0.5rem)] flex w-[min(calc(100vw-1rem-var(--safe-left)-var(--safe-right)),390px)] flex-col overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar">
        <div className="flex flex-col gap-1 px-4 pb-3 pt-4">
          <span className="text-title-3-medium text-text-primary">Toph</span>
          <span className="text-caption-1-regular text-text-secondary">Navegação do projeto</span>
        </div>

        <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
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
                <ChevronRight
                  className={cx(
                    "size-4 shrink-0 text-foreground-icon-tertiary transition-[rotate,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                    screen === item.id && "rotate-90 text-accent-500",
                  )}
                />
              </Button>
            );
          })}
        </div>

        <div className="mx-3 flex shrink-0 flex-col gap-1 border-t border-separator-border py-3">
          <Button variant="ghost" leadingIcon={FolderGit2} className="h-auto w-full justify-start gap-2 px-3 py-2.5" onClick={onProjects}>
            <span className="flex-1 text-body-2-medium">Projetos</span>
            <ChevronRight className="size-4 text-foreground-icon-tertiary" />
          </Button>
          <Button variant="ghost" leadingIcon={Search} className="h-auto w-full justify-start gap-2 px-3 py-2.5" onClick={onSearch}>
            <span className="flex-1 text-body-2-medium">Buscar</span>
            <ChevronRight className="size-4 text-foreground-icon-tertiary" />
          </Button>
          <Button variant="ghost" leadingIcon={TerminalSquare} className="h-auto w-full justify-start gap-2 px-3 py-2.5" onClick={onTerminal}>
            <span className="flex-1 text-body-2-medium">Terminal</span>
            <ChevronRight className="size-4 text-foreground-icon-tertiary" />
          </Button>
        </div>
      </aside>
    </div>
  );
}
