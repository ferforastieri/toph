import { useCallback, useEffect } from "react";
import { api, ApiError, type Project } from "../api";
import { languageFor } from "../lib";
import { useApp, type Tab } from "../store";
import CodeEditor from "../components/CodeEditor";

interface Props {
  tab: Tab;
  project: Project;
}

export default function EditorPanel({ tab, project }: Props) {
  const updateTab = useApp((state) => state.updateTab);
  const notify = useApp((state) => state.notify);

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
      </div>
      <div className="editor-surface">
        <CodeEditor
          path={tab.path ?? tab.title}
          value={tab.content}
          language={languageFor(tab.path ?? tab.title)}
          line={tab.line}
          onChange={(content) => updateTab(tab.id, { content, dirty: true })}
          onSave={() => void save()}
        />
      </div>
    </div>
  );
}
