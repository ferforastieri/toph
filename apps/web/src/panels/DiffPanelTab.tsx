import { useEffect, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { api, type Project } from "../api";
import { languageFor } from "../lib";
import { useResolvedTheme, useSettings } from "../settings";
import { useApp, type Tab } from "../store";

export default function DiffPanelTab({ tab, project }: { tab: Tab; project: Project }) {
  const notify = useApp((state) => state.notify);
  const resolved = useResolvedTheme();
  const fontSize = useSettings((state) => state.editorFontSize);
  const [versions, setVersions] = useState<{ original: string; modified: string } | null>(null);

  useEffect(() => {
    if (!tab.path) return;
    let cancelled = false;
    setVersions(null);
    api
      .gitFileVersions(project.id, tab.path, Boolean(tab.staged))
      .then((next) => {
        if (!cancelled) setVersions(next);
      })
      .catch((error) => {
        if (!cancelled) notify("error", error instanceof Error ? error.message : "Could not load diff.");
      });
    return () => {
      cancelled = true;
    };
  }, [notify, project.id, tab.path, tab.staged]);

  if (!versions) return <div className="editor-loading">Loading diff...</div>;

  return (
    <div className="editor-panel">
      <div className="editor-breadcrumb">
        <span>{project.name}</span>
        <span className="sep">/</span>
        <span>{tab.path}</span>
        <span className="dirty-label">{tab.staged ? "staged" : "working tree"}</span>
      </div>
      <div className="diff-editor-host">
        <DiffEditor
          original={versions.original}
          modified={versions.modified}
          language={languageFor(tab.path ?? tab.title)}
          theme={resolved === "light" ? "vs" : "vs-dark"}
          options={{
            readOnly: true,
            renderSideBySide: true,
            useInlineViewWhenSpaceIsLimited: false,
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
            fontSize,
            lineHeight: Math.round(fontSize * 1.55),
            padding: { top: 10, bottom: 20 },
          }}
        />
      </div>
    </div>
  );
}
