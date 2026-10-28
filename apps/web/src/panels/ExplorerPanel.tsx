import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FolderOpen } from "@toph/icons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from "@/components/ui/context-menu";
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

function ActionItem({ label, shortcut, disabled, onSelect }: { label: string; shortcut?: string; disabled?: boolean; onSelect: () => void }) {
  return (
    <ContextMenuItem disabled={disabled} onSelect={onSelect}>
      {label}
      {shortcut && <ContextMenuShortcut>{shortcut}</ContextMenuShortcut>}
    </ContextMenuItem>
  );
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

  function openContextMenu(entry: FileEntry, _event: React.MouseEvent) {
    setSelected(entry);
    setContextMenu({ entry, x: 0, y: 0 });
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



  const rootEntry: FileEntry = { name: project.name, path: "", dir: true, size: 0, modTime: "" };

  return (
    <>
    <ContextMenu onOpenChange={(open) => !open && setContextMenu(null)}>
      <ContextMenuTrigger asChild>
    <div
      className="flex h-full min-h-0 flex-col bg-muted/20"
      tabIndex={-1}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest("[data-tree-item], .project-search, .explorer-changes")) return;
        event.preventDefault();
        setSelected(rootEntry);
        setContextMenu({ entry: rootEntry, x: Math.min(event.clientX, window.innerWidth - 290), y: Math.min(event.clientY, window.innerHeight - 460) });
      }}
      onPaste={(event) => {
        const target = event.target as HTMLElement;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) return;
        const clipboard = event.clipboardData;
        const files = clipboard.files.length > 0 ? clipboard.files : Array.from(clipboard.items).map((item) => item.kind === "file" ? item.getAsFile() : null).filter((file): file is File => Boolean(file));
        if (files.length > 0) { event.preventDefault(); void uploadFiles(files); }
      }}
    >
      <input ref={uploadRef} type="file" multiple hidden onChange={(event) => { if (event.target.files) void uploadFiles(event.target.files); event.target.value = ""; }} />
      <div className="flex h-9 shrink-0 items-center border-b px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Arquivos</div>
      <button type="button" className="flex h-7 w-full shrink-0 items-center gap-1.5 border-b px-2.5 text-start text-xs hover:bg-accent" title={project.root} aria-expanded={rootOpen} onClick={() => setRootOpen((current) => !current)}>
        {rootOpen ? <ChevronDown size={13} className="text-muted-foreground" /> : <ChevronRight size={13} className="text-muted-foreground" />}
        <FolderOpen size={15} className="text-primary" />
        <span className="truncate">{project.name}</span>
      </button>
      <div className="shrink-0 p-2 pb-1 project-search"><ProjectSearch project={project} onOpenFile={onOpenFile} focusToken={searchFocusToken} /></div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">{rootOpen && <FileTree project={project} onOpenFile={onOpenFile} embedded statuses={statuses} onSelect={setSelected} onContextMenu={openContextMenu} />}</div>
      <div className="explorer-changes flex min-h-[120px] max-h-[46%] shrink-0 flex-col border-t">
        <div className="min-h-0 flex-1 overflow-y-auto"><SourceControlPanel project={project} embedded view="changes" onOpenDiff={onOpenDiff} onStatusChange={handleStatusChange} /></div>
      </div>
    </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        {contextMenu && (
          <>
            <ActionItem label="New File..." onSelect={() => menuAction(() => void newFile(contextMenu.entry))} />
            <ActionItem label="New Folder..." onSelect={() => menuAction(() => void newFolder(contextMenu.entry))} />
            <ActionItem label="Open in Images Preview" disabled={contextMenu.entry.dir} onSelect={() => menuAction(() => IMAGE_EXTENSIONS.test(contextMenu.entry.path) ? window.open(api.rawUrl(project.id, contextMenu.entry.path), "_blank", "noopener,noreferrer") : onOpenFile(contextMenu.entry.path))} />
            <ActionItem label="Open in Integrated Terminal" onSelect={() => menuAction(() => setTerminalOpen(true))} />
            <ContextMenuSeparator />
            <ActionItem label="Add Folder to Workspace..." disabled={!contextMenu.entry.dir} onSelect={() => menuAction(() => void addWorkspaceFolder(contextMenu.entry))} />
            <ActionItem label="Open Folder Settings" onSelect={() => menuAction(() => window.dispatchEvent(new CustomEvent("toph:open-settings", { detail: "workspace" })))} />
            <ActionItem label="Remove Folder from Workspace" disabled={!contextMenu.entry.dir} onSelect={() => menuAction(() => void removeWorkspaceFolder(contextMenu.entry))} />
            <ContextMenuSeparator />
            <ActionItem label="Find in Folder..." disabled={!contextMenu.entry.dir} onSelect={() => menuAction(() => void findInFolder(contextMenu.entry))} />
            <ActionItem label="Folder History" disabled={!contextMenu.entry.dir} onSelect={() => menuAction(() => void showHistory(contextMenu.entry))} />
            <ActionItem label="Add Folder to Chat" disabled={!contextMenu.entry.dir} onSelect={() => menuAction(() => addFolderToChat(contextMenu.entry))} />
            <ContextMenuSeparator />
            <ActionItem label="Paste" shortcut="Ctrl+V" onSelect={() => menuAction(() => void pasteImage(contextMenu.entry))} />
            <ActionItem label="Upload..." onSelect={() => menuAction(() => uploadRef.current?.click())} />
            <ActionItem label="Download..." disabled={contextMenu.entry.dir} onSelect={() => menuAction(() => download(contextMenu.entry))} />
            <ContextMenuSeparator />
            <ActionItem label="Copy Path" shortcut="Shift+Alt+C" onSelect={() => menuAction(() => copy(absolutePath(contextMenu.entry)))} />
            <ActionItem label="Copy Relative Path" onSelect={() => menuAction(() => copy(contextMenu.entry.path))} />
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
      {historyDialog && (
        <Dialog open onOpenChange={(open) => !open && setHistoryDialog(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>{historyDialog.title}</DialogTitle><DialogDescription>Histórico de commits.</DialogDescription></DialogHeader>
            {!historyDialog.entries && !historyDialog.error && <p className="py-6 text-center text-sm text-muted-foreground">Carregando histórico...</p>}
            {historyDialog.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{historyDialog.error}</p>}
            {historyDialog.entries?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Sem commits.</p>}
            <div className="flex flex-col gap-1">
              {historyDialog.entries?.map((entry) => (
                <div className="flex flex-col gap-1 rounded-lg border px-3 py-2" key={entry.hash}>
                  <div className="flex items-center gap-2"><code className="rounded bg-muted px-1 text-[11px]">{entry.hash.slice(0, 8)}</code><span className="truncate text-xs font-medium">{entry.subject}</span></div>
                  <small className="text-[11px] text-muted-foreground">{entry.author} · {new Date(entry.date).toLocaleString()}</small>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {searchDialog && (
        <Dialog open onOpenChange={(open) => !open && setSearchDialog(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>{searchDialog.title}</DialogTitle><DialogDescription>Resultados da busca.</DialogDescription></DialogHeader>
            {!searchDialog.results && !searchDialog.error && <p className="py-6 text-center text-sm text-muted-foreground">Buscando...</p>}
            {searchDialog.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{searchDialog.error}</p>}
            {searchDialog.results?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nada encontrado.</p>}
            <div className="flex flex-col gap-1">
              {searchDialog.results?.map((result) => (
                <button type="button" className="flex flex-col gap-0.5 rounded-lg px-3 py-2 text-start hover:bg-accent" key={`${result.path}:${result.line}:${result.column}`} onClick={() => { setSearchDialog(null); onOpenFile(result.path, result.line); }}>
                  <code className="text-[11px] text-primary">{result.path}:{result.line}</code>
                  <span className="truncate text-xs text-muted-foreground">{result.preview}</span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
