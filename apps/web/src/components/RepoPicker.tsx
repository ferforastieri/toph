import { useEffect, useState } from "react";
import { FolderGit2, Search } from "@toph/icons";
import { api, type Repository } from "../api";
import { Button } from "@toph/ui";
import { Modal } from "@toph/ui";

interface Props {
  onClose: () => void;
  onOpen: (repo: Repository) => Promise<void>;
}

export default function RepoPicker({ onClose, onOpen }: Props) {
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      api
        .repos(query)
        .then((items) => {
          if (cancelled) return;
          setRepos(items);
          setError("");
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Could not search repositories.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, query ? 180 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  async function open(repo: Repository) {
    if (opening) return;
    setOpening(repo.path);
    try {
      await onOpen(repo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open repository.");
      setOpening("");
    }
  }

  return (
    <Modal title="Open repository" onClose={onClose} width={540}>
      <div className="repo-picker">
        <label className="input-with-icon repo-search">
          <Search size={14} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search repositories..."
            aria-label="Search repositories"
          />
        </label>

        {error && <div className="form-error">{error}</div>}
        {loading && repos.length === 0 && <div className="repo-empty">Searching...</div>}
        {!loading && repos.length === 0 && !error && (
          <div className="repo-empty">No repositories found.</div>
        )}

        <div className="repo-results" role="listbox" aria-label="Repositories">
          {repos.map((repo) => (
            <Button
              key={repo.path}
              type="button"
              className={`repo-result ${opening === repo.path ? "opening" : ""}`}
              disabled={Boolean(opening)}
              onClick={() => void open(repo)}
              title={repo.path}
            >
              <FolderGit2 size={17} className="repo-result-icon" />
              <span className="repo-result-body">
                <span className="repo-result-name">{repo.name}</span>
                <span className="repo-result-path">{repo.relative}</span>
              </span>
            </Button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
