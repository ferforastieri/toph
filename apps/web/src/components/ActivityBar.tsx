import {
  Database,
  Files,
  Globe2,
  Sparkles,
  TerminalSquare,
} from "@toph/icons";
import { useApp, type Sidebar } from "../store";
import { Button } from "@toph/ui";
import AvatarMenu from "./AvatarMenu";
import NotificationBell from "./NotificationBell";
import type { AppNotification } from "../store";

const items: Array<{ id: Sidebar; label: string; icon: typeof Files }> = [
  { id: "files", label: "Explorer", icon: Files },
  { id: "db", label: "Databases", icon: Database },
  { id: "ai", label: "Agent", icon: Sparkles },
  { id: "web", label: "Web apps", icon: Globe2 },
];

interface Props {
  onOpenAI: () => void;
  onOpenNotification: (notification: AppNotification) => void;
}

export default function ActivityBar({ onOpenAI, onOpenNotification }: Props) {
  const sidebar = useApp((state) => state.sidebar);
  const setSidebar = useApp((state) => state.setSidebar);
  const toggleTerminal = useApp((state) => state.toggleTerminal);
  const terminalOpen = useApp((state) => state.terminalOpen);
  const aiPanelOpen = useApp((state) => state.aiPanelOpen);
  const user = useApp((state) => state.user);

  return (
    <nav className="activity-bar" aria-label="Primary">
      <div className="activity-top">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              className={`activity-button ${(item.id === "ai" ? aiPanelOpen : sidebar === item.id) ? "active" : ""}`}
              title={item.label}
              onClick={() => {
                if (item.id === "ai") onOpenAI();
                else setSidebar(item.id);
              }}
            >
              <Icon size={21} strokeWidth={1.7} />
            </Button>
          );
        })}
        <Button
          className={`activity-button ${terminalOpen ? "active" : ""}`}
          title="Terminal"
          onClick={toggleTerminal}
        >
          <TerminalSquare size={21} strokeWidth={1.7} />
        </Button>
      </div>
      <div className="activity-bottom">
        <NotificationBell variant="activity" onOpen={onOpenNotification} />
        <AvatarMenu
          user={user}
          variant="activity"
          active={sidebar === "settings"}
          onSettings={() => setSidebar("settings")}
        />
      </div>
    </nav>
  );
}
