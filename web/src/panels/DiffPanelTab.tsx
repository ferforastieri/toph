import { useEffect, useState } from "react";
import { api, type Project } from "../api";
import { useApp, type Tab } from "../store";
import CodeEditor from "../components/CodeEditor";

export default function DiffPanelTab({ tab, project }: { tab: Tab; project: Project }) {
  const notify = useApp((state) => state.notify);
  const [diff, setDiff] = useState<string | null>(tab.content ?? null);

  useEffect(() => {
    if (!tab.path) return;
    let cancelled = false;
    api
      .gitDiff(project.id, tab.path, Boolean(tab.staged))
      .then((next) => {
        if (!cancelled) setDiff(next || "No changes.");
      })
      .catch((error) => {
        if (!cancelled) notify("error", error instanceof Error ? error.message : "Could not load diff.");
      });
    return () => {
      cancelled = true;
    };
  }, [notify, project.id, tab.path, tab.staged]);

  if (diff === null) return <div className="editor-loading">Loading diff...</div>;
  return (
    <div className="editor-panel">
      <div className="editor-breadcrumb">
        <span>{project.name}</span>
        <span className="sep">/</span>
        <span>{tab.path}</span>
        <span className="dirty-label">{tab.staged ? "staged" : "working tree"}</span>
      </div>
      <div className="editor-surface">
        <CodeEditor
          path={`diff:${tab.path}`}
          value={diff}
          language="diff"
          readOnly
          onChange={() => undefined}
        />
      </div>
    </div>
  );
}
