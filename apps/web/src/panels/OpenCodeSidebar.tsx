import { useEffect, useState } from "react";
import { Bot, Plus, Sparkles } from "lucide-react";
import type { Project } from "../api";
import { listOpenCodeSessions, type OpenCodeSessionSummary } from "../opencodeSessions";
import { useApp } from "../store";
import { Button } from "@toph/ui";

interface Props {
  project: Project;
  onNewSession: () => void;
  onOpenSession: (session: { id: string; title?: string }) => void;
}

export default function OpenCodeSidebar({ project, onNewSession, onOpenSession }: Props) {
  const tabs = useApp((state) => state.tabs);
  const setActiveTab = useApp((state) => state.setActiveTab);
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [sessions, setSessions] = useState<OpenCodeSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    listOpenCodeSessions(project.root, 50)
      .then((items) => {
        if (cancelled) return;
        setStatus("online");
        setSessions(items);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("offline");
        setError(err instanceof Error ? err.message : "OpenCode unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.root]);

  return (
    <div className="panel">
      <div className="panel-heading">
        <span>OpenCode</span>
        <Button className="icon-button" title="New session" onClick={onNewSession}>
          <Plus size={15} />
        </Button>
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
        {loading && <div className="panel-muted">Loading sessions...</div>}
        {sessions.length > 0 && <div className="ai-list-label">OpenCode history</div>}
        {sessions.map((session) => (
          <Button
            key={session.id}
            className="ai-session-item"
            onClick={() => onOpenSession(session)}
          >
            <Bot size={15} />
            <span>{session.title ?? session.id.slice(0, 8)}</span>
            <small>saved</small>
          </Button>
        ))}
        {!loading && !error && sessions.length === 0 && <div className="panel-muted">No saved sessions yet.</div>}
        {tabs.filter((tab) => tab.kind === "ai").map((tab) => (
          <Button key={tab.id} className="ai-session-item" onClick={() => setActiveTab(tab.id)}>
            <Bot size={15} />
            <span>{tab.title}</span>
            <small>{tab.sessionId ? tab.sessionId.slice(0, 6) : "new"}</small>
          </Button>
        ))}
      </div>
    </div>
  );
}
