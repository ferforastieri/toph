import { useEffect, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { api, type Project } from "../api";
import { languageFor } from "../lib";
import { useSettings } from "../settings";
import { CODE_FONT_FAMILY, codeLineHeight, monacoThemeName, registerEditorThemes } from "../editorThemes";
import { registerEditorTextMate } from "../editorTextMate";
import FileIcon from "../ui/FileIcon";
import { useApp, type Tab } from "../store";

export default function DiffPanelTab({ tab, project }: { tab: Tab; project: Project }) {
  const notify = useApp((state) => state.notify);
  const theme = useSettings((state) => state.theme);
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

  if (!versions) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Carregando diff...</div>;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="flex h-8 min-w-0 shrink-0 items-center gap-1.5 border-b px-2 text-[11px] text-muted-foreground">
        <span className="shrink-0">{project.name}</span><span>/</span><FileIcon name={tab.path ?? tab.title} path={tab.path} size={13} />
        <span className="truncate">{tab.path}</span>
        <span className="ms-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">{tab.staged ? "staged" : "working tree"}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <DiffEditor
          original={versions.original}
          modified={versions.modified}
          language={languageFor(tab.path ?? tab.title)}
          theme={monacoThemeName(theme)}
          beforeMount={(monaco) => {
            registerEditorThemes(monaco);
            registerEditorTextMate(monaco);
          }}
          options={{
            readOnly: true,
            renderSideBySide: true,
            useInlineViewWhenSpaceIsLimited: false,
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: true,
            fontFamily: CODE_FONT_FAMILY,
            fontSize: 14,
            lineHeight: codeLineHeight(14),
            lineNumbersMinChars: 3,
            glyphMargin: false,
            padding: { top: 0, bottom: 0 },
          }}
        />
      </div>
    </div>
  );
}
