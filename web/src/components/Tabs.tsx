import {
  Bot,
  Database,
  FileCode2,
  Globe2,
  X,
} from "lucide-react";
import { useApp, type Tab } from "../store";

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

  function requestClose(tab: Tab) {
    if (tab.dirty && !window.confirm(`Close ${tab.title} without saving?`)) {
      return;
    }
    closeTab(tab.id);
  }

  return (
    <div className="tab-strip" role="tablist">
      {tabs.map((tab) => {
        const Icon = icons[tab.kind];
        return (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? "active" : ""}`}
            role="tab"
            aria-selected={tab.id === activeTabId}
            onClick={() => setActiveTab(tab.id)}
            onAuxClick={(event) => {
              if (event.button === 1) requestClose(tab);
            }}
            title={tab.path ?? tab.url ?? tab.title}
          >
            <Icon size={14} className="tab-icon" />
            <span className="tab-title">{tab.title}</span>
            {tab.dirty && <span className="tab-dirty" />}
            <button
              className="tab-close"
              onClick={(event) => {
                event.stopPropagation();
                requestClose(tab);
              }}
              aria-label={`Close ${tab.title}`}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
