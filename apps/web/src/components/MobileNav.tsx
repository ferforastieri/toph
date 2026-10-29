import { Bot, Database, Files, GitBranch, Globe2, TerminalSquare } from "@toph/icons";
import type { Sidebar } from "../store";
import { Button } from "@/boardui/base/buttons/button";
import { cx } from "@/boardui/utils/cx";

interface Props {
  sidebar: Sidebar;
  panelOpen: boolean;
  terminalOpen: boolean;
  onSidebar: (sidebar: Sidebar) => void;
  onWeb: () => void;
  onBots: () => void;
  onTerminal: () => void;
}

export default function MobileNav({ sidebar, panelOpen, terminalOpen, onSidebar, onWeb, onBots, onTerminal }: Props) {
  const nav = [
    { key: "files", label: "Arquivos", icon: Files, active: panelOpen && sidebar === "files", onClick: () => onSidebar("files") },
    { key: "scm", label: "Git", icon: GitBranch, active: panelOpen && sidebar === "scm", onClick: () => onSidebar("scm") },
    { key: "db", label: "Bancos", icon: Database, active: panelOpen && sidebar === "db", onClick: () => onSidebar("db") },
    { key: "bots", label: "Bots", icon: Bot, active: sidebar === "bots", onClick: onBots },
    { key: "web", label: "Web", icon: Globe2, active: panelOpen && sidebar === "web", onClick: onWeb },
    { key: "terminal", label: "Terminal", icon: TerminalSquare, active: terminalOpen, onClick: onTerminal },
  ];
  return (
    <nav className="mx-2 mb-[calc(var(--safe-bottom)+0.5rem)] flex items-stretch overflow-hidden rounded-2xl border border-border-button-white bg-background-secondary-default shadow-xs" aria-label="Navegação principal">
      {nav.map((item) => (
        <Button
          key={item.key}
          variant={item.active ? "secondary" : "ghost"}
          className={cx(
            "h-16 flex-1 flex-col gap-1 overflow-visible rounded-none [&>span]:flex-col [&>span]:gap-1 [&>span]:pb-1 [&>span]:leading-3",
            item.active && "text-accent-500",
          )}
          onClick={item.onClick}
          aria-label={item.label}
        >
          <item.icon size={20} />
          <span className="text-[10px]">{item.label}</span>
        </Button>
      ))}
    </nav>
  );
}
