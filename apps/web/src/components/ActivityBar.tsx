import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Bot, Bug, Database, Files, GitBranch, Globe2, Info, Keyboard, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings2, Sun, TerminalSquare } from "@toph/icons";
import { useApp, type Sidebar } from "../store";
import { featureEnabled, useSettings, type WorkspaceFeature } from "../settings";
import { Button } from "@/boardui/base/buttons/button";
import { Divider } from "@/boardui/base/divider/divider";
import { Tooltip, TooltipTrigger } from "@/boardui/base/tooltip/tooltip";
import AvatarMenu from "./AvatarMenu";
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
  onBack: () => void;
  onForward: () => void;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
  onShowSidebar: () => void;
  onQuickOpen: () => void;
  onCustomizeLayout: () => void;
  onShortcuts: () => void;
  onAbout: () => void;
}

export default function ActivityBar({ projectControl, branchControl, notificationControl, onBack, onForward, sidebarVisible, onToggleSidebar, onShowSidebar, onQuickOpen, onCustomizeLayout, onShortcuts, onAbout }: Props) {
  const sidebar = useApp((state) => state.sidebar);
  const setSidebar = useApp((state) => state.setSidebar);
  const toggleTerminal = useApp((state) => state.toggleTerminal);
  const terminalOpen = useApp((state) => state.terminalOpen);
  const user = useApp((state) => state.user);
  const theme = useSettings((state) => state.theme);
  const setTheme = useSettings((state) => state.setTheme);
  const workspaceFeatures = useSettings((state) => state.workspaceFeatures);

  return (
    <nav className="flex h-full w-12 shrink-0 flex-col items-center border-e bg-background-primary-default py-2" aria-label="Primary">
      <div className="flex flex-col items-center gap-1">
        {projectControl}
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="xs" iconOnly leadingIcon={ArrowLeft} aria-label="Voltar" title="Voltar" onClick={onBack} />
          <Button variant="ghost" size="xs" iconOnly leadingIcon={ArrowRight} aria-label="Avançar" title="Avançar" onClick={onForward} />
        </div>
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
                onClick={() => { setSidebar(item.id); onShowSidebar(); }}
              />
              <Tooltip>{item.label}</Tooltip>
            </TooltipTrigger>
          );
        })}
        {branchControl}
        {featureEnabled(workspaceFeatures, "files") && (
          <TooltipTrigger delay={400}>
            <Button variant="ghost" size="medium" iconOnly leadingIcon={Search} className="size-9" aria-label="Busca rápida" onClick={onQuickOpen} />
            <Tooltip>Busca rápida</Tooltip>
          </TooltipTrigger>
        )}
        {featureEnabled(workspaceFeatures, "terminal") && (
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
        )}
        <TooltipTrigger delay={400}>
          <Button variant={sidebarVisible ? "secondary" : "ghost"} size="medium" iconOnly leadingIcon={sidebarVisible ? PanelLeftClose : PanelLeftOpen} className="size-9" aria-label={sidebarVisible ? "Recolher barra lateral" : "Mostrar barra lateral"} onClick={onToggleSidebar} />
          <Tooltip>{sidebarVisible ? "Recolher barra lateral" : "Mostrar barra lateral"}</Tooltip>
        </TooltipTrigger>
      </div>
      <div className="mt-auto flex flex-col items-center gap-2">
        {notificationControl}
        <TooltipTrigger delay={400}>
          <Button variant="ghost" size="xs" iconOnly leadingIcon={Keyboard} className="size-8 rounded-full" aria-label="Atalhos" onClick={onShortcuts} />
          <Tooltip>Atalhos</Tooltip>
        </TooltipTrigger>
        <TooltipTrigger delay={400}>
          <Button variant="ghost" size="xs" iconOnly leadingIcon={Info} className="size-8 rounded-full" aria-label="Sobre o Toph" onClick={onAbout} />
          <Tooltip>Sobre o Toph</Tooltip>
        </TooltipTrigger>
        <TooltipTrigger delay={400}>
          <Button variant="ghost" size="xs" iconOnly leadingIcon={Settings2} className="size-8 rounded-full" aria-label="Configurar workspace" onClick={onCustomizeLayout} />
          <Tooltip>Configurar workspace</Tooltip>
        </TooltipTrigger>
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
