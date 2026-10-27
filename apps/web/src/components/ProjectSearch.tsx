import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { FileText, Search, X } from "@toph/icons";
import { api, type Project, type SearchMatch } from "../api";
import { basename } from "../lib";
import { useSettings } from "../settings";
import FileIcon from "../ui/FileIcon";
import { Button } from "@toph/ui";

interface Props {
  project: Project;
  onOpenFile: (path: string, line?: number) => void;
  focusToken?: number;
}

type SearchResult =
  | { kind: "file"; path: string }
  | { kind: "match"; match: SearchMatch };

const MAX_FILE_RESULTS = 30;

export default function ProjectSearch({ project, onOpenFile, focusToken = 0 }: Props) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const iconTheme = useSettings((state) => state.iconTheme);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!focusToken) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [focusToken]);

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setFiles([]);
      setMatches([]);
      setError("");
      setBusy(false);
      setActive(0);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError("");
    setActive(0);
    const timer = window.setTimeout(() => {
      let pending = 2;
      let failed = 0;

      const finish = () => {
        if (cancelled) return;
        pending -= 1;
        if (pending === 0) {
          setError(failed === 2 ? "Não foi possível buscar no projeto." : "");
          setBusy(false);
        }
      };

      void api
        .files(project.id, text)
        .then((items) => {
          if (cancelled) return;
          setFiles(items.slice(0, MAX_FILE_RESULTS));
        })
        .catch(() => {
          if (cancelled) return;
          setFiles([]);
          failed += 1;
        })
        .finally(finish);

      void api
        .search(project.id, text)
        .then((items) => {
          if (cancelled) return;
          setMatches(items);
        })
        .catch(() => {
          if (cancelled) return;
          setMatches([]);
          failed += 1;
        })
        .finally(finish);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [project.id, query]);

  const results = useMemo<SearchResult[]>(
    () => [
      ...files.map((path) => ({ kind: "file" as const, path })),
      ...matches.map((match) => ({ kind: "match" as const, match })),
    ],
    [files, matches],
  );

  useEffect(() => {
    if (active >= results.length) setActive(Math.max(0, results.length - 1));
  }, [active, results.length]);

  useEffect(() => {
    resultRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function submit(event: FormEvent) {
    event.preventDefault();
  }

  function open(result: SearchResult) {
    if (result.kind === "file") onOpenFile(result.path);
    else onOpenFile(result.match.path, result.match.line);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setActive((current) => Math.min(results.length - 1, current + 1));
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActive((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      open(results[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (query) setQuery("");
      else inputRef.current?.blur();
    }
  }

  const searching = query.trim().length > 0;

  return (
    <div className="project-search">
      <form className="project-search-form" onSubmit={submit}>
        <div className="input-with-icon">
          <Search size={14} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar arquivos ou conteúdo"
            aria-label="Buscar arquivos ou conteúdo no projeto"
            spellCheck={false}
            autoComplete="off"
          />
          {query ? (
            <Button
              type="button"
              className="project-search-clear"
              aria-label="Limpar busca"
              title="Limpar busca"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              <X size={13} />
            </Button>
          ) : (
            <span className="project-search-shortcut" aria-hidden="true">Ctrl P</span>
          )}
        </div>
      </form>

      {busy && <div className="project-search-state">Buscando...</div>}
      {error && <div className="panel-error">{error}</div>}
      {searching && !busy && !error && results.length === 0 && (
        <div className="project-search-state">Nenhum resultado.</div>
      )}

      {results.length > 0 && (
        <div className="project-search-results">
          {files.length > 0 && (
            <section className="project-search-group" aria-label="Arquivos">
              <div className="project-search-group-head">
                <span>Arquivos</span>
                <b>{files.length}</b>
              </div>
              {files.map((path, index) => (
                <Button
                  key={`file:${path}`}
                  ref={(node) => { resultRefs.current[index] = node; }}
                  className={`search-result project-search-result ${active === index ? "active" : ""}`}
                  title={path}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => open({ kind: "file", path })}
                >
                  <span className="search-path">
                    <FileIcon name={basename(path)} iconTheme={iconTheme} size={12} />
                    <span className="search-path-text">{path}</span>
                  </span>
                </Button>
              ))}
            </section>
          )}
          {matches.length > 0 && (
            <section className="project-search-group" aria-label="Conteúdo">
              <div className="project-search-group-head">
                <span>Conteúdo</span>
                <b>{matches.length}</b>
              </div>
              {matches.map((match, offset) => {
                const index = files.length + offset;
                return (
                  <Button
                    key={`match:${match.path}:${match.line}:${match.preview}`}
                    ref={(node) => { resultRefs.current[index] = node; }}
                    className={`search-result project-search-result ${active === index ? "active" : ""}`}
                    title={match.preview}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => open({ kind: "match", match })}
                  >
                    <span className="search-path">
                      <FileText size={12} />
                      <span className="search-path-text">{match.path}</span>
                      <span className="search-line">:{match.line}</span>
                    </span>
                    <span className="search-preview">{match.preview}</span>
                  </Button>
                );
              })}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
