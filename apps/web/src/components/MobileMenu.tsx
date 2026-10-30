import { Bot, Database, FileCode2, Files, FolderGit2, GitBranch, Globe2, Search, TerminalSquare } from "@toph/icons";
import { Button } from "@/boardui/base/buttons/button";
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
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-[min(90vw,390px)] flex-col overflow-y-auto border-e border-border-button-white bg-background-primary-default p-3 shadow-2xl">
        <div className="flex flex-col gap-1 px-2 pb-3 pt-2">
          <span className="text-title-3-medium text-text-primary">Toph</span>
          <span className="text-caption-1-regular text-text-secondary">Navegação do projeto</span>
        </div>

        <div className="flex flex-col gap-1">
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
                <span className="flex min-w-0 flex-col">
                  <span className="text-body-2-medium">{item.label}</span>
                  <span className="text-caption-2-regular text-text-tertiary">{item.description}</span>
                </span>
              </Button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-col gap-1 border-t border-separator-border pt-3">
          <Button variant="ghost" leadingIcon={FolderGit2} className="h-auto w-full justify-start gap-2 px-3 py-2.5" onClick={onProjects}>
            <span className="text-body-2-medium">Projetos</span>
          </Button>
          <Button variant="ghost" leadingIcon={Search} className="h-auto w-full justify-start gap-2 px-3 py-2.5" onClick={onSearch}>
            <span className="text-body-2-medium">Buscar</span>
          </Button>
          <Button variant="ghost" leadingIcon={TerminalSquare} className="h-auto w-full justify-start gap-2 px-3 py-2.5" onClick={onTerminal}>
            <span className="text-body-2-medium">Terminal</span>
          </Button>
        </div>
      </aside>
    </div>
  );
}
