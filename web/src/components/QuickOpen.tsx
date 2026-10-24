import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { api, type Project } from "../api";
import { basename } from "../lib";
import { useSettings } from "../settings";
import FileIcon from "../ui/FileIcon";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

interface Props {
  project: Project;
  onOpenFile: (path: string) => void;
}

export default function QuickOpen({ project, onOpenFile }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const iconTheme = useSettings((state) => state.iconTheme);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .files(project.id, query)
        .then((items) => {
          if (!cancelled) {
            setFiles(items);
            setIndex(0);
          }
        })
        .catch(() => {
          if (!cancelled) setFiles([]);
        });
    }, query ? 100 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, project.id, query]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  function choose(path: string) {
    onOpenFile(path);
    setOpen(false);
    setQuery("");
  }

  if (!open) return null;

  return (
    <Modal title="Go to file" onClose={() => setOpen(false)} width={620}>
      <div className="quick-open">
        <label className="input-with-icon">
          <Search size={14} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((current) => Math.min(files.length - 1, current + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((current) => Math.max(0, current - 1));
              } else if (event.key === "Enter" && files[index]) {
                event.preventDefault();
                choose(files[index]);
              }
            }}
            placeholder="Search files by name..."
            aria-label="Search files"
          />
        </label>
        <div className="quick-open-results">
          {files.map((path, i) => (
            <Button
              key={path}
              className={`quick-open-result ${i === index ? "active" : ""}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(path)}
              title={path}
            >
              <FileIcon name={basename(path)} iconTheme={iconTheme} size={14} />
              <span>{path}</span>
            </Button>
          ))}
          {files.length === 0 && <div className="repo-empty">No files found.</div>}
        </div>
      </div>
    </Modal>
  );
}
