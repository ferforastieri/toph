import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Database, FileCode2, FileDiff, Globe2, X } from "@toph/icons";
import { useApp, type Tab } from "../store";
import { chatDisplayName, chatTophs, useChats } from "../../features/conversations/store";
import TophStack from "../../features/agents/components/TophStack";
import { agentApi } from "../../features/agents/api";
import { useSettings } from "../../features/settings/store";
import { useConfirm } from "../../shared/ui/confirm";
import { IconButton } from "@/shared/boardui/base/buttons/icon-button";
import FileIcon from "../../features/explorer/components/FileIcon";
import { cx } from "@/shared/boardui/utils/cx";

const icons = { editor: FileCode2, db: Database, ai: Bot, web: Globe2, diff: FileDiff };

interface ContextMenuState {
  tab: Tab;
  x: number;
  y: number;
}

function MenuItem({ label, disabled, onSelect }: { label: string; disabled?: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full cursor-pointer items-center rounded-2lg px-2 py-1.5 text-start text-body-2-medium text-text-primary outline-none transition-colors hover:bg-dropdown-item-hover-background focus-visible:bg-dropdown-item-hover-background disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export default function Tabs() {
  const tabs = useApp((state) => state.tabs);
  const activeTabId = useApp((state) => state.activeTabId);
  const setActiveTab = useApp((state) => state.setActiveTab);
  const setTabs = useApp((state) => state.setTabs);
  const projectRoot = useApp((state) => state.projects.find((item) => item.id === state.activeProjectId)?.root ?? "");
  const confirmClose = useSettings((state) => state.confirmClose);
  const confirm = useConfirm();
  const projectChats = useChats((state) => state.byProject);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [menu]);

  async function deleteConversation(tab: Tab) {
    if (tab.kind !== "ai" || !tab.chatId) return;
    const ok = await confirm({
      title: "Apagar conversa?",
      message: "As mensagens e as sessões desta tarefa serão removidas. Os Tophs continuam no projeto.",
      confirmLabel: "Apagar conversa",
      danger: true,
    });
    if (!ok) return;
    await agentApi.deleteChat(tab.projectId, tab.chatId).catch(() => undefined);
    useChats.getState().deleteConversation(tab.projectId, tab.chatId);
    useApp.getState().closeTab(tab.id);
  }

  async function requestClose(tab: Tab) {
    if (tab.dirty && confirmClose) {
      const ok = await confirm({
        title: "Fechar aba?",
        message: `Fechar ${tab.title} sem salvar?`,
        confirmLabel: "Fechar sem salvar",
        danger: true,
      });
      if (!ok) return;
    }
    useApp.getState().closeTab(tab.id);
  }

  function closeTabs(targets: Tab[]) {
    if (targets.length === 0) return;
    const ids = new Set(targets.map((tab) => tab.id));
    const remaining = tabs.filter((tab) => !ids.has(tab.id));
    let nextActiveId = activeTabId;
    if (activeTabId && ids.has(activeTabId)) {
      const index = tabs.findIndex((tab) => tab.id === activeTabId);
      const left = tabs.slice(0, index).reverse().find((tab) => !ids.has(tab.id));
      const right = tabs.slice(index + 1).find((tab) => !ids.has(tab.id));
      nextActiveId = (left ?? right)?.id ?? null;
    }
    setTabs(remaining, nextActiveId);
  }

  async function requestCloseMany(targets: Tab[]) {
    if (targets.length === 0) return;
    const dirty = targets.filter((tab) => tab.dirty);
    if (dirty.length > 0 && confirmClose) {
      const ok = await confirm({
        title: "Fechar abas?",
        message: dirty.length === 1
          ? `Fechar ${dirty[0].title} sem salvar?`
          : `Fechar ${dirty.length} abas sem salvar?`,
        confirmLabel: "Fechar sem salvar",
        danger: true,
      });
      if (!ok) return;
    }
    closeTabs(targets);
  }

  function copy(value: string) {
    void navigator.clipboard?.writeText(value).catch(() => undefined);
  }

  function absolutePath(tab: Tab): string {
    if (!tab.path) return "";
    const root = projectRoot.replace(/\/+$/, "");
    return root ? `${root}/${tab.path}` : tab.path;
  }

  const baseLabels = tabs.map((tab) => {
    const conversation = tab.kind === "ai" && tab.chatId
      ? projectChats[tab.projectId]?.chats.find((chat) => chat.id === tab.chatId) ?? null
      : null;
    return conversation ? chatDisplayName(projectChats[tab.projectId], conversation, 2) : tab.title;
  });
  const menuIndex = menu ? tabs.findIndex((tab) => tab.id === menu.tab.id) : -1;
  const menuRightTabs = menu && menuIndex >= 0 ? tabs.slice(menuIndex + 1) : [];
  const menuOtherTabs = menu ? tabs.filter((tab) => tab.id !== menu.tab.id) : [];
  const savedTabs = tabs.filter((tab) => !tab.dirty);

  return (
    <div className="flex min-h-10 items-center border-b bg-background-secondary-default px-1">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role="tablist">
        {tabs.map((tab, index) => {
          const Icon = icons[tab.kind as keyof typeof icons] ?? icons.editor;
          const active = tab.id === activeTabId;
          const conversation = tab.kind === "ai" && tab.chatId
            ? projectChats[tab.projectId]?.chats.find((chat) => chat.id === tab.chatId) ?? null
            : null;
          const conversationTophs = conversation ? chatTophs(projectChats[tab.projectId], conversation.id) : [];
          const baseLabel = baseLabels[index] ?? tab.title;
          const occurrence = baseLabels.slice(0, index + 1).filter((value) => value === baseLabel).length;
          const label = occurrence > 1 ? `${baseLabel} · ${occurrence}` : baseLabel;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.kind === "ai" && tab.chatId) {
                  useChats.getState().setActiveChat(tab.projectId, tab.chatId);
                  useChats.getState().touchConversation(tab.projectId, tab.chatId);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  setActiveTab(tab.id);
                  if (tab.kind === "ai" && tab.chatId) {
                    useChats.getState().setActiveChat(tab.projectId, tab.chatId);
                    useChats.getState().touchConversation(tab.projectId, tab.chatId);
                  }
                }
              }}
              onAuxClick={(event) => { if (event.button === 1) void requestClose(tab); }}
              onContextMenu={(event) => {
                event.preventDefault();
                setActiveTab(tab.id);
                setMenu({
                  tab,
                  x: Math.max(8, Math.min(event.clientX, window.innerWidth - 260)),
                  y: Math.max(8, Math.min(event.clientY, window.innerHeight - 320)),
                });
              }}
              title={tab.path ?? tab.url ?? label}
              className={cx(
                "group mx-0.5 flex h-8 max-w-[240px] shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-2 text-body-2-medium",
                active
                  ? "border-border-button-default bg-background-tertiary-default text-text-primary shadow-xs"
                  : "border-transparent text-text-secondary hover:bg-background-primary-hover hover:text-text-primary",
              )}
            >
              {conversationTophs.length > 0 ? (
                <TophStack tophs={conversationTophs} size={18} ringClassName="ring-background-secondary-default" />
              ) : tab.kind === "editor" || (tab.kind === "diff" && tab.path)
                ? <FileIcon name={tab.path ?? tab.title} path={tab.path} size={14} />
                : <Icon size={14} className="shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {tab.dirty && <span className="size-1.5 shrink-0 rounded-full bg-accent-500" aria-label="Modificado" />}
              <IconButton
                icon={X}
                size="small"
                aria-label={`Fechar ${label}`}
                className="size-5 border-transparent bg-transparent p-0 opacity-0 shadow-none group-hover:opacity-100 [&_svg]:size-3"
                onClick={(event) => { event.stopPropagation(); void requestClose(tab); }}
              />
            </div>
          );
        })}
      </div>

      {menu && createPortal(
        <div className="fixed inset-0 z-100" onMouseDown={() => setMenu(null)}>
          <div
            className="bg-background-primary-default shadow-dropdown absolute max-h-[calc(100dvh-16px)] w-64 overflow-y-auto rounded-lg border p-1.5"
            style={{ left: menu.x, top: menu.y }}
            onMouseDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <MenuItem
              label="Fechar"
              onSelect={() => { setMenu(null); void requestClose(menu.tab); }}
            />
            <MenuItem
              label="Fechar outras abas"
              disabled={menuOtherTabs.length === 0}
              onSelect={() => { setMenu(null); void requestCloseMany(menuOtherTabs); }}
            />
            <MenuItem
              label="Fechar abas à direita"
              disabled={menuRightTabs.length === 0}
              onSelect={() => { setMenu(null); void requestCloseMany(menuRightTabs); }}
            />
            <MenuItem
              label="Fechar todas as abas"
              onSelect={() => { setMenu(null); void requestCloseMany(tabs); }}
            />
            {menu.tab.kind === "ai" ? (
              <div className="mt-1 border-t border-separator-border pt-1">
                <MenuItem
                  label="Apagar conversa"
                  onSelect={() => { const tab = menu.tab; setMenu(null); void deleteConversation(tab); }}
                />
              </div>
            ) : null}
            <MenuItem
              label="Fechar abas salvas"
              disabled={savedTabs.length === 0}
              onSelect={() => { setMenu(null); void requestCloseMany(savedTabs); }}
            />
            <div className="my-1 h-px bg-separator-border" />
            <MenuItem
              label="Copiar caminho"
              disabled={!menu.tab.path}
              onSelect={() => { const value = absolutePath(menu.tab); setMenu(null); if (value) copy(value); }}
            />
            <MenuItem
              label="Copiar caminho relativo"
              disabled={!menu.tab.path}
              onSelect={() => { const value = menu.tab.path; setMenu(null); if (value) copy(value); }}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
