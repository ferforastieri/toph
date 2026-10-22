import {
  Database,
  Files,
  Globe2,
  Search,
  Settings,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { useApp, type Sidebar } from "../store";

const items: Array<{ id: Sidebar; label: string; icon: typeof Files }> = [
  { id: "files", label: "Explorer", icon: Files },
  { id: "search", label: "Search", icon: Search },
  { id: "db", label: "Databases", icon: Database },
  { id: "ai", label: "OpenCode", icon: Sparkles },
  { id: "web", label: "Web apps", icon: Globe2 },
];

export default function ActivityBar() {
  const sidebar = useApp((state) => state.sidebar);
  const setSidebar = useApp((state) => state.setSidebar);
  const toggleTerminal = useApp((state) => state.toggleTerminal);
  const terminalOpen = useApp((state) => state.terminalOpen);

  return (
    <nav className="activity-bar" aria-label="Primary">
      <div className="activity-top">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`activity-button ${sidebar === item.id ? "active" : ""}`}
              title={item.label}
              onClick={() => setSidebar(item.id)}
            >
              <Icon size={21} strokeWidth={1.7} />
            </button>
          );
        })}
        <button
          className={`activity-button ${terminalOpen ? "active" : ""}`}
          title="Terminal"
          onClick={toggleTerminal}
        >
          <TerminalSquare size={21} strokeWidth={1.7} />
        </button>
      </div>
      <div className="activity-bottom">
        <button
          className={`activity-button ${sidebar === "settings" ? "active" : ""}`}
          title="Settings"
          onClick={() => setSidebar("settings")}
        >
          <Settings size={21} strokeWidth={1.7} />
        </button>
      </div>
    </nav>
  );
}
