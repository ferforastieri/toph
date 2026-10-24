import {
  Database,
  Files,
  GitBranch,
  Globe2,
  Search,
  Settings,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import type { Sidebar } from "../store";

interface Props {
  sidebar: Sidebar;
  panelOpen: boolean;
  terminalOpen: boolean;
  aiPanelOpen: boolean;
  onSidebar: (sidebar: Sidebar) => void;
  onAI: () => void;
  onTerminal: () => void;
  onSettings: () => void;
}

const items: Array<{ id: Exclude<Sidebar, "settings">; label: string; icon: typeof Files }> = [
  { id: "files", label: "Arquivos", icon: Files },
  { id: "search", label: "Busca", icon: Search },
  { id: "scm", label: "Git", icon: GitBranch },
  { id: "db", label: "Bancos", icon: Database },
  { id: "web", label: "Web", icon: Globe2 },
];

export default function MobileNav({
  sidebar,
  panelOpen,
  terminalOpen,
  aiPanelOpen,
  onSidebar,
  onAI,
  onTerminal,
  onSettings,
}: Props) {
  return (
    <nav className="mobile-nav" aria-label="Navegação principal">
      {items.map(({ id, label, icon: Icon }) => {
        const active = panelOpen && sidebar === id;
        return (
          <button
            key={id}
            type="button"
            className={active ? "active" : ""}
            aria-label={label}
            aria-pressed={active}
            onClick={() => onSidebar(id)}
          >
            <Icon size={20} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        );
      })}
      <button
        type="button"
        className={aiPanelOpen ? "active" : ""}
        aria-label="Agente"
        aria-pressed={aiPanelOpen}
        onClick={onAI}
      >
        <Sparkles size={20} strokeWidth={1.8} />
        <span>Agente</span>
      </button>
      <button
        type="button"
        className={terminalOpen ? "active" : ""}
        aria-label="Terminal"
        aria-pressed={terminalOpen}
        onClick={onTerminal}
      >
        <TerminalSquare size={20} strokeWidth={1.8} />
        <span>Terminal</span>
      </button>
      <button
        type="button"
        className={panelOpen && sidebar === "settings" ? "active" : ""}
        aria-label="Configurações"
        aria-pressed={panelOpen && sidebar === "settings"}
        onClick={onSettings}
      >
        <Settings size={20} strokeWidth={1.8} />
        <span>Ajustes</span>
      </button>
    </nav>
  );
}
