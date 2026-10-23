import {
  Bot,
  Database,
  FileCode2,
  Globe2,
  X,
} from "lucide-react";
import { useApp, type Tab } from "../store";
import { useSettings } from "../settings";
import { Button } from "../ui/Button";
import { useConfirm } from "../ui/Confirm";
import FileIcon from "../ui/FileIcon";

const icons = {
  editor: FileCode2,
  db: Database,
  ai: Bot,
  web: Globe2,
};

export default function Tabs() {
  const tabs = useApp((state) => state.tabs);
  const activeTabId = useApp((state) => state.activeTabId);
  const setActiveTab = useApp((state) => state.setActiveTab);
  const closeTab = useApp((state) => state.closeTab);
  const confirmClose = useSettings((state) => state.confirmClose);
  const confirm = useConfirm();
  const iconTheme = useSettings((state) => state.iconTheme);

  async function requestClose(tab: Tab) {
    if (tab.dirty && confirmClose) {
      const ok = await confirm({
        title: "Close tab?",
        message: `Close ${tab.title} without saving?`,
        confirmLabel: "Close without saving",
        danger: true,
      });
      if (!ok) return;
    }
    closeTab(tab.id);
  }

  return (
    <div className="tab-strip" role="tablist">
      {tabs.map((tab) => {
        const Icon = icons[tab.kind as keyof typeof icons] ?? icons.editor;
        return (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? "active" : ""}`}
            role="tab"
            aria-selected={tab.id === activeTabId}
            onClick={() => setActiveTab(tab.id)}
            onAuxClick={(event) => {
              if (event.button === 1) void requestClose(tab);
            }}
            title={tab.path ?? tab.url ?? tab.title}
          >
            {tab.kind === "editor" ? (
              <FileIcon name={tab.title} path={tab.path} iconTheme={iconTheme} size={14} />
            ) : (
              <Icon size={14} className="tab-icon" />
            )}
            <span className="tab-title">{tab.title}</span>
            {tab.dirty && <span className="tab-dirty" />}
            <Button
              className="tab-close"
              onClick={(event) => {
                event.stopPropagation();
                void requestClose(tab);
              }}
              aria-label={`Close ${tab.title}`}
            >
              <X size={12} />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
