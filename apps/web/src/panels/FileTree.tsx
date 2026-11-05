import { useEffect, useState } from "react";
import { RiArrowDownSLine } from "@remixicon/react";
import { api, type FileEntry, type Project } from "../api";
import { useApp } from "../store";
import FileIcon from "../ui/FileIcon";
import GitStatusIcon from "../ui/GitStatusIcon";
import { Badge } from "@/boardui/base/badges/badge";
import { useProjectEvents } from "../projectEvents";
import LoadingState from "../components/LoadingState";
import { cn } from "@/lib/utils";

interface Props {
  project: Project;
  onOpenFile: (path: string) => void;
  embedded?: boolean;
  statuses?: Map<string, string>;
  onSelect?: (entry: FileEntry) => void;
  onContextMenu?: (entry: FileEntry, event: React.MouseEvent) => void;
}

export default function FileTree({ project, onOpenFile, embedded = false, statuses, onSelect, onContextMenu }: Props) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useProjectEvents(project.id, ["files"], () => setRevision((current) => current + 1));

  useEffect(() => {
    let cancelled = false;
    api.tree(project.id, "")
      .then((items) => { if (!cancelled) { setEntries(items); setError(""); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not list files."); });
    return () => { cancelled = true; };
  }, [project.id, revision]);

  return (
    <div className={cn("flex flex-col gap-0.5", embedded ? "px-1 py-1" : "p-2")}>
      {!embedded && <div className="px-2 pb-1 text-caption-2-semibold uppercase tracking-wide text-text-tertiary">Explorer</div>}
      {error && <div className="rounded-lg bg-status-rose-background px-2 py-1 text-caption-1-regular text-status-rose-text">{error}</div>}
      <div
        role="tree"
        aria-label="Project files"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("text/toph-path")) event.preventDefault();
        }}
        onDrop={(event) => {
          const from = event.dataTransfer.getData("text/toph-path");
          if (!from) return;
          event.preventDefault();
          const name = from.split("/").pop() ?? "";
          if (!name) return;
          void api.movePath(project.id, from, name)
            .then(() => setRevision((value) => value + 1))
            .catch((error) => useApp.getState().notify("error", error instanceof Error ? error.message : "Não foi possível mover."));
        }}
      >
        {entries.map((entry) => (
          <TreeNode
            key={entry.path}
            project={project}
            entry={entry}
            depth={0}
            onOpenFile={onOpenFile}
            statuses={statuses}
            revision={revision}
            onSelect={(item) => { setSelectedPath(item.path); onSelect?.(item); }}
            onContextMenu={onContextMenu}
            selectedPath={selectedPath}
            onMoved={() => setRevision((value) => value + 1)}
          />
        ))}
      </div>
    </div>
  );
}

function TreeNode({ project, entry, depth, onOpenFile, statuses, revision, onSelect, onContextMenu, selectedPath, onMoved }: {
  project: Project;
  entry: FileEntry;
  depth: number;
  onOpenFile: (path: string) => void;
  statuses?: Map<string, string>;
  revision: number;
  onSelect?: (entry: FileEntry) => void;
  onContextMenu?: (entry: FileEntry, event: React.MouseEvent) => void;
  selectedPath: string | null;
  onMoved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [children, setChildren] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const notify = useApp((state) => state.notify);
  const fileStatus = !entry.dir ? statuses?.get(entry.path) : undefined;
  const changedChildren = entry.dir && statuses ? [...statuses.keys()].filter((path) => path.startsWith(`${entry.path}/`)).length : 0;

  useEffect(() => {
    if (!entry.dir || !open) return;
    let cancelled = false;
    if (!children) setLoading(true);
    api.tree(project.id, entry.path)
      .then((items) => { if (!cancelled) setChildren(items); })
      .catch((error) => { if (!cancelled) notify("error", error instanceof Error ? error.message : "Could not open folder."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [project.id, entry.dir, entry.path, open, revision, notify]);

  function toggle() {
    if (!entry.dir) { onOpenFile(entry.path); return; }
    setOpen((current) => !current);
  }

  return (
    <>
      <button
        type="button"
        role="treeitem"
        data-tree-item
        data-path={entry.path}
        data-dir={entry.dir ? "true" : "false"}
        aria-expanded={entry.dir ? open : undefined}
        aria-selected={selectedPath === entry.path}
        className={cn(
          "flex h-6 w-full min-w-0 items-center gap-1 rounded-lg px-1.5 text-start text-caption-1-regular text-text-primary outline-none transition-colors hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          selectedPath === entry.path && "bg-background-secondary-hover",
          dragOver && "bg-accent-500/10 ring-1 ring-accent-500/40",
        )}
        style={{ paddingInlineStart: 4 + depth * 12 }}
        onClick={() => { onSelect?.(entry); void toggle(); }}
        onContextMenu={(event) => onContextMenu?.(entry, event)}
        title={entry.path}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData("text/toph-path", entry.path);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(event) => {
          if (!entry.dir || !event.dataTransfer.types.includes("text/toph-path")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          if (!entry.dir) return;
          const from = event.dataTransfer.getData("text/toph-path");
          if (!from || from === entry.path) return;
          event.preventDefault();
          event.stopPropagation();
          setDragOver(false);
          const name = from.split("/").pop() ?? "";
          if (!name) return;
          const to = `${entry.path}/${name}`;
          if (to === from || entry.path.startsWith(`${from}/`)) return;
          void api.movePath(project.id, from, to)
            .then(() => onMoved?.())
            .catch((error) => notify("error", error instanceof Error ? error.message : "Não foi possível mover."));
        }}
      >
        <span className="flex size-3.5 shrink-0 items-center justify-center text-foreground-icon-tertiary">
          {entry.dir ? (
            <RiArrowDownSLine
              className={cn(
                "size-3.5 transition-[rotate,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                open && "rotate-180",
              )}
            />
          ) : null}
        </span>
        <FileIcon name={entry.name} path={entry.path} dir={entry.dir} open={open} size={14} />
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
        {fileStatus && <GitStatusIcon status={fileStatus} size={13} />}
        {changedChildren > 0 && <Badge color="neutral" className="h-3.5 px-1 text-[8px]">{changedChildren}</Badge>}
      </button>
      {entry.dir && (
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className={cn("min-h-0 overflow-hidden transition-opacity duration-300", open ? "opacity-100" : "opacity-0")}>
            {loading && <LoadingState label="Carregando..." className="py-0.5" />}
            {children?.map((child) => (
              <TreeNode key={child.path} project={project} entry={child} depth={depth + 1} onOpenFile={onOpenFile} statuses={statuses} revision={revision} onSelect={onSelect} onContextMenu={onContextMenu} selectedPath={selectedPath} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
