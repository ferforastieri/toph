import { useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { api, type Project, type SearchMatch } from "../api";
import { Button } from "@toph/ui";
import FileIcon from "../ui/FileIcon";
import { basename } from "../lib";
import { useSettings } from "../settings";

interface Props {
  project: Project;
  onOpenFile: (path: string, line?: number) => void;
}

export default function SearchPanel({ project, onOpenFile }: Props) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const iconTheme = useSettings((state) => state.iconTheme);

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setMatches([]);
      setError("");
      setBusy(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setBusy(true);
      api
        .search(project.id, text)
        .then((items) => {
          if (!cancelled) {
            setMatches(items);
            setError("");
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Search failed.");
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [project.id, query]);

  function submit(event: FormEvent) {
    event.preventDefault();
  }

  return (
    <div className="panel">
      <div className="panel-heading">
        <span>Search</span>
      </div>
      <form className="search-form" onSubmit={submit}>
        <div className="input-with-icon">
          <Search size={14} />
          <input
            placeholder="Search in project"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
        </div>
      </form>
      {busy && <div className="panel-muted">Searching...</div>}
      {error && <div className="panel-error">{error}</div>}
      {!busy && !error && matches.length === 0 && query.trim() && (
        <div className="panel-muted">No matches.</div>
      )}
      <div className="search-results">
        {matches.map((match) => (
          <Button
            className="search-result"
            key={`${match.path}:${match.line}:${match.preview}`}
            onClick={() => onOpenFile(match.path, match.line)}
            title={match.preview}
          >
            <span className="search-path">
              <FileIcon name={basename(match.path)} iconTheme={iconTheme} size={12} />
              {match.path}
              <span className="search-line">:{match.line}</span>
            </span>
            <span className="search-preview">{match.preview}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
