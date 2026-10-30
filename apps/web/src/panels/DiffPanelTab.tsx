import { useEffect, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { api, type Project } from "../api";
import { languageFor } from "../lib";
import { useSettings } from "../settings";
import { CODE_FONT_FAMILY, codeLineHeight, monacoThemeName, registerEditorThemes } from "../editorThemes";
import { registerEditorTextMate } from "../editorTextMate";
import FileIcon from "../ui/FileIcon";
import { Breadcrumb, BreadcrumbItem } from "@/boardui/base/breadcrumb/breadcrumb";
import { Badge } from "@/boardui/base/badges/badge";
import { useApp, type Tab } from "../store";
import LoadingState from "../components/LoadingState";

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

  if (!versions) return <LoadingState label="Carregando diff..." className="flex h-full items-center justify-center py-0" />;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <Breadcrumb className="h-8 min-w-0 shrink-0 items-center border-b px-2">
        <BreadcrumbItem current className="shrink-0">{project.name}</BreadcrumbItem>
        <BreadcrumbItem current className="min-w-0">
          <span className="flex min-w-0 items-center gap-1.5">
            <FileIcon name={tab.path ?? tab.title} path={tab.path} size={13} />
            <span className="truncate">{tab.path}</span>
          </span>
        </BreadcrumbItem>
        <BreadcrumbItem><Badge color="neutral" className="text-[10px]">{tab.staged ? "staged" : "working tree"}</Badge></BreadcrumbItem>
      </Breadcrumb>
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
