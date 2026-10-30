import { Bot, Database, FileCode2, FileDiff, Globe2, X } from "@toph/icons";
import { useApp, type Tab } from "../store";
import { useSettings } from "../settings";
import { useConfirm } from "../ui/confirm";
import { IconButton } from "@/boardui/base/buttons/icon-button";
import FileIcon from "../ui/FileIcon";
import { cx } from "@/boardui/utils/cx";

const icons = { editor: FileCode2, db: Database, ai: Bot, web: Globe2, diff: FileDiff };

export default function Tabs() {
  const tabs = useApp((state) => state.tabs);
  const activeTabId = useApp((state) => state.activeTabId);
  const setActiveTab = useApp((state) => state.setActiveTab);
  const closeTab = useApp((state) => state.closeTab);
  const confirmClose = useSettings((state) => state.confirmClose);
  const confirm = useConfirm();

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
    closeTab(tab.id);
  }

  return (
    <div className="flex min-h-10 items-center border-b bg-background-secondary-default px-1">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role="tablist">
        {tabs.map((tab) => {
          const Icon = icons[tab.kind as keyof typeof icons] ?? icons.editor;
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setActiveTab(tab.id); }}
              onAuxClick={(event) => { if (event.button === 1) void requestClose(tab); }}
              title={tab.path ?? tab.url ?? tab.title}
              className={cx(
                "group mx-0.5 flex h-8 max-w-[240px] shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-2 text-body-2-medium",
                active
                  ? "border-border-button-default bg-background-tertiary-default text-text-primary shadow-xs"
                  : "border-transparent text-text-secondary hover:bg-background-primary-hover hover:text-text-primary",
              )}
            >
              {tab.kind === "editor" || (tab.kind === "diff" && tab.path)
                ? <FileIcon name={tab.path ?? tab.title} path={tab.path} size={14} />
                : <Icon size={14} className="shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{tab.title}</span>
              {tab.dirty && <span className="size-1.5 shrink-0 rounded-full bg-accent-500" aria-label="Modificado" />}
              <IconButton
                icon={X}
                size="small"
                aria-label={`Fechar ${tab.title}`}
                className="size-5 border-transparent bg-transparent p-0 opacity-0 shadow-none group-hover:opacity-100 [&_svg]:size-3"
                onClick={(event) => { event.stopPropagation(); void requestClose(tab); }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
