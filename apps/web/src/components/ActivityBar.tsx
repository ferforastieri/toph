import type { ReactNode } from "react";
import { Bot, Bug, Database, Files, GitBranch, Globe2, Search, TerminalSquare } from "@toph/icons";
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
  { id: "bots", feature: "bots", label: "Toph", icon: Bot },
  { id: "debug", feature: "debug", label: "Debug", icon: Bug },
  { id: "web", feature: "webApps", label: "Web apps", icon: Globe2 },
];

interface Props {
  settingsControl?: ReactNode;
  onQuickOpen: () => void;
}

export default function ActivityBar({ settingsControl, onQuickOpen }: Props) {
  const sidebar = useApp((state) => state.sidebar);
  const setSidebar = useApp((state) => state.setSidebar);
  const toggleTerminal = useApp((state) => state.toggleTerminal);
  const terminalOpen = useApp((state) => state.terminalOpen);
  const workspaceFeatures = useSettings((state) => state.workspaceFeatures);

  return (
    <nav className="flex h-full w-12 shrink-0 flex-col items-center rounded-s-[22px] border-e border-separator-border bg-background-primary-default py-2" aria-label="Navegação principal">
      <div className="flex flex-col items-center gap-1">
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
        <Divider className="w-6" />
        {settingsControl}
      </div>
    </nav>
  );
}
