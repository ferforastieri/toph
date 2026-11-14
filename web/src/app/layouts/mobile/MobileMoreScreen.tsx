import {
  Boxes,
  Bug,
  GitBranch,
  ChevronRight,
  Database,
  FolderGit2,
  Globe2,
  Moon,
  PlugZap,
  Search,
  Settings2,
  Sparkles,
  Sun,
  TerminalSquare,
  UserRound,
} from "@toph/icons";
import type { ComponentType } from "react";
import { useSettings } from "../../../features/settings/store";
import { cx } from "@toph/ui";
import { runThemeTransition } from "../../../shared/ui/theme-transition";
import type { MobileScreen } from "./mobile-nav";

type SettingsSection = "general" | "appearance" | "skills" | "harness" | "workspace";

interface Props {
  activeTitle?: string;
  onScreen: (screen: MobileScreen) => void;
  onTerminal: () => void;
  onProjects: () => void;
  onBranch: () => void;
  onAccount: () => void;
}

interface Action {
  id: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  onSelect: () => void;
  badge?: number;
}

function openSettings(section: SettingsSection) {
  window.dispatchEvent(new CustomEvent("toph:open-settings", { detail: { section } }));
}

function ActionCard({ action }: { action: Action }) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      onClick={action.onSelect}
      className="group relative flex min-h-[76px] flex-col items-start gap-2 overflow-hidden rounded-2xl border border-border-button-white bg-background-primary-default p-3 text-start shadow-xs transition-[transform,background-color,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-border-button-hover hover:bg-background-primary-hover active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-background-tertiary-default text-text-primary transition-colors group-hover:bg-accent-500/12 group-hover:text-accent-600">
          <Icon className="size-[17px]" />
        </span>
        {action.badge && action.badge > 0 ? (
          <span className="flex min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[9px] font-semibold leading-4 text-[#1b1b1b]">
            {action.badge > 9 ? "9+" : action.badge}
          </span>
        ) : (
          <ChevronRight className="size-3.5 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-caption-1-semibold text-text-primary">{action.label}</span>
        <span className="truncate text-[10px] leading-snug text-text-tertiary">{action.description}</span>
      </span>
    </button>
  );
}

function Section({ title, actions }: { title: string; actions: Action[] }) {
  return (
    <section className="flex shrink-0 flex-col gap-2">
      <h2 className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">{title}</h2>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => <ActionCard key={action.id} action={action} />)}
      </div>
    </section>
  );
}

/** Full-screen feature hub for the mobile app. Every workspace feature has an entry here. */
export default function MobileMoreScreen({
  activeTitle,
  onScreen,
  onTerminal,
  onProjects,
  onBranch,
  onAccount,
}: Props) {
  const theme = useSettings((state) => state.theme);
  const setTheme = useSettings((state) => state.setTheme);
  const light = theme === "light";
  function changeTheme(next: "light" | "dark", event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    void runThemeTransition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, () => setTheme(next));
  }

  const work: Action[] = [
    { id: "db", label: "Bancos de dados", description: "Conexões e queries", icon: Database, onSelect: () => onScreen("db") },
    { id: "web", label: "Web apps", description: "Sites e previews", icon: Globe2, onSelect: () => onScreen("web") },
    { id: "debug", label: "Debug", description: "Breakpoints e console", icon: Bug, onSelect: () => onScreen("debug") },
    { id: "terminal", label: "Terminal", description: "Shell do projeto", icon: TerminalSquare, onSelect: onTerminal },
    { id: "search", label: "Busca global", description: "Sessões, tarefas e arquivos", icon: Search, onSelect: () => window.dispatchEvent(new CustomEvent("toph:global-search")) },
    { id: "workspace", label: "Trabalho", description: activeTitle ? `Aba: ${activeTitle}` : "Editor e abas", icon: Boxes, onSelect: () => onScreen("workspace") },
  ];

  const projectActions: Action[] = [
    { id: "projects", label: "Projetos", description: "Abrir ou fechar", icon: FolderGit2, onSelect: onProjects },
    { id: "branch", label: "Branch", description: "Trocar ou criar", icon: GitBranch, onSelect: onBranch },
    { id: "settings", label: "Configurações", description: "Layout e ferramentas", icon: Settings2, onSelect: () => openSettings("general") },
    { id: "account", label: "Conta", description: "Sessão e servidor", icon: UserRound, onSelect: onAccount },
  ];

  const tophActions: Action[] = [
    { id: "skills", label: "Skills", description: "Receitas do Toph", icon: Sparkles, onSelect: () => openSettings("skills") },
    { id: "harness", label: "Harness e MCP", description: "CLIs do agente", icon: PlugZap, onSelect: () => openSettings("harness") },
  ];



  return (
    <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-background-secondary-default px-3 pb-5 pt-3">
      <Section title="Trabalho" actions={work} />
      <Section title="Toph e IA" actions={tophActions} />
      <Section title="Projeto e app" actions={projectActions} />

      <section className="flex shrink-0 items-center justify-between gap-2 rounded-2xl border border-border-button-white bg-background-primary-default px-3 py-2.5 shadow-xs">
        <span className="flex items-center gap-2 text-caption-1-medium text-text-primary">
          {light ? <Sun className="size-4 text-accent-500" /> : <Moon className="size-4 text-accent-500" />}
          {light ? "Modo claro" : "Modo escuro"}
        </span>
        <div className="flex items-center gap-1 rounded-full bg-background-tertiary-default p-0.5">
          <button
            type="button"
            onClick={(event) => changeTheme("light", event)}
            aria-pressed={light}
            className={cx("flex size-7 items-center justify-center rounded-full transition-colors", light ? "bg-background-primary-default text-text-primary shadow-xs" : "text-text-tertiary")}
            aria-label="Ativar modo claro"
            title="Modo claro"
          >
            <Sun className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={(event) => changeTheme("dark", event)}
            aria-pressed={!light}
            className={cx("flex size-7 items-center justify-center rounded-full transition-colors", !light ? "bg-background-primary-default text-text-primary shadow-xs" : "text-text-tertiary")}
            aria-label="Ativar modo escuro"
            title="Modo escuro"
          >
            <Moon className="size-3.5" />
          </button>
        </div>
      </section>

    </div>
  );
}
