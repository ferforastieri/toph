import { Database, Files, Globe2, Bot, TerminalSquare } from "@toph/icons";
import { useApp, type Sidebar } from "../store";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import AvatarMenu from "./AvatarMenu";
import { cn } from "@/lib/utils";

const items: Array<{ id: Sidebar; label: string; icon: typeof Files }> = [
  { id: "files", label: "Explorer", icon: Files },
  { id: "db", label: "Databases", icon: Database },
  { id: "ai", label: "Agent", icon: Bot },
  { id: "web", label: "Web apps", icon: Globe2 },
];

export default function ActivityBar({ onOpenAI, onOpenSettings }: { onOpenAI: () => void; onOpenSettings: () => void }) {
  const sidebar = useApp((state) => state.sidebar);
  const setSidebar = useApp((state) => state.setSidebar);
  const toggleTerminal = useApp((state) => state.toggleTerminal);
  const terminalOpen = useApp((state) => state.terminalOpen);
  const aiPanelOpen = useApp((state) => state.aiPanelOpen);
  const user = useApp((state) => state.user);

  return (
    <nav className="flex h-full w-12 shrink-0 flex-col items-center border-e bg-muted/20 py-2" aria-label="Primary">
      <div className="flex flex-col items-center gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.id === "ai" ? aiPanelOpen : sidebar === item.id;
          return (
            <Button
              key={item.id}
              variant={active ? "secondary" : "ghost"}
              size="icon"
              className={cn("size-9", active && "text-primary")}
              title={item.label}
              aria-label={item.label}
              aria-pressed={active}
              onClick={() => { if (item.id === "ai") onOpenAI(); else setSidebar(item.id); }}
            >
              <Icon size={20} />
            </Button>
          );
        })}
        <Button
          variant={terminalOpen ? "secondary" : "ghost"}
          size="icon"
          className={cn("size-9", terminalOpen && "text-primary")}
          title="Terminal"
          aria-label="Terminal"
          aria-pressed={terminalOpen}
          onClick={toggleTerminal}
        >
          <TerminalSquare size={20} />
        </Button>
      </div>
      <div className="mt-auto flex flex-col items-center gap-2">
        <Separator className="w-6" />
        <AvatarMenu user={user} variant="activity" onSettings={onOpenSettings} />
      </div>
    </nav>
  );
}
