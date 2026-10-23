import { FormEvent, useState } from "react";
import { Search } from "lucide-react";
import { api, type Project, type SearchMatch } from "../api";
import { useApp } from "../store";
import { Button } from "../ui/Button";

interface Props {
  project: Project;
  onOpenFile: (path: string, line?: number) => void;
}

export default function SearchPanel({ project, onOpenFile }: Props) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const notify = useApp((state) => state.notify);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      setMatches(await api.search(project.id, query));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed.";
      setError(message);
      notify("error", message);
    } finally {
      setBusy(false);
    }
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
      {!busy && !error && matches.length === 0 && query && (
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
