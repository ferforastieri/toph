import { GitBranch, TerminalSquare } from "lucide-react";
import type { Project } from "../api";
import { useApp } from "../store";

interface Props {
  project: Project;
  version: string;
  gitStatus: string;
}

export default function StatusBar({ project, version, gitStatus }: Props) {
  const activeTabId = useApp((state) => state.activeTabId);
  const tabs = useApp((state) => state.tabs);
  const terminalOpen = useApp((state) => state.terminalOpen);
  const toggleTerminal = useApp((state) => state.toggleTerminal);
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const branch = gitStatus.split("\n")[0]?.replace(/^##\s*/, "").split("...")[0] ?? "";

  return (
    <footer className="status-bar">
      <div className="status-left">
        <span className="status-project" style={{ color: project.color }}>
          {project.name}
        </span>
        {branch && (
          <span className="status-item">
            <GitBranch size={12} /> {branch}
          </span>
        )}
        {activeTab && (
          <span className="status-item">
            {activeTab.path ?? activeTab.title}
            {activeTab.dirty ? " *" : ""}
          </span>
        )}
      </div>
      <div className="status-right">
        <button className={`status-item status-button ${terminalOpen ? "active" : ""}`} onClick={toggleTerminal}>
          <TerminalSquare size={12} /> Terminal
        </button>
        <span className="status-item">{project.root}</span>
        <span className="status-item">Toph {version}</span>
      </div>
    </footer>
  );
}
