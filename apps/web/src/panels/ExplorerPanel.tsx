import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, FilePlus2, FolderOpen, FolderPlus, RefreshCw, Settings2 } from "@toph/icons";
import { Button } from "@/boardui/base/buttons/button";
import { createPortal } from "react-dom";
import { Modal } from "@/boardui/base/modal/modal";
import type { FileEntry, GitHistoryEntry, Project, SearchMatch } from "../api";
import { api } from "../api";
import { changeStatusByPath } from "../gitStatus";
import WorkspaceSettings from "./WorkspaceSettings";
import { useApp } from "../store";
import { PROJECT_EVENT } from "../projectEvents";
import FileTree from "./FileTree";
import FileIcon from "../ui/FileIcon";
import { basename, dirname } from "../lib";
import LoadingState from "../components/LoadingState";
import { ProgressBar } from "@/boardui/base/progress/progress";
import { Accordion, AccordionItem } from "@/boardui/base/accordion/accordion";

interface Props {
  project: Project;
  onOpenFile: (path: string, line?: number) => void;
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
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full cursor-pointer items-center gap-2 rounded-2lg px-2 py-1.5 text-start text-body-2-medium text-text-primary outline-none transition-colors hover:bg-dropdown-item-hover-background focus-visible:bg-dropdown-item-hover-background disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
      {shortcut && <span className="ms-auto text-caption-2-regular text-text-tertiary">{shortcut}</span>}
    </button>
  );
}

export default function ExplorerPanel({
  project,
  onOpenFile,
  onStatusChange,
}: Props) {
  const notify = useApp((state) => state.notify);
  const setSidebar = useApp((state) => state.setSidebar);
  const setTerminalOpen = useApp((state) => state.setTerminalOpen);
  const setAiPanelOpen = useApp((state) => state.setAiPanelOpen);
  const [gitStatus, setGitStatus] = useState("");
  const [rootOpen, setRootOpen] = useState(true);
  const [treeKey, setTreeKey] = useState(0);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextTarget | null>(null);
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [historyDialog, setHistoryDialog] = useState<{
    title: string;
    entries: GitHistoryEntry[] | null;
    error: string;
  } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ label: string; value: number; valueLabel: string } | null>(null);
  const [searchDialog, setSearchDialog] = useState<{
    title: string;
    results: SearchMatch[] | null;
    error: string;
  } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const statuses = useMemo(() => changeStatusByPath(gitStatus), [gitStatus]);
  useEffect(() => {
    let cancelled = false;
    const loadStatus = () => {
      api.gitStatus(project.id)
        .then((next) => { if (!cancelled) { setGitStatus(next); onStatusChange?.(next); } })
        .catch(() => undefined);
    };
    loadStatus();
    window.addEventListener("toph:git-changed", loadStatus);
    return () => { cancelled = true; window.removeEventListener("toph:git-changed", loadStatus); };
  }, [onStatusChange, project.id]);

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
    setSelected(entry);
    setContextMenu({ entry, x: Math.min(event.clientX, window.innerWidth - 290), y: Math.min(event.clientY, window.innerHeight - 460) });
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
      setUploadProgress({ label: "Enviando arquivos...", value: 0, valueLabel: `0 de ${list.length}` });
      for (const [index, file] of list.entries()) {
        setUploadProgress({ label: `Enviando ${file.name}`, value: Math.round((index / list.length) * 100), valueLabel: `${index} de ${list.length}` });
        const data = await fileToBase64(file);
        await api.uploadFile(project.id, joinPath(dir, file.name), data);
        setUploadProgress({ label: "Enviando arquivos...", value: Math.round(((index + 1) / list.length) * 100), valueLabel: `${index + 1} de ${list.length}` });
      }
      publishFiles();
      notify("success", `${list.length} arquivo${list.length === 1 ? "" : "s"} enviado${list.length === 1 ? "" : "s"}.`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha no upload.");
    } finally {
      setUploadProgress(null);
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

  useEffect(() => {
    const handler = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (action === "new-file") void newFile(selected);
      else if (action === "new-folder") void newFolder(selected);
      else if (action === "workspace-settings") setWorkspaceSettingsOpen(true);
    };
    window.addEventListener("toph:explorer-action", handler);
    return () => window.removeEventListener("toph:explorer-action", handler);
  }, [selected]);

  return (
    <>
    <div
      className="relative flex h-full min-h-0 flex-col"
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
      <div className="flex shrink-0 flex-col items-stretch gap-2 border-b px-2 py-2 min-[901px]:h-9 min-[901px]:flex-row min-[901px]:items-center min-[901px]:justify-between min-[901px]:gap-0 min-[901px]:py-0">
        <span className="text-caption-2-semibold uppercase tracking-wide text-text-secondary">Explorer</span>
        <div className="flex w-full items-center gap-1 min-[901px]:w-auto min-[901px]:gap-0.5">
          <Button variant={workspaceSettingsOpen ? "secondary" : "ghost"} size="xs" iconOnly className="max-[900px]:flex-1" leadingIcon={Settings2} aria-label="Configurações do workspace" title="Configurações do workspace" onClick={() => setWorkspaceSettingsOpen((value) => !value)} />
          <Button variant="ghost" size="xs" iconOnly className="max-[900px]:flex-1" leadingIcon={FilePlus2} aria-label="Novo arquivo" title="Novo arquivo" onClick={() => void newFile(rootEntry)} />
          <Button variant="ghost" size="xs" iconOnly className="max-[900px]:flex-1" leadingIcon={FolderPlus} aria-label="Nova pasta" title="Nova pasta" onClick={() => void newFolder(rootEntry)} />
          <Button variant="ghost" size="xs" iconOnly className="max-[900px]:flex-1" leadingIcon={RefreshCw} aria-label="Atualizar" title="Atualizar" onClick={() => { setTreeKey((value) => value + 1); notify("info", "Explorer atualizado."); }} />
          <Button variant="ghost" size="xs" iconOnly className="max-[900px]:flex-1" leadingIcon={ChevronDown} aria-label="Recolher tudo" title="Recolher tudo" onClick={() => setTreeKey((value) => value + 1)} />
        </div>
      </div>
      {uploadProgress && (
        <div className="shrink-0 border-b px-2 py-1.5">
          <ProgressBar size="sm" label={uploadProgress.label} value={uploadProgress.value} valueLabel={uploadProgress.valueLabel} />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <Accordion
          expandedKeys={rootOpen ? ["root"] : []}
          onExpandedChange={(keys) => setRootOpen(Array.from(keys).includes("root"))}
        >
          <AccordionItem
            id="root"
            title={
              <span className="flex min-w-0 items-center gap-1.5 text-caption-1-regular">
                <FolderOpen size={15} className="shrink-0 text-accent-500" />
                <span className="truncate">{project.name}</span>
              </span>
            }
            triggerClassName="h-6 gap-1.5 px-2.5 py-0 text-caption-1-regular"
            contentClassName="p-0"
          >
            <FileTree key={treeKey} project={project} onOpenFile={onOpenFile} embedded statuses={statuses} onSelect={setSelected} onContextMenu={openContextMenu} />
          </AccordionItem>
        </Accordion>
      </div>
    {workspaceSettingsOpen && (
      <div className="absolute inset-0 z-20 flex flex-col bg-background-primary-default">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
          <Button variant="ghost" size="xs" iconOnly leadingIcon={ArrowLeft} aria-label="Voltar" onClick={() => setWorkspaceSettingsOpen(false)} />
          <span className="text-body-2-medium text-text-primary">Configurações do workspace</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <WorkspaceSettings />
        </div>
      </div>
    )}
    </div>
    {contextMenu && createPortal(
      <div className="fixed inset-0 z-100" onMouseDown={() => setContextMenu(null)}>
        <div
          className="bg-background-primary-default shadow-dropdown absolute w-64 rounded-lg border p-1.5"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <ActionItem label="New File..." onSelect={() => menuAction(() => void newFile(contextMenu.entry))} />
          <ActionItem label="New Folder..." onSelect={() => menuAction(() => void newFolder(contextMenu.entry))} />
          <ActionItem label="Open in Images Preview" disabled={contextMenu.entry.dir} onSelect={() => menuAction(() => IMAGE_EXTENSIONS.test(contextMenu.entry.path) ? window.open(api.rawUrl(project.id, contextMenu.entry.path), "_blank", "noopener,noreferrer") : onOpenFile(contextMenu.entry.path))} />
          <ActionItem label="Open in Integrated Terminal" onSelect={() => menuAction(() => setTerminalOpen(true))} />
          <div className="my-1 h-px bg-separator-border" />
          <ActionItem label="Add Folder to Workspace..." disabled={!contextMenu.entry.dir} onSelect={() => menuAction(() => void addWorkspaceFolder(contextMenu.entry))} />
          <ActionItem label="Open Folder Settings" onSelect={() => menuAction(() => setWorkspaceSettingsOpen(true))} />
          <ActionItem label="Remove Folder from Workspace" disabled={!contextMenu.entry.dir} onSelect={() => menuAction(() => void removeWorkspaceFolder(contextMenu.entry))} />
          <div className="my-1 h-px bg-separator-border" />
          <ActionItem label="Find in Folder..." disabled={!contextMenu.entry.dir} onSelect={() => menuAction(() => void findInFolder(contextMenu.entry))} />
          <ActionItem label="Folder History" disabled={!contextMenu.entry.dir} onSelect={() => menuAction(() => void showHistory(contextMenu.entry))} />
          <ActionItem label="Add Folder to Chat" disabled={!contextMenu.entry.dir} onSelect={() => menuAction(() => addFolderToChat(contextMenu.entry))} />
          <div className="my-1 h-px bg-separator-border" />
          <ActionItem label="Paste" shortcut="Ctrl+V" onSelect={() => menuAction(() => void pasteImage(contextMenu.entry))} />
          <ActionItem label="Upload..." onSelect={() => menuAction(() => uploadRef.current?.click())} />
          <ActionItem label="Download..." disabled={contextMenu.entry.dir} onSelect={() => menuAction(() => download(contextMenu.entry))} />
          <div className="my-1 h-px bg-separator-border" />
          <ActionItem label="Copy Path" shortcut="Shift+Alt+C" onSelect={() => menuAction(() => copy(absolutePath(contextMenu.entry)))} />
          <ActionItem label="Copy Relative Path" onSelect={() => menuAction(() => copy(contextMenu.entry.path))} />
        </div>
      </div>,
      document.body,
    )}
      {historyDialog && (
        <Modal isOpen onClose={() => setHistoryDialog(null)} title={historyDialog.title} description="Histórico de commits." size="lg">
            {!historyDialog.entries && !historyDialog.error && <LoadingState label="Carregando histórico..." className="py-2" />}
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
        </Modal>
      )}
      {searchDialog && (
        <Modal isOpen onClose={() => setSearchDialog(null)} title={searchDialog.title} description="Resultados da busca." size="lg">
            {!searchDialog.results && !searchDialog.error && <p className="py-6 text-center text-sm text-muted-foreground">Buscando...</p>}
            {searchDialog.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{searchDialog.error}</p>}
            {searchDialog.results?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nada encontrado.</p>}
            <div className="flex flex-col gap-1">
              {searchDialog.results?.map((result) => (
                <button type="button" className="flex items-start gap-2 rounded-lg px-3 py-2 text-start hover:bg-accent" key={`${result.path}:${result.line}:${result.column}`} onClick={() => { setSearchDialog(null); onOpenFile(result.path, result.line); }}>
                  <FileIcon name={basename(result.path)} path={result.path} size={15} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <code className="flex min-w-0 items-baseline gap-2 text-[11px] text-primary">
                      <span className="truncate">{basename(result.path)}:{result.line}</span>
                      {dirname(result.path) && <span className="truncate text-muted-foreground">{dirname(result.path)}</span>}
                    </code>
                    <span className="truncate text-xs text-muted-foreground">{result.preview}</span>
                  </span>
                </button>
              ))}
            </div>
        </Modal>
      )}
    </>
  );
}
