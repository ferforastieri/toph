import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FolderOpen } from "@toph/icons";
import { createPortal } from "react-dom";
import type { FileEntry, GitHistoryEntry, Project, SearchMatch } from "../api";
import { api } from "../api";
import { changeStatusByPath } from "../gitStatus";
import ProjectSearch from "../components/ProjectSearch";
import { useApp } from "../store";
import { PROJECT_EVENT } from "../projectEvents";
import FileTree from "./FileTree";
import SourceControlPanel from "./SourceControlPanel";

interface Props {
  project: Project;
  onOpenFile: (path: string, line?: number) => void;
  searchFocusToken?: number;
  onOpenDiff: (path: string, staged: boolean) => void;
  onStatusChange?: (status: string) => void;
}

interface ContextTarget {
  entry: FileEntry;
  x: number;
  y: number;
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;

function joinPath(dir: string, name: string): string {
  return dir ? `${dir.replace(/\/+$/, "")}/${name}` : name;
}

function targetDirectory(entry: FileEntry | null): string {
  if (!entry) return "";
  if (entry.dir) return entry.path;
  return entry.path.split("/").slice(0, -1).join("/");
}

function parentPath(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function ExplorerPanel({
  project,
  onOpenFile,
  searchFocusToken,
  onOpenDiff,
  onStatusChange,
}: Props) {
  const notify = useApp((state) => state.notify);
  const setSidebar = useApp((state) => state.setSidebar);
  const setTerminalOpen = useApp((state) => state.setTerminalOpen);
  const setAiPanelOpen = useApp((state) => state.setAiPanelOpen);
  const [gitStatus, setGitStatus] = useState("");
  const [rootOpen, setRootOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextTarget | null>(null);
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [historyDialog, setHistoryDialog] = useState<{
    title: string;
    entries: GitHistoryEntry[] | null;
    error: string;
  } | null>(null);
  const [searchDialog, setSearchDialog] = useState<{
    title: string;
    results: SearchMatch[] | null;
    error: string;
  } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const statuses = useMemo(() => changeStatusByPath(gitStatus), [gitStatus]);
  const handleStatusChange = useCallback(
    (next: string) => {
      setGitStatus(next);
      onStatusChange?.(next);
    },
    [onStatusChange],
  );

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [contextMenu]);

  function publishFiles(path = "") {
    window.dispatchEvent(
      new CustomEvent(PROJECT_EVENT, {
        detail: { type: "files", projectId: project.id, path, at: Date.now() },
      }),
    );
  }

  function openContextMenu(entry: FileEntry, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setSelected(entry);
    setContextMenu({
      entry,
      x: Math.min(event.clientX, window.innerWidth - 250),
      y: Math.min(event.clientY, window.innerHeight - 420),
    });
  }

  async function newFile(target = selected) {
    const name = window.prompt("Nome do arquivo");
    if (!name?.trim()) return;
    try {
      const path = joinPath(targetDirectory(target), name.trim());
      await api.saveFile(project.id, path, "", "");
      publishFiles(path);
      notify("success", `Arquivo ${path} criado.`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível criar o arquivo.");
    }
  }

  async function newFolder(target = selected) {
    const name = window.prompt("Nome da pasta");
    if (!name?.trim()) return;
    try {
      const path = joinPath(targetDirectory(target), name.trim());
      await api.makeDir(project.id, path);
      publishFiles(path);
      notify("success", `Pasta ${path} criada.`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível criar a pasta.");
    }
  }

  async function uploadFiles(files: FileList | File[], target = selected) {
    const dir = targetDirectory(target);
    const list = Array.from(files);
    if (list.length === 0) return;
    try {
      for (const file of list) {
        const data = await fileToBase64(file);
        await api.uploadFile(project.id, joinPath(dir, file.name), data);
      }
      publishFiles();
      notify("success", `${list.length} arquivo${list.length === 1 ? "" : "s"} enviado${list.length === 1 ? "" : "s"}.`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha no upload.");
    }
  }

  async function pasteImage(target = selected) {
    try {
      if (!navigator.clipboard?.read) throw new Error("A área de transferência não está disponível.");
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((value) => value.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        const extension = type.split("/")[1]?.replace("jpeg", "jpg") || "png";
        files.push(new File([blob], `pasted-${Date.now()}.${extension}`, { type }));
      }
      if (files.length === 0) {
        notify("info", "Nenhuma imagem na área de transferência.");
        return;
      }
      await uploadFiles(files, target);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível colar a imagem.");
    }
  }

  async function showHistory(entry: FileEntry) {
    const path = entry.dir ? entry.path : entry.path;
    setHistoryDialog({ title: `Histórico · ${path || "raiz"}`, entries: null, error: "" });
    try {
      const entries = await api.gitHistory(project.id, path);
      setHistoryDialog((current) => current ? { ...current, entries } : current);
    } catch (error) {
      setHistoryDialog((current) => current
        ? { ...current, error: error instanceof Error ? error.message : "Falha ao ler o histórico." }
        : current);
    }
  }

  async function findInFolder(entry: FileEntry) {
    const query = window.prompt(`Buscar em ${entry.path}`);
    if (!query?.trim()) return;
    setSearchDialog({ title: `Busca em ${entry.path}`, results: null, error: "" });
    try {
      const all = await api.search(project.id, query.trim());
      const prefix = entry.dir ? `${entry.path}/` : `${parentPath(entry.path)}/`;
      const results = all.filter((item) => item.path.startsWith(prefix));
      setSearchDialog((current) => current ? { ...current, results } : current);
    } catch (error) {
      setSearchDialog((current) => current
        ? { ...current, error: error instanceof Error ? error.message : "Falha na busca." }
        : current);
    }
  }

  function absolutePath(entry: FileEntry): string {
    return `${project.root.replace(/\/+$/, "")}/${entry.path}`;
  }

  function copy(value: string) {
    void navigator.clipboard?.writeText(value).catch(() => undefined);
  }

  function download(entry: FileEntry) {
    if (entry.dir) return;
    const anchor = document.createElement("a");
    anchor.href = api.rawUrl(project.id, entry.path);
    anchor.download = entry.name;
    anchor.click();
  }

  async function addWorkspaceFolder(entry: FileEntry) {
    try {
      await api.addWorkspaceRoot(absolutePath(entry));
      notify("success", `${entry.name} adicionado aos workspaces.`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível adicionar a pasta.");
    }
  }

  async function removeWorkspaceFolder(entry: FileEntry) {
    if (!window.confirm(`Remover ${entry.name} dos workspaces?`)) return;
    try {
      await api.removeWorkspaceRoot(absolutePath(entry));
      notify("success", `${entry.name} removido dos workspaces.`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível remover a pasta.");
    }
  }

  function addFolderToChat(entry: FileEntry) {
    setAiPanelOpen(true);
    setSidebar("ai");
    window.dispatchEvent(new CustomEvent("toph:ai-context", { detail: { path: entry.path } }));
    notify("info", `Pasta ${entry.path} adicionada ao contexto da IA.`);
  }

  function menuAction(action: () => void) {
    setContextMenu(null);
    action();
  }

  const menu = contextMenu && createPortal(
    <div
      className="explorer-context-menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      role="menu"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" onClick={() => menuAction(() => void newFile(contextMenu.entry))}>New File...</button>
      <button type="button" onClick={() => menuAction(() => void newFolder(contextMenu.entry))}>New Folder...</button>
      <button type="button" disabled={contextMenu.entry.dir} onClick={() => menuAction(() => IMAGE_EXTENSIONS.test(contextMenu.entry.path) ? window.open(api.rawUrl(project.id, contextMenu.entry.path), "_blank", "noopener,noreferrer") : onOpenFile(contextMenu.entry.path))}>Open in Images Preview</button>
      <button type="button" onClick={() => menuAction(() => setTerminalOpen(true))}>Open in Integrated Terminal</button>
      <div className="explorer-context-separator" />
      <button type="button" disabled={!contextMenu.entry.dir} onClick={() => menuAction(() => void addWorkspaceFolder(contextMenu.entry))}>Add Folder to Workspace...</button>
      <button type="button" onClick={() => menuAction(() => { setSidebar("settings"); window.dispatchEvent(new CustomEvent("toph:settings-category", { detail: "workspace" })); })}>Open Folder Settings</button>
      <button type="button" disabled={!contextMenu.entry.dir} onClick={() => menuAction(() => void removeWorkspaceFolder(contextMenu.entry))}>Remove Folder from Workspace</button>
      <div className="explorer-context-separator" />
      <button type="button" disabled={!contextMenu.entry.dir} onClick={() => menuAction(() => void findInFolder(contextMenu.entry))}>Find in Folder...</button>
      <button type="button" disabled={!contextMenu.entry.dir} onClick={() => menuAction(() => void showHistory(contextMenu.entry))}>Folder History</button>
      <button type="button" disabled={!contextMenu.entry.dir} onClick={() => menuAction(() => addFolderToChat(contextMenu.entry))}>Add Folder to Chat</button>
      <div className="explorer-context-separator" />
      <button type="button" onClick={() => menuAction(() => void pasteImage(contextMenu.entry))}>Paste <kbd>Ctrl+V</kbd></button>
      <button type="button" onClick={() => menuAction(() => uploadRef.current?.click())}>Upload...</button>
      <button type="button" disabled={contextMenu.entry.dir} onClick={() => menuAction(() => download(contextMenu.entry))}>Download...</button>
      <div className="explorer-context-separator" />
      <button type="button" onClick={() => menuAction(() => copy(absolutePath(contextMenu.entry)))}>Copy Path <kbd>Shift+Alt+C</kbd></button>
      <button type="button" onClick={() => menuAction(() => copy(contextMenu.entry.path))}>Copy Relative Path</button>
    </div>,
    document.body,
  );

  const rootEntry: FileEntry = {
    name: project.name,
    path: "",
    dir: true,
    size: 0,
    modTime: "",
  };

  return (
    <div
      className="panel explorer-panel"
      tabIndex={-1}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest(".tree-item, .project-search, .explorer-changes")) return;
        event.preventDefault();
        setSelected(rootEntry);
        setContextMenu({
          entry: rootEntry,
          x: Math.min(event.clientX, window.innerWidth - 250),
          y: Math.min(event.clientY, window.innerHeight - 420),
        });
      }}
      onPaste={(event) => {
        const target = event.target as HTMLElement;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) return;
        const clipboard = event.clipboardData;
        const files = clipboard.files.length > 0
          ? clipboard.files
          : Array.from(clipboard.items)
              .map((item) => item.kind === "file" ? item.getAsFile() : null)
              .filter((file): file is File => Boolean(file));
        if (files.length > 0) {
          event.preventDefault();
          void uploadFiles(files);
        }
      }}
    >
      <input
        ref={uploadRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) void uploadFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <div className="panel-heading">
        <span>Arquivos</span>
      </div>
      <button
        type="button"
        className="explorer-project"
        title={project.root}
        aria-expanded={rootOpen}
        onClick={() => setRootOpen((current) => !current)}
      >
        {rootOpen
          ? <ChevronDown size={13} className="explorer-project-chevron" />
          : <ChevronRight size={13} className="explorer-project-chevron" />}
        <FolderOpen size={15} className="explorer-project-icon" />
        <span>{project.name}</span>
      </button>
      <div className="explorer-files">
        <ProjectSearch
          project={project}
          onOpenFile={onOpenFile}
          focusToken={searchFocusToken}
        />
        {rootOpen && (
          <FileTree
            project={project}
            onOpenFile={onOpenFile}
            embedded
            statuses={statuses}
            onSelect={setSelected}
            onContextMenu={openContextMenu}
          />
        )}
      </div>
      <div className="explorer-changes">
        <div className="explorer-changes-head">
          <span>Alterações</span>
          {statuses.size > 0 && <b>{statuses.size}</b>}
        </div>
        <SourceControlPanel
          project={project}
          embedded
          view="changes"
          onOpenDiff={onOpenDiff}
          onStatusChange={handleStatusChange}
        />
      </div>
      {menu}
      {historyDialog && createPortal(
        <div className="editor-dialog-backdrop" role="presentation" onMouseDown={() => setHistoryDialog(null)}>
          <div className="editor-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <strong>{historyDialog.title}</strong>
              <button type="button" className="icon-button" onClick={() => setHistoryDialog(null)} aria-label="Close"><span aria-hidden="true">×</span></button>
            </header>
            {!historyDialog.entries && !historyDialog.error && <div className="editor-dialog-state">Carregando histórico...</div>}
            {historyDialog.error && <div className="editor-dialog-error">{historyDialog.error}</div>}
            {historyDialog.entries?.length === 0 && <div className="editor-dialog-state">Sem commits.</div>}
            {historyDialog.entries?.map((entry) => (
              <div className="editor-history-row" key={entry.hash}>
                <code>{entry.hash.slice(0, 8)}</code>
                <span>{entry.subject}</span>
                <small>{entry.author} · {new Date(entry.date).toLocaleString()}</small>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
      {searchDialog && createPortal(
        <div className="editor-dialog-backdrop" role="presentation" onMouseDown={() => setSearchDialog(null)}>
          <div className="editor-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <strong>{searchDialog.title}</strong>
              <button type="button" className="icon-button" onClick={() => setSearchDialog(null)} aria-label="Close"><span aria-hidden="true">×</span></button>
            </header>
            {!searchDialog.results && !searchDialog.error && <div className="editor-dialog-state">Buscando...</div>}
            {searchDialog.error && <div className="editor-dialog-error">{searchDialog.error}</div>}
            {searchDialog.results?.length === 0 && <div className="editor-dialog-state">Nada encontrado.</div>}
            {searchDialog.results?.map((result) => (
              <button
                type="button"
                className="explorer-search-result"
                key={`${result.path}:${result.line}:${result.column}`}
                onClick={() => {
                  setSearchDialog(null);
                  onOpenFile(result.path, result.line);
                }}
              >
                <code>{result.path}:{result.line}</code>
                <span>{result.preview}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
