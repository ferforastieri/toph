import { Database, Files, MoreHorizontal, Sparkles } from "lucide-react";
import type { Sidebar } from "../store";

interface Props {
  sidebar: Sidebar;
  panelOpen: boolean;
  terminalOpen: boolean;
  aiPanelOpen: boolean;
  onSidebar: (sidebar: Sidebar) => void;
  onAI: () => void;
  onMore: () => void;
}

const items: Array<{ id: Exclude<Sidebar, "settings">; label: string; icon: typeof Files }> = [
  { id: "files", label: "Arquivos", icon: Files },
  { id: "db", label: "Bancos", icon: Database },
];

export default function MobileNav({
  sidebar,
  panelOpen,
  terminalOpen,
  aiPanelOpen,
  onSidebar,
  onAI,
  onMore,
}: Props) {
  const moreActive =
    terminalOpen || (panelOpen && ["scm", "web", "settings"].includes(sidebar));
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
            <Icon size={21} strokeWidth={1.8} />
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
        <Sparkles size={21} strokeWidth={1.8} />
        <span>Agente</span>
      </button>
      <button
        type="button"
        className={moreActive ? "active" : ""}
        aria-label="Mais opções"
        aria-pressed={moreActive}
        onClick={onMore}
      >
        <MoreHorizontal size={22} strokeWidth={1.8} />
        <span>Mais</span>
      </button>
    </nav>
  );
}
