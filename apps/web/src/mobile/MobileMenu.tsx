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
  { id: "bots", label: "Tophs", description: "Sua equipe de agentes", icon: Bot },
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
  onSelect,
  onBranch,
  onAccount,
  onTerminal,
  onClose,
}: Props) {
  const theme = useSettings((state) => state.theme);
  const setTheme = useSettings((state) => state.setTheme);
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
        <button
          type="button"
          className="flex w-full items-center gap-3 border-b border-separator-border p-3 text-start hover:bg-background-primary-hover"
          onClick={onAccount}
        >
          <PetSprite kind={pet.kind} size={38} commits={pet.commits} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-body-medium text-text-primary">{user?.username ?? "Conta"}</span>
            <span className="truncate text-caption-1-regular text-text-secondary">{projectName}</span>
          </span>
        </button>

        <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          <div className="px-2 pb-1 pt-2 text-caption-2-semibold uppercase tracking-[0.16em] text-text-tertiary">Navegar</div>
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
          <button type="button" className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-background-primary-hover" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            <span className="relative flex size-6 items-center justify-center">
              <Sun className={cx("absolute size-4 transition-all duration-300", theme === "light" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0")} />
              <Moon className={cx("absolute size-4 transition-all duration-300", theme === "dark" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0")} />
            </span>
            <span className="flex-1 text-start text-body-2-medium text-text-primary">Tema {theme === "dark" ? "escuro" : "claro"}</span>
          </button>
          <div className="px-2 pb-1 pt-1 text-caption-2-semibold uppercase tracking-[0.16em] text-text-tertiary">Projeto</div>
          <Button variant="ghost" leadingIcon={GitBranch} className="h-auto w-full justify-start gap-2 px-3 py-2.5" onClick={onBranch}>
            <span className="flex min-w-0 flex-1 flex-col text-start">
              <span className="text-body-2-medium">Branch</span>
              <span className="truncate text-caption-2-regular text-text-tertiary">{branch || "detached"}</span>
            </span>
          </Button>
          <Button variant="ghost" leadingIcon={TerminalSquare} className="h-auto w-full justify-start gap-2 px-3 py-2.5" onClick={onTerminal}>
            <span className="flex-1 text-body-2-medium">Terminal</span>
          </Button>
        </div>
      </aside>
    </div>
  );
}
