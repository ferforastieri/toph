import { Database, Files, Globe2, Sparkles, TerminalSquare } from "lucide-react";
import type { Sidebar } from "../store";

interface Props {
  sidebar: Sidebar;
  panelOpen: boolean;
  terminalOpen: boolean;
  aiPanelOpen: boolean;
  onSidebar: (sidebar: Sidebar) => void;
  onAI: () => void;
  onWeb: () => void;
  onTerminal: () => void;
}

export default function MobileNav({
  sidebar,
  panelOpen,
  terminalOpen,
  aiPanelOpen,
  onSidebar,
  onAI,
  onWeb,
  onTerminal,
}: Props) {
  return (
    <nav className="mobile-nav" aria-label="Navegação principal">
      <button
        type="button"
        className={panelOpen && sidebar === "files" ? "active" : ""}
        aria-label="Arquivos"
        aria-pressed={panelOpen && sidebar === "files"}
        onClick={() => onSidebar("files")}
      >
        <Files size={21} strokeWidth={1.8} />
        <span>Arquivos</span>
      </button>
      <button
        type="button"
        className={panelOpen && sidebar === "db" ? "active" : ""}
        aria-label="Bancos"
        aria-pressed={panelOpen && sidebar === "db"}
        onClick={() => onSidebar("db")}
      >
        <Database size={21} strokeWidth={1.8} />
        <span>Bancos</span>
      </button>
      <button
        type="button"
        className={aiPanelOpen ? "active" : ""}
        aria-label="Agente"
        aria-pressed={aiPanelOpen}
        onClick={onAI}
      >
        <Sparkles size={21} strokeWidth={1.8} />
        <span>Agente</span>
      </button>
      <button
        type="button"
        className={panelOpen && sidebar === "web" ? "active" : ""}
        aria-label="Web apps"
        aria-pressed={panelOpen && sidebar === "web"}
        onClick={onWeb}
      >
        <Globe2 size={21} strokeWidth={1.8} />
        <span>Web</span>
      </button>
      <button
        type="button"
        className={terminalOpen ? "active" : ""}
        aria-label="Terminal"
        aria-pressed={terminalOpen}
        onClick={onTerminal}
      >
        <TerminalSquare size={21} strokeWidth={1.8} />
        <span>Terminal</span>
      </button>
    </nav>
  );
}
