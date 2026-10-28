import { Database, Files, Globe2, Bot, TerminalSquare } from "@toph/icons";
import type { Sidebar } from "../store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export default function MobileNav({ sidebar, panelOpen, terminalOpen, aiPanelOpen, onSidebar, onAI, onWeb, onTerminal }: Props) {
  const nav = [
    { key: "files", label: "Arquivos", icon: Files, active: panelOpen && sidebar === "files", onClick: () => onSidebar("files") },
    { key: "db", label: "Bancos", icon: Database, active: panelOpen && sidebar === "db", onClick: () => onSidebar("db") },
    { key: "ai", label: "Agente", icon: Bot, active: aiPanelOpen, onClick: onAI },
    { key: "web", label: "Web", icon: Globe2, active: panelOpen && sidebar === "web", onClick: onWeb },
    { key: "terminal", label: "Terminal", icon: TerminalSquare, active: terminalOpen, onClick: onTerminal },
  ];
  return (
    <nav className="flex items-stretch border-t bg-background pb-[env(safe-area-inset-bottom)]" aria-label="Navegação principal">
      {nav.map((item) => {
        const Icon = item.icon;
        return (
          <Button key={item.key} variant={item.active ? "secondary" : "ghost"} className={cn("h-14 flex-1 flex-col gap-1 rounded-none", item.active && "text-primary")} onClick={item.onClick} aria-label={item.label}>
            <Icon size={20} />
            <span className="text-[10px]">{item.label}</span>
          </Button>
        );
      })}
    </nav>
  );
}
