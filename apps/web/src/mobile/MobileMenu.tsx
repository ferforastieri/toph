import { Bot, Bug, Database, FileCode2, Files, GitBranch, Globe2, Moon, Sun, TerminalSquare } from "@toph/icons";
import type { User } from "../api";
import { Button } from "@/boardui/base/buttons/button";
import { useSettings } from "../settings";
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
  onSelect: (screen: MobileScreen) => void;
  onBranch: () => void;
  onAccount: () => void;
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

function ThemeToggle() {
  const theme = useSettings((state) => state.theme);
  const setTheme = useSettings((state) => state.setTheme);
  const light = theme === "light";
  return (
    <button
      type="button"
      aria-label={light ? "Ativar modo escuro" : "Ativar modo claro"}
      aria-pressed={light}
      title={light ? "Ativar modo escuro" : "Ativar modo claro"}
      onClick={() => setTheme(light ? "dark" : "light")}
      className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-foreground-icon-secondary transition-[background-color,color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-background-primary-hover hover:text-foreground-icon-primary active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      <Sun className={cx("absolute size-4 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", light ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0")} />
      <Moon className={cx("absolute size-4 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", light ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100")} />
    </button>
  );
}

export default function MobileMenu({
  screen,
  hasWorkspace,
  user,
  projectName,
  branch,
  onSelect,
  onBranch,
  onAccount,
  onTerminal,
  onClose,
}: Props) {
  const pet = usePet();
  return (
    <div className="fixed inset-0 z-[130]">
      <button
        type="button"
        aria-label="Fechar menu"
        className="mobile-backdrop-in absolute inset-0 bg-black/60 active:scale-100"
        onClick={onClose}
      />
      <aside className="mobile-drawer-in absolute bottom-[calc(var(--safe-bottom)+0.5rem)] left-[calc(var(--safe-left)+0.5rem)] top-[calc(var(--safe-top)+0.5rem)] flex w-[min(calc(100vw-3rem-var(--safe-left)-var(--safe-right)),360px)] flex-col overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar">
        <button
          type="button"
          title="Abrir conta"
          onClick={onAccount}
          className="flex w-full min-w-0 flex-col border-b border-separator-border p-3 text-start transition-[background-color,color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-background-primary-hover active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <span className="truncate text-body-medium text-text-primary">{user?.username ?? "Conta"}</span>
          <span className="truncate text-caption-1-regular text-text-secondary">{projectName}</span>
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

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-separator-border p-2">
          <button
            type="button"
            aria-label="Abrir conta"
            title="Conta"
            onClick={onAccount}
            className="relative shrink-0 rounded-full transition-[transform,color,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-105 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <PetSprite kind={pet.kind} size={38} commits={pet.commits} />
          </button>
          <ThemeToggle />
        </div>
      </aside>
    </div>
  );
}
