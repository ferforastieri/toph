import { Bot, Database, Files, GitBranch, Globe2, Moon, Sun, TerminalSquare } from "@toph/icons";
import { useApp, type Sidebar } from "../store";
import { useSettings } from "../settings";
import { Button } from "@/boardui/base/buttons/button";
import { Divider } from "@/boardui/base/divider/divider";
import { Tooltip, TooltipTrigger } from "@/boardui/base/tooltip/tooltip";
import AvatarMenu from "./AvatarMenu";
import { cx } from "@/boardui/utils/cx";

const items: Array<{ id: Sidebar; label: string; icon: typeof Files }> = [
  { id: "files", label: "Explorer", icon: Files },
  { id: "scm", label: "Source Control", icon: GitBranch },
  { id: "db", label: "Databases", icon: Database },
  { id: "bots", label: "Bots", icon: Bot },
  { id: "web", label: "Web apps", icon: Globe2 },
];

export default function ActivityBar() {
  const sidebar = useApp((state) => state.sidebar);
  const setSidebar = useApp((state) => state.setSidebar);
  const toggleTerminal = useApp((state) => state.toggleTerminal);
  const terminalOpen = useApp((state) => state.terminalOpen);
  const user = useApp((state) => state.user);
  const theme = useSettings((state) => state.theme);
  const setTheme = useSettings((state) => state.setTheme);

  return (
    <nav className="flex h-full w-12 shrink-0 flex-col items-center border-e bg-background-primary-default py-2" aria-label="Primary">
      <div className="flex flex-col items-center gap-1">
        {items.map((item) => {
          const active = sidebar === item.id;
          return (
            <TooltipTrigger key={item.id} delay={400}>
              <Button
                variant={active ? "secondary" : "ghost"}
                size="medium"
                iconOnly
                leadingIcon={item.icon}
                className={cx("size-9", active && "text-accent-500")}
                aria-label={item.label}
                aria-pressed={active}
                onClick={() => setSidebar(item.id)}
              />
              <Tooltip>{item.label}</Tooltip>
            </TooltipTrigger>
          );
        })}
        <TooltipTrigger delay={400}>
          <Button
            variant={terminalOpen ? "secondary" : "ghost"}
            size="medium"
            iconOnly
            leadingIcon={TerminalSquare}
            className={cx("size-9", terminalOpen && "text-accent-500")}
            aria-label="Terminal"
            aria-pressed={terminalOpen}
            onClick={toggleTerminal}
          />
          <Tooltip>Terminal</Tooltip>
        </TooltipTrigger>
      </div>
      <div className="mt-auto flex flex-col items-center gap-2">
        <div className="flex flex-col items-center gap-0.5 rounded-full bg-background-secondary-default p-1">
          <Button variant={theme === "light" ? "secondary" : "ghost"} size="xs" iconOnly leadingIcon={Sun} className="size-8 rounded-full" aria-label="Modo claro" aria-pressed={theme === "light"} onClick={() => setTheme("light")} />
          <Button variant={theme === "dark" ? "secondary" : "ghost"} size="xs" iconOnly leadingIcon={Moon} className="size-8 rounded-full" aria-label="Modo escuro" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")} />
        </div>
        <Divider className="w-6" />
        <AvatarMenu user={user} variant="activity" />
      </div>
    </nav>
  );
}
