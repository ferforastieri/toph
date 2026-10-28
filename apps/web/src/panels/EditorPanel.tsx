import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type GitBlameLine, type Project } from "../api";
import { languageFor } from "../lib";
import { useApp, type Tab } from "../store";
import CodeEditor from "../components/CodeEditor";
import FileIcon from "../ui/FileIcon";
import { useProjectEvents } from "../projectEvents";

interface Props {
  tab: Tab;
  project: Project;
  onOpenChanges?: (path: string) => void;
}

export default function EditorPanel({ tab, project, onOpenChanges }: Props) {
  const updateTab = useApp((state) => state.updateTab);
  const notify = useApp((state) => state.notify);
  const [blame, setBlame] = useState<GitBlameLine[]>([]);
  const [stale, setStale] = useState(false);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    setStale(false);
  }, [tab.id, tab.path, tab.hash]);

  useProjectEvents(project.id, ["files", "git"], (event) => {
    if (!tab.path) return;
    const broad = event.type === "sync" || event.type === "git";
    if (!broad && event.path !== tab.path) return;
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
    if (tab.content !== undefined || !tab.path) return;
    let cancelled = false;
    api
      .file(project.id, tab.path)
      .then((file) => {
        if (cancelled) return;
        updateTab(tab.id, { content: file.content, hash: file.hash, dirty: false });
      })
      .catch((error) => {
        if (cancelled) return;
        notify("error", error instanceof Error ? error.message : "Could not open file.");
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

  if (tab.content === undefined) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Abrindo {tab.path}...</div>;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="flex h-8 min-w-0 shrink-0 items-center gap-1.5 border-b px-2 text-[11px] text-muted-foreground">
        <span className="shrink-0">{project.name}</span><span>/</span><FileIcon name={tab.path ?? tab.title} path={tab.path} size={13} />
        <span className="truncate">{tab.path}</span>
        {tab.dirty && <span className="ms-1 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">modified</span>}
        {stale && <span className="ms-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-500">changed on disk</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <CodeEditor path={tab.path ?? tab.title} projectId={project.id} projectRoot={project.root} onOpenChanges={onOpenChanges} value={tab.content} language={languageFor(tab.path ?? tab.title)} line={tab.line} blame={blame} onChange={(content) => updateTab(tab.id, { content, dirty: true })} onCursorPosition={(line, column) => { window.dispatchEvent(new CustomEvent("toph:cursor", { detail: { line, column, language: languageFor(tab.path ?? tab.title) } })); }} onSave={() => void save()} />
      </div>
    </div>
  );
}
