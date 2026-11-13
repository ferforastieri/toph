import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type DebugBreakpoint, type GitBlameLine, type Project } from "../../../shared/api";
import { languageFor } from "../../../shared/lib";
import { useApp, type Tab } from "../../../app/store";
import CodeEditor from "./CodeEditor";
import FileIcon from "../../explorer/components/FileIcon";
import { isImagePath } from "../image";
import ImagePreview from "./ImagePreview";
import { Breadcrumb, BreadcrumbItem } from "@toph/ui/app";
import { Badge } from "@toph/ui/app";
import { useProjectEvents } from "../../projects/events";
import { useDebug } from "../../debug/store";

interface Props {
  tab: Tab;
  project: Project;
  onOpenChanges?: (path: string) => void;
  mobile?: boolean;
  debugEnabled?: boolean;
}

const NO_BREAKPOINTS: DebugBreakpoint[] = [];

export default function EditorPanel({ tab, project, onOpenChanges, mobile = false, debugEnabled = true }: Props) {
  const updateTab = useApp((state) => state.updateTab);
  const notify = useApp((state) => state.notify);
  const [blame, setBlame] = useState<GitBlameLine[]>([]);
  const [stale, setStale] = useState(false);
  const [imageVersion, setImageVersion] = useState(0);
  const [contentError, setContentError] = useState<string | null>(null);
  const loadDebug = useDebug((state) => state.load);
  const breakpoints = useDebug((state) => state.byProject[project.id]?.breakpoints) ?? NO_BREAKPOINTS;
  const debugLocation = useDebug((state) => state.locations[project.id] ?? null);
  const toggleBreakpoint = useDebug((state) => state.toggleBreakpoint);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const image = isImagePath(tab.path);

  useEffect(() => {
    if (!debugEnabled) return;
    setStale(false);
    void loadDebug(project.id);
  }, [debugEnabled, tab.id, tab.path, tab.hash, project.id, loadDebug]);

  useProjectEvents(project.id, ["files", "git"], (event) => {
    if (!tab.path) return;
    const broad = event.type === "sync" || event.type === "git";
    if (!broad && event.path !== tab.path) return;
    if (image) {
      setImageVersion((version) => version + 1);
      return;
    }
    const current = tabRef.current;
    if (current.dirty) {
      if (!broad) setStale(true);
      return;
    }
    api
      .file(project.id, tab.path)
      .then((file) => {
        const latest = tabRef.current;
        if (latest.path !== tab.path || latest.dirty) return;
        if (latest.content !== file.content || latest.hash !== file.hash) {
          updateTab(tab.id, { content: file.content, hash: file.hash, dirty: false });
        }
        setStale(false);
      })
      .catch(() => setStale(true));
  });

  useEffect(() => {
    if (image || tab.content !== undefined || !tab.path) return;
    let cancelled = false;
    setContentError(null);
    api
      .file(project.id, tab.path)
      .then((file) => {
        if (cancelled) return;
        updateTab(tab.id, { content: file.content, hash: file.hash, dirty: false });
      })
      .catch((error) => {
        if (cancelled) return;
        const binary = error instanceof ApiError && error.status === 415;
        setContentError(binary ? "Arquivo binário: prévia não disponível." : error instanceof Error ? error.message : "Could not open file.");
        if (!binary) notify("error", error instanceof Error ? error.message : "Could not open file.");
      })
    return () => {
      cancelled = true;
    };
  }, [notify, project.id, tab.content, tab.id, tab.path, updateTab]);

  useEffect(() => {
    if (!tab.path || tab.content === undefined) {
      setBlame([]);
      return;
    }
    let cancelled = false;
    api
      .gitBlame(project.id, tab.path)
      .then((lines) => {
        if (!cancelled) setBlame(lines);
      })
      .catch(() => {
        if (!cancelled) setBlame([]);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, tab.content === undefined, tab.hash, tab.path]);

  const save = useCallback(async () => {
    if (!tab.path || tab.content === undefined) return;
    try {
      const file = await api.saveFile(project.id, tab.path, tab.content, tab.hash ?? "");
      updateTab(tab.id, { hash: file.hash, dirty: false });
      notify("success", `Saved ${tab.path}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        notify("error", "File changed on disk. Close and reopen it before saving.");
        return;
      }
      notify("error", error instanceof Error ? error.message : "Could not save file.");
    }
  }, [notify, project.id, tab.content, tab.hash, tab.id, tab.path, updateTab]);

  if (!image && tab.content === undefined && !contentError) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Abrindo {tab.path}...</div>;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      {!mobile ? (
        <Breadcrumb className="h-8 min-w-0 shrink-0 items-center border-b px-2">
          <BreadcrumbItem current className="shrink-0">{project.name}</BreadcrumbItem>
          <BreadcrumbItem current className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <FileIcon name={tab.path ?? tab.title} path={tab.path} size={13} />
              <span className="truncate">{tab.path}</span>
            </span>
          </BreadcrumbItem>
          {tab.dirty && <BreadcrumbItem><Badge color="primary" className="text-[10px]">modified</Badge></BreadcrumbItem>}
          {stale && <BreadcrumbItem><Badge color="neutral" className="text-[10px] text-status-yellow-text">changed on disk</Badge></BreadcrumbItem>}
        </Breadcrumb>
      ) : tab.dirty || stale ? (
        <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3">
          {tab.dirty ? <Badge color="primary" className="text-[10px]">modified</Badge> : null}
          {stale ? <Badge color="neutral" className="text-[10px] text-status-yellow-text">changed on disk</Badge> : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden [&_.iPadShowKeyboard]:hidden">
        {image && tab.path ? (
          <ImagePreview key={tab.path} projectId={project.id} path={tab.path} version={imageVersion} />
        ) : contentError ? (
          <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-text-tertiary">{contentError}</div>
        ) : (
          <CodeEditor path={tab.path ?? tab.title} projectId={project.id} projectRoot={project.root} onOpenChanges={onOpenChanges} value={tab.content ?? ""} language={languageFor(tab.path ?? tab.title)} line={tab.line} blame={blame} breakpoints={breakpoints.filter((item) => item.path === tab.path)} debugLine={debugLocation?.path === tab.path ? debugLocation?.line : undefined} onToggleBreakpoint={tab.path ? (line) => toggleBreakpoint(project.id, tab.path!, line) : undefined} onChange={(content) => updateTab(tab.id, { content, dirty: true })} onCursorPosition={(line, column) => { window.dispatchEvent(new CustomEvent("toph:cursor", { detail: { line, column, language: languageFor(tab.path ?? tab.title) } })); }} onSave={() => void save()} />
        )}
      </div>
    </div>
  );
}
