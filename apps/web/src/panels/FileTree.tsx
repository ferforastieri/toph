import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "@toph/icons";
import { api, type FileEntry, type Project } from "../api";
import { useApp } from "../store";
import { useSettings } from "../settings";
import FileIcon from "../ui/FileIcon";
import { Button } from "@toph/ui";
import { useProjectEvents } from "../projectEvents";

interface Props {
  project: Project;
  onOpenFile: (path: string) => void;
  embedded?: boolean;
  statuses?: Map<string, string>;
}

export default function FileTree({
  project,
  onOpenFile,
  embedded = false,
  statuses,
}: Props) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");

  useProjectEvents(project.id, ["files"], () => setRevision((current) => current + 1));

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
  }, [project.id, revision]);

  return (
    <div className={`tree ${embedded ? "explorer-tree" : ""}`}>
      {!embedded && (
        <div className="panel-heading">
          <span>Explorer</span>
        </div>
      )}
      <div className="tree-root">{project.root}</div>
      {error && <div className="panel-error">{error}</div>}
      {entries.map((entry) => (
        <TreeNode
          key={entry.path}
          project={project}
          entry={entry}
          depth={0}
          onOpenFile={onOpenFile}
          statuses={statuses}
          revision={revision}
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
  statuses,
  revision,
}: {
  project: Project;
  entry: FileEntry;
  depth: number;
  onOpenFile: (path: string) => void;
  statuses?: Map<string, string>;
  revision: number;
}) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const notify = useApp((state) => state.notify);
  const iconTheme = useSettings((state) => state.iconTheme);
  const fileStatus = !entry.dir ? statuses?.get(entry.path) : undefined;
  const changedChildren = entry.dir && statuses
    ? [...statuses.keys()].filter((path) => path.startsWith(`${entry.path}/`)).length
    : 0;

  useEffect(() => {
    if (!entry.dir || !open) return;
    let cancelled = false;
    setLoading(true);
    api
      .tree(project.id, entry.path)
      .then((items) => {
        if (!cancelled) setChildren(items);
      })
      .catch((error) => {
        if (!cancelled) {
          notify("error", error instanceof Error ? error.message : "Could not open folder.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, entry.dir, entry.path, open, revision, notify]);

  function toggle() {
    if (!entry.dir) {
      onOpenFile(entry.path);
      return;
    }
    setOpen((current) => !current);
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
        {fileStatus && <span className={`tree-git-status ${fileStatus}`}>{fileStatus}</span>}
        {changedChildren > 0 && <span className="tree-git-count">{changedChildren}</span>}
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
            statuses={statuses}
            revision={revision}
          />
        ))}
    </>
  );
}
