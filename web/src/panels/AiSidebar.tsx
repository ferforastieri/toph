import { useEffect, useState } from "react";
import { OpenCode } from "@opencode/client";
import { Bot, Plus, Sparkles } from "lucide-react";
import { openCodeBase, type Project } from "../api";
import { useApp } from "../store";

interface Props {
  project: Project;
  onOpenAI: () => void;
}

export default function AiSidebar({ project, onOpenAI }: Props) {
  const tabs = useApp((state) => state.tabs);
  const setActiveTab = useApp((state) => state.setActiveTab);
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const client = OpenCode.make({ baseUrl: openCodeBase });
    client.server
      .info()
      .then(() => {
        if (!cancelled) setStatus("online");
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus("offline");
          setError(err instanceof Error ? err.message : "OpenCode unavailable.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="panel">
      <div className="panel-heading">
        <span>OpenCode</span>
        <button className="icon-button" title="New session" onClick={onOpenAI}>
          <Plus size={15} />
        </button>
      </div>
      <div className={`opencode-status ${status}`}>
        <span className="status-dot" />
        {status === "checking" ? "Checking server..." : status === "online" ? "Connected" : "Offline"}
      </div>
      {error && <div className="panel-error">{error}</div>}
      <div className="ai-sidebar-copy">
        <Sparkles size={16} />
        <p>
          Sessions run on the Toph server with access to <code>{project.root}</code>.
        </p>
      </div>
      <div className="ai-session-list">
        {tabs.filter((tab) => tab.kind === "ai").map((tab) => (
          <button key={tab.id} className="ai-session-item" onClick={() => setActiveTab(tab.id)}>
            <Bot size={15} />
            <span>{tab.title}</span>
            <small>{tab.sessionId ? tab.sessionId.slice(0, 6) : "new"}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
