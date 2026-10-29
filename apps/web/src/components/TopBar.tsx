import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LayoutPanelLeft,
  Rows3,
  Settings2,
  SplitVertical,
} from "@toph/icons";
import type { Project } from "../api";
import { Button } from "@/boardui/base/buttons/button";
import { Dropdown, DropdownDivider, DropdownGroup, DropdownItem, DropdownPopover, DropdownTrigger } from "@/boardui/base/dropdown/dropdown";
import BrandMark from "@toph/brand";
import QuickOpen from "./QuickOpen";

type SidebarTarget = "files" | "scm" | "db" | "web";

interface Props {
  project: Project | null;
  quickOpenToken: number;
  onOpenFile: (path: string, line?: number) => void;
  onOpenRepo: () => void;
  onCloseTab: () => void;
  onBack: () => void;
  onForward: () => void;
  onSidebar: (sidebar: SidebarTarget) => void;
  onToggleAI: () => void;
  aiOpen: boolean;
  onToggleTerminal: () => void;
  onShowTerminal: () => void;
  onCustomizeLayout: () => void;
  onToggleActivity: () => void;
  onToggleSidebar: () => void;
  sidebarVisible: boolean;
  onToggleStatus: () => void;
  statusVisible: boolean;
  onAbout: () => void;
  onShortcuts: () => void;
  menuVisible: boolean;
  showQuickOpen: boolean;
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
}

function editorCommand(command: string) {
  window.dispatchEvent(new CustomEvent("toph:editor-command", { detail: { command } }));
}

function terminalCommand(command: string) {
  window.dispatchEvent(new CustomEvent("toph:terminal-command", { detail: { command } }));
}

function terminalTab(tab: string) {
  window.dispatchEvent(new CustomEvent("toph:terminal-tab", { detail: { tab } }));
}

function MenuAction({ label, shortcut, onSelect, close }: { label: ReactNode; shortcut?: string; onSelect: () => void; close: () => void }) {
  return (
    <DropdownItem
      onSelect={() => { close(); onSelect(); }}
      className="text-body-2-regular"
    >
      {label}
      {shortcut && <span className="ms-auto text-caption-2-regular text-text-tertiary">{shortcut}</span>}
    </DropdownItem>
  );
}

function TopMenu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dropdown isOpen={open} onOpenChange={setOpen}>
      <DropdownTrigger className="h-full cursor-pointer px-2 text-body-2-regular text-text-secondary outline-none transition-colors hover:bg-background-secondary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring">
        {label}
      </DropdownTrigger>
      <DropdownPopover aria-label={label} placement="bottom start" className="w-64">
        {children(() => setOpen(false))}
      </DropdownPopover>
    </Dropdown>
  );
}

export default function TopBar({
  project,
  quickOpenToken,
  onOpenFile,
  onOpenRepo,
  onCloseTab,
  onBack,
  onForward,
  onSidebar,
  onToggleAI,
  aiOpen,
  onToggleTerminal,
  onShowTerminal,
  onCustomizeLayout,
  onToggleActivity,
  onToggleSidebar,
  sidebarVisible,
  onToggleStatus,
  statusVisible,
  onAbout,
  onShortcuts,
  menuVisible,
  showQuickOpen,
  headerLeft,
  headerRight,
}: Props) {
  return (
    <header className="mx-1 mt-1 flex h-9 shrink-0 items-center gap-1 rounded-2xl border border-border-button-white bg-background-secondary-default px-2.5 text-body-2-regular text-text-secondary shadow-xs">
      <BrandMark size="small" className="me-1 size-5" />
      {menuVisible && <div className="flex h-full min-w-0 items-center">
        <TopMenu label="File">
          {(close) => (
            <DropdownGroup>
              <MenuAction close={close} label="New File..." shortcut="Ctrl+N" onSelect={() => { onSidebar("files"); window.setTimeout(() => window.dispatchEvent(new CustomEvent("toph:explorer-action", { detail: { action: "new-file" } })), 40); }} />
              <MenuAction close={close} label="New Folder..." onSelect={() => { onSidebar("files"); window.setTimeout(() => window.dispatchEvent(new CustomEvent("toph:explorer-action", { detail: { action: "new-folder" } })), 40); }} />
              <DropdownDivider />
              <MenuAction close={close} label="Open Repository..." onSelect={onOpenRepo} />
              <MenuAction close={close} label="Save" shortcut="Ctrl+S" onSelect={() => editorCommand("save")} />
              <DropdownDivider />
              <MenuAction close={close} label="Close Editor" shortcut="Ctrl+W" onSelect={onCloseTab} />
            </DropdownGroup>
          )}
        </TopMenu>
        <TopMenu label="Edit">
          {(close) => (
            <DropdownGroup>
              <MenuAction close={close} label="Undo" shortcut="Ctrl+Z" onSelect={() => editorCommand("undo")} />
              <MenuAction close={close} label="Redo" shortcut="Ctrl+Y" onSelect={() => editorCommand("redo")} />
              <DropdownDivider />
              <MenuAction close={close} label="Cut" shortcut="Ctrl+X" onSelect={() => editorCommand("editor.action.clipboardCutAction")} />
              <MenuAction close={close} label="Copy" shortcut="Ctrl+C" onSelect={() => editorCommand("editor.action.clipboardCopyAction")} />
              <MenuAction close={close} label="Paste" shortcut="Ctrl+V" onSelect={() => editorCommand("editor.action.clipboardPasteAction")} />
              <DropdownDivider />
              <MenuAction close={close} label="Find" shortcut="Ctrl+F" onSelect={() => editorCommand("actions.find")} />
              <MenuAction close={close} label="Replace" shortcut="Ctrl+H" onSelect={() => editorCommand("editor.action.startFindReplaceAction")} />
              <MenuAction close={close} label="Select All" shortcut="Ctrl+A" onSelect={() => editorCommand("editor.action.selectAll")} />
            </DropdownGroup>
          )}
        </TopMenu>
        <TopMenu label="Selection">
          {(close) => (
            <DropdownGroup>
              <MenuAction close={close} label="Select All" shortcut="Ctrl+A" onSelect={() => editorCommand("editor.action.selectAll")} />
              <MenuAction close={close} label="Expand Selection" shortcut="Shift+Alt+Right" onSelect={() => editorCommand("editor.action.smartSelect.expand")} />
              <MenuAction close={close} label="Copy Line Up" shortcut="Shift+Alt+Up" onSelect={() => editorCommand("editor.action.copyLinesUpAction")} />
              <MenuAction close={close} label="Copy Line Down" shortcut="Shift+Alt+Down" onSelect={() => editorCommand("editor.action.copyLinesDownAction")} />
              <MenuAction close={close} label="Move Line Up" shortcut="Alt+Up" onSelect={() => editorCommand("editor.action.moveLinesUpAction")} />
              <MenuAction close={close} label="Move Line Down" shortcut="Alt+Down" onSelect={() => editorCommand("editor.action.moveLinesDownAction")} />
            </DropdownGroup>
          )}
        </TopMenu>
        <TopMenu label="View">
          {(close) => (
            <>
              <DropdownGroup>
                <MenuAction close={close} label="Command Palette..." shortcut="Ctrl+Shift+P" onSelect={() => editorCommand("editor.action.quickCommand")} />
                <MenuAction close={close} label="Open View..." onSelect={() => onSidebar("files")} />
              </DropdownGroup>
              <DropdownDivider />
              <DropdownGroup label="Views">
                <MenuAction close={close} label="Explorer" onSelect={() => onSidebar("files")} />
                <MenuAction close={close} label="Source Control" onSelect={() => onSidebar("scm")} />
                <MenuAction close={close} label="Databases" onSelect={() => onSidebar("db")} />
                <MenuAction close={close} label="Web Apps" onSelect={() => onSidebar("web")} />
              </DropdownGroup>
              <DropdownDivider />
              <DropdownGroup label="Panels">
                <MenuAction close={close} label="Problems" onSelect={() => { onShowTerminal(); terminalTab("problems"); }} />
                <MenuAction close={close} label="Output" onSelect={() => { onShowTerminal(); terminalTab("output"); }} />
                <MenuAction close={close} label="Debug Console" onSelect={() => { onShowTerminal(); terminalTab("debug"); }} />
                <MenuAction close={close} label="Terminal" onSelect={() => { onShowTerminal(); terminalTab("terminal"); }} />
                <MenuAction close={close} label="Ports" onSelect={() => { onShowTerminal(); terminalTab("ports"); }} />
              </DropdownGroup>
              <DropdownDivider />
              <DropdownGroup label="Appearance">
                <MenuAction close={close} label={`${sidebarVisible ? "Hide" : "Show"} Primary Side Bar`} shortcut="Ctrl+B" onSelect={onToggleSidebar} />
                <MenuAction close={close} label={`${aiOpen ? "Hide" : "Show"} Secondary Side Bar`} shortcut="Ctrl+Alt+B" onSelect={onToggleAI} />
                <MenuAction close={close} label="Toggle Panel" shortcut="Ctrl+J" onSelect={onToggleTerminal} />
                <MenuAction close={close} label={`${statusVisible ? "Hide" : "Show"} Status Bar`} onSelect={onToggleStatus} />
                <MenuAction close={close} label="Toggle Activity Bar" onSelect={onToggleActivity} />
                <MenuAction close={close} label="Customize Layout..." onSelect={onCustomizeLayout} />
              </DropdownGroup>
            </>
          )}
        </TopMenu>
        <TopMenu label="Go">
          {(close) => (
            <DropdownGroup>
              <MenuAction close={close} label="Back" shortcut="Alt+Left" onSelect={onBack} />
              <MenuAction close={close} label="Forward" shortcut="Alt+Right" onSelect={onForward} />
              <MenuAction close={close} label="Go to File..." shortcut="Ctrl+P" onSelect={() => window.dispatchEvent(new CustomEvent("toph:quick-open"))} />
              <MenuAction close={close} label="Go to Symbol..." shortcut="Ctrl+Shift+O" onSelect={() => editorCommand("editor.action.quickOutline")} />
              <MenuAction close={close} label="Go to Line..." shortcut="Ctrl+G" onSelect={() => editorCommand("editor.action.gotoLine")} />
              <DropdownDivider />
              <MenuAction close={close} label="Go to Definition" shortcut="F12" onSelect={() => editorCommand("editor.action.revealDefinition")} />
              <MenuAction close={close} label="Go to References" shortcut="Shift+F12" onSelect={() => editorCommand("editor.action.referenceSearch.trigger")} />
              <DropdownDivider />
              <MenuAction close={close} label="Next Problem" shortcut="F8" onSelect={() => editorCommand("editor.action.marker.next")} />
              <MenuAction close={close} label="Previous Problem" shortcut="Shift+F8" onSelect={() => editorCommand("editor.action.marker.prev")} />
            </DropdownGroup>
          )}
        </TopMenu>
        <TopMenu label="Run">
          {(close) => (
            <DropdownGroup>
              <MenuAction close={close} label="Run Without Debugging" shortcut="Ctrl+F5" onSelect={() => editorCommand("run")} />
              <MenuAction close={close} label="Start Debugging" shortcut="F5" onSelect={() => editorCommand("run")} />
            </DropdownGroup>
          )}
        </TopMenu>
        <TopMenu label="Terminal">
          {(close) => (
            <DropdownGroup>
              <MenuAction close={close} label="New Terminal" shortcut="Ctrl+Shift+`" onSelect={() => { onShowTerminal(); terminalCommand("new"); }} />
              <MenuAction close={close} label="Split Terminal" onSelect={() => { onShowTerminal(); terminalCommand("split"); }} />
              <MenuAction close={close} label="Clear Terminal" onSelect={() => terminalCommand("clear")} />
              <MenuAction close={close} label="Kill Terminal" onSelect={() => terminalCommand("kill")} />
              <DropdownDivider />
              <MenuAction close={close} label="Toggle Terminal" shortcut="Ctrl+`" onSelect={onToggleTerminal} />
            </DropdownGroup>
          )}
        </TopMenu>
        <TopMenu label="Help">
          {(close) => (
            <DropdownGroup>
              <MenuAction close={close} label="Keyboard Shortcuts" onSelect={onShortcuts} />
              <MenuAction close={close} label="Documentation" onSelect={() => window.open("https://github.com/ferforastieri/toph", "_blank", "noopener,noreferrer")} />
              <MenuAction close={close} label="About Toph" onSelect={onAbout} />
            </DropdownGroup>
          )}
        </TopMenu>
      </div>}

      {headerLeft && (
        <div className="ms-1 flex min-w-0 items-center gap-0.5 border-s border-separator-border ps-1.5">
          {headerLeft}
        </div>
      )}

      <div className="flex min-w-0 flex-1 items-center justify-center px-2">
        {showQuickOpen && <QuickOpen project={project} focusToken={quickOpenToken} onOpenFile={onOpenFile} className="w-[min(340px,30vw)]" />}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="xs" iconOnly leadingIcon={ArrowLeft} aria-label="Voltar" title="Voltar" onClick={onBack} />
        <Button variant="ghost" size="xs" iconOnly leadingIcon={ArrowRight} aria-label="Avançar" title="Avançar" onClick={onForward} />
        <Button variant={sidebarVisible ? "secondary" : "ghost"} size="xs" iconOnly leadingIcon={LayoutPanelLeft} aria-label="Barra lateral primária" title="Barra lateral primária" onClick={onToggleSidebar} />
        <Button variant={aiOpen ? "secondary" : "ghost"} size="xs" iconOnly leadingIcon={SplitVertical} aria-label="Barra lateral secundária" title="Barra lateral secundária" onClick={onToggleAI} />
        <Button variant="ghost" size="xs" iconOnly leadingIcon={Rows3} aria-label="Painel" title="Painel" onClick={onToggleTerminal} />
        <Button variant="ghost" size="xs" iconOnly leadingIcon={Settings2} aria-label="Personalizar layout" title="Personalizar layout" onClick={onCustomizeLayout} />
      </div>

      {headerRight && (
        <div className="hidden shrink-0 items-center gap-2 border-s border-separator-border ps-2 text-caption-2-regular text-text-secondary xl:flex">
          {headerRight}
        </div>
      )}
    </header>
  );
}
