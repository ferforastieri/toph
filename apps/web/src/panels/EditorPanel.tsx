import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type GitBlameLine, type Project } from "../api";
import { languageFor } from "../lib";
import { useApp, type Tab } from "../store";
import CodeEditor from "../components/CodeEditor";
import { useProjectEvents } from "../projectEvents";

interface Props {
  tab: Tab;
  project: Project;
}

export default function EditorPanel({ tab, project }: Props) {
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

  if (tab.content === undefined) {
    return <div className="editor-loading">Opening {tab.path}...</div>;
  }

  return (
    <div className="editor-panel">
      <div className="editor-breadcrumb">
        <span>{project.name}</span>
        <span className="sep">/</span>
        <span>{tab.path}</span>
        {tab.dirty && <span className="dirty-label">modified</span>}
        {stale && <span className="dirty-label">changed on disk</span>}
      </div>
      <div className="editor-surface">
        <CodeEditor
          path={tab.path ?? tab.title}
          value={tab.content}
          language={languageFor(tab.path ?? tab.title)}
          line={tab.line}
          blame={blame}
          onChange={(content) => updateTab(tab.id, { content, dirty: true })}
          onCursorPosition={(line, column) => {
            window.dispatchEvent(
              new CustomEvent("toph:cursor", {
                detail: { line, column, language: languageFor(tab.path ?? tab.title) },
              }),
            );
          }}
          onSave={() => void save()}
        />
      </div>

    </div>
  );
}
