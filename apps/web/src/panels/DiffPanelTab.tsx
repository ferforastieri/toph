import { useEffect, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { api, type Project } from "../api";
import { languageFor } from "../lib";
import { useResolvedTheme, useSettings } from "../settings";
import { CODE_FONT_FAMILY, codeLineHeight, monacoThemeName, registerEditorThemes } from "../editorThemes";
import { registerEditorSemanticTokens } from "../editorSemantic";
import FileIcon from "../ui/FileIcon";
import { useApp, type Tab } from "../store";

export default function DiffPanelTab({ tab, project }: { tab: Tab; project: Project }) {
  const notify = useApp((state) => state.notify);
  const resolved = useResolvedTheme();
  const fontSize = useSettings((state) => state.editorFontSize);
  const accent = useSettings((state) => state.accent);
  const iconTheme = useSettings((state) => state.iconTheme);
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
        <FileIcon name={tab.path ?? tab.title} path={tab.path} iconTheme={iconTheme} size={13} />
        <span>{tab.path}</span>
        <span className="dirty-label">{tab.staged ? "staged" : "working tree"}</span>
      </div>
      <div className="diff-editor-host">
        <DiffEditor
          original={versions.original}
          modified={versions.modified}
          language={languageFor(tab.path ?? tab.title)}
          theme={monacoThemeName(resolved)}
          beforeMount={(monaco) => {
            registerEditorThemes(monaco, accent);
            registerEditorSemanticTokens(monaco);
          }}
          onMount={(instance) => {
            const options = { "semanticHighlighting.enabled": true } as editor.IEditorOptions;
            instance.getOriginalEditor().updateOptions(options);
            instance.getModifiedEditor().updateOptions(options);
          }}
          options={{
            readOnly: true,
            renderSideBySide: true,
            useInlineViewWhenSpaceIsLimited: false,
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: true,
            fontFamily: CODE_FONT_FAMILY,
            fontSize,
            lineHeight: codeLineHeight(fontSize),
            lineNumbersMinChars: 3,
            glyphMargin: false,
            padding: { top: 0, bottom: 0 },
          }}
        />
      </div>
    </div>
  );
}
