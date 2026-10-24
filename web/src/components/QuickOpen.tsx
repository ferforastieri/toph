import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { api, type Project } from "../api";
import { basename } from "../lib";
import { useSettings } from "../settings";
import FileIcon from "../ui/FileIcon";
import { Button } from "../ui/Button";

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
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
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
    if (open) {
      setQuery("");
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  function choose(path: string) {
    onOpenFile(path);
    setOpen(false);
  }

  if (!open) return null;

  return createPortal(
    <div className="quick-open-overlay" onMouseDown={() => setOpen(false)}>
      <div className="quick-open-palette" onMouseDown={(event) => event.stopPropagation()}>
        <label className="quick-open-input">
          <Search size={16} />
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
            spellCheck={false}
          />
        </label>
        {files.length > 0 && (
          <div className="quick-open-results" role="listbox" aria-label="Files">
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
          </div>
        )}
        {files.length === 0 && <div className="quick-open-empty">No files found.</div>}
      </div>
    </div>,
    document.body,
  );
}
