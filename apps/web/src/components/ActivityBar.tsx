import type { ReactNode } from "react";
import { Bot, Bug, Database, Files, GitBranch, Globe2, Moon, Search, Sun, TerminalSquare } from "@toph/icons";
import { useApp, type Sidebar } from "../store";
import { featureEnabled, useSettings, type WorkspaceFeature } from "../settings";
import { Button } from "@/boardui/base/buttons/button";
import { Divider } from "@/boardui/base/divider/divider";
import { Tooltip, TooltipTrigger } from "@/boardui/base/tooltip/tooltip";
import { cx } from "@/boardui/utils/cx";

const items: Array<{ id: Sidebar; feature: WorkspaceFeature; label: string; icon: typeof Files }> = [
  { id: "files", feature: "files", label: "Explorer", icon: Files },
  { id: "scm", feature: "sourceControl", label: "Source Control", icon: GitBranch },
  { id: "db", feature: "databases", label: "Databases", icon: Database },
  { id: "bots", feature: "bots", label: "Tophs", icon: Bot },
  { id: "debug", feature: "debug", label: "Debug", icon: Bug },
  { id: "web", feature: "webApps", label: "Web apps", icon: Globe2 },
];

interface Props {
  projectControl?: ReactNode;
  branchControl?: ReactNode;
  notificationControl?: ReactNode;
  settingsControl?: ReactNode;
  onQuickOpen: () => void;
}

function ThemeToggle() {
  const theme = useSettings((state) => state.theme);
  const setTheme = useSettings((state) => state.setTheme);
  const light = theme === "light";
  return (
    <TooltipTrigger delay={400}>
      <button
        type="button"
        aria-label={light ? "Ativar modo escuro" : "Ativar modo claro"}
        aria-pressed={light}
        onClick={() => setTheme(light ? "dark" : "light")}
        className="relative flex size-8 items-center justify-center overflow-hidden rounded-full text-foreground-icon-secondary transition-colors hover:bg-background-primary-hover hover:text-foreground-icon-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        <Sun className={cx("absolute size-4 transition-all duration-300", light ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0")} />
        <Moon className={cx("absolute size-4 transition-all duration-300", light ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100")} />
      </button>
      <Tooltip>{light ? "Modo escuro" : "Modo claro"}</Tooltip>
    </TooltipTrigger>
  );
}

export default function ActivityBar({ projectControl, branchControl, notificationControl, settingsControl, onQuickOpen }: Props) {
  const sidebar = useApp((state) => state.sidebar);
  const setSidebar = useApp((state) => state.setSidebar);
  const toggleTerminal = useApp((state) => state.toggleTerminal);
  const terminalOpen = useApp((state) => state.terminalOpen);
  const workspaceFeatures = useSettings((state) => state.workspaceFeatures);

  return (
    <nav className="flex h-full w-12 shrink-0 flex-col items-center rounded-s-[22px] border-e border-separator-border bg-background-primary-default py-2" aria-label="Navegação principal">
      <div className="flex flex-col items-center gap-1">
        {projectControl}
        <Divider className="my-1 w-6" />
        {items.filter((item) => featureEnabled(workspaceFeatures, item.feature)).map((item) => {
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
        {branchControl}
        {featureEnabled(workspaceFeatures, "files") ? (
          <TooltipTrigger delay={400}>
            <Button variant="ghost" size="medium" iconOnly leadingIcon={Search} className="size-9" aria-label="Busca rápida" onClick={onQuickOpen} />
            <Tooltip>Busca rápida</Tooltip>
          </TooltipTrigger>
        ) : null}
        {featureEnabled(workspaceFeatures, "terminal") ? (
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
        ) : null}
      </div>
      <div className="mt-auto flex flex-col items-center gap-2">
        {notificationControl}
        <ThemeToggle />
        <Divider className="w-6" />
        {settingsControl}
      </div>
    </nav>
  );
}
