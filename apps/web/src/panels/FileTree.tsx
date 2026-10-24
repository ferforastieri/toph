import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { api, type FileEntry, type Project } from "../api";
import { useApp } from "../store";
import { useSettings } from "../settings";
import FileIcon from "../ui/FileIcon";
import { Button } from "@toph/ui";

interface Props {
  project: Project;
  onOpenFile: (path: string) => void;
}

export default function FileTree({ project, onOpenFile }: Props) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .tree(project.id, "")
      .then((items) => {
        if (!cancelled) {
          setEntries(items);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not list files.");
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, refresh]);

  return (
    <div className="tree">
      <div className="panel-heading">
        <span>Explorer</span>
        <Button className="icon-button" title="Refresh" onClick={() => setRefresh((n) => n + 1)}>
          <RefreshCw size={14} />
        </Button>
      </div>
      <div className="tree-root">{project.root}</div>
      {error && <div className="panel-error">{error}</div>}
      {entries.map((entry) => (
        <TreeNode
          key={entry.path}
          project={project}
          entry={entry}
          depth={0}
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}

function TreeNode({
  project,
  entry,
  depth,
  onOpenFile,
}: {
  project: Project;
  entry: FileEntry;
  depth: number;
  onOpenFile: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const notify = useApp((state) => state.notify);
  const iconTheme = useSettings((state) => state.iconTheme);

  async function toggle() {
    if (!entry.dir) {
      onOpenFile(entry.path);
      return;
    }
    const next = !open;
    setOpen(next);
    if (next && children === null) {
      setLoading(true);
      try {
        setChildren(await api.tree(project.id, entry.path));
      } catch (error) {
        notify("error", error instanceof Error ? error.message : "Could not open folder.");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <>
      <Button
        className={`tree-item ${entry.dir ? "is-dir" : "is-file"}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => void toggle()}
        title={entry.path}
      >
        <span className="tree-chevron">
          {entry.dir ? (
            open ? (
              <ChevronDown size={13} />
            ) : (
              <ChevronRight size={13} />
            )
          ) : null}
        </span>
        <FileIcon
          name={entry.name}
          path={entry.path}
          dir={entry.dir}
          open={open}
          iconTheme={iconTheme}
          size={15}
        />
        <span className="tree-name">{entry.name}</span>
      </Button>
      {open && loading && (
        <div className="tree-loading" style={{ paddingLeft: 24 + depth * 14 }}>
          loading...
        </div>
      )}
      {open &&
        children?.map((child) => (
          <TreeNode
            key={child.path}
            project={project}
            entry={child}
            depth={depth + 1}
            onOpenFile={onOpenFile}
          />
        ))}
    </>
  );
}
