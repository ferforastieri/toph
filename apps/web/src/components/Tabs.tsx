import { Bot, Database, FileCode2, FileDiff, Globe2, X } from "@toph/icons";
import { useApp, type Tab } from "../store";
import { useSettings } from "../settings";
import { useConfirm } from "../ui/confirm";
import { Button } from "@/components/ui/button";
import FileIcon from "../ui/FileIcon";
import { cn } from "@/lib/utils";

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
    <div className="flex min-h-10 items-center gap-1 overflow-x-auto border-b bg-muted/30 px-1" role="tablist">
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
            className={cn(
              "group flex h-8 max-w-[240px] shrink-0 cursor-pointer items-center gap-2 rounded-md border px-2 text-xs",
              active ? "border-border bg-background text-foreground" : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {tab.kind === "editor" || (tab.kind === "diff" && tab.path)
              ? <FileIcon name={tab.path ?? tab.title} path={tab.path} size={14} />
              : <Icon size={14} className="shrink-0" />}
            <span className="min-w-0 flex-1 truncate">{tab.title}</span>
            {tab.dirty && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Modificado" />}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Fechar ${tab.title}`}
              className="opacity-0 group-hover:opacity-100"
              onClick={(event) => { event.stopPropagation(); void requestClose(tab); }}
            >
              <X size={12} />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
