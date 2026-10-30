import { useEffect, useMemo, useRef, useState } from "react";
import LoadingState from "./LoadingState";
import { api, type Project, type SearchMatch } from "../api";
import { basename, dirname } from "../lib";
import FileIcon from "../ui/FileIcon";
import { SearchField } from "@/boardui/base/search-field/search-field";
import { cx } from "@/boardui/utils/cx";
import { useDebouncedValue } from "../ui/useDebouncedValue";

interface Props {
  project: Project;
  onOpenFile: (path: string, line?: number) => void;
  focusToken?: number;
}

type SearchResult = { kind: "file"; path: string } | { kind: "match"; match: SearchMatch };
const MAX_FILE_RESULTS = 30;

export default function ProjectSearch({ project, onOpenFile, focusToken = 0 }: Props) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const [files, setFiles] = useState<string[]>([]);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusToken) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  useEffect(() => {
    const text = debouncedQuery.trim();
    if (!text) { setFiles([]); setMatches([]); setError(""); setBusy(false); return; }
    let cancelled = false;
    setBusy(true); setError("");
    let pending = 2; let failed = 0;
    const finish = () => { if (cancelled) return; pending -= 1; if (pending === 0) { setError(failed === 2 ? "Não foi possível buscar." : ""); setBusy(false); } };
    void api.files(project.id, text).then((items) => { if (!cancelled) setFiles(items.slice(0, MAX_FILE_RESULTS)); }).catch(() => { if (!cancelled) { setFiles([]); failed += 1; } }).finally(finish);
    void api.search(project.id, text).then((items) => { if (!cancelled) setMatches(items); }).catch(() => { if (!cancelled) { setMatches([]); failed += 1; } }).finally(finish);
    return () => { cancelled = true; };
  }, [project.id, debouncedQuery]);

  const results = useMemo<SearchResult[]>(() => [...files.map((path) => ({ kind: "file" as const, path })), ...matches.map((match) => ({ kind: "match" as const, match }))], [files, matches]);
  const searching = query.trim().length > 0;

  useEffect(() => { setActive(0); }, [query]);

  function open(result: SearchResult) {
    if (result.kind === "file") onOpenFile(result.path);
    else onOpenFile(result.match.path, result.match.line);
    setQuery("");
  }

  return (
    <div
      className="relative"
      onKeyDownCapture={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); setActive((current) => Math.min(results.length - 1, current + 1)); }
        else if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => Math.max(0, current - 1)); }
        else if (event.key === "Enter" && results[active]) { event.preventDefault(); open(results[active]); }
        else if (event.key === "Escape") setQuery("");
      }}
    >
      <SearchField
        inputRef={inputRef}
        value={query}
        onChange={setQuery}
        placeholder="Buscar arquivos ou conteúdo"
        aria-label="Buscar arquivos ou conteúdo"
        shape="rounded"
        size="small"
        isLoading={busy}
        fieldClassName="h-8"
      />
      {searching && (
        <div className="bg-background-primary-default shadow-dropdown absolute inset-x-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border p-1">
          {busy && <LoadingState label="Buscando..." className="px-2 py-1" />}
          {error && <div className="px-2 py-1.5 text-caption-1-regular text-text-error-primary">{error}</div>}
          {!busy && !error && results.length === 0 && <div className="px-2 py-1.5 text-caption-1-regular text-text-secondary">Nenhum resultado.</div>}
          {files.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="px-2 py-1 text-caption-2-semibold uppercase tracking-wide text-text-tertiary">Arquivos</span>
              {files.map((path) => {
                const index = results.findIndex((item) => item.kind === "file" && item.path === path);
                return (
                  <button key={`file:${path}`} type="button" className={cx("flex w-full items-center gap-2 rounded-2lg px-2 py-1.5 text-start text-caption-1-regular", index === active ? "bg-dropdown-item-hover-background text-text-primary" : "text-text-secondary hover:bg-dropdown-item-hover-background hover:text-text-primary")} onMouseEnter={() => setActive(index)} onClick={() => open({ kind: "file", path })}>
                    <FileIcon name={basename(path)} path={path} size={15} />
                    <span className="flex min-w-0 flex-1 items-baseline gap-2">
                      <span className="truncate text-text-primary">{basename(path)}</span>
                      {dirname(path) && <span className="truncate text-caption-2-regular text-text-tertiary">{dirname(path)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {matches.length > 0 && (
            <div className="mt-1 flex flex-col gap-0.5">
              <span className="px-2 py-1 text-caption-2-semibold uppercase tracking-wide text-text-tertiary">Conteúdo</span>
              {matches.map((match) => {
                const index = results.findIndex((item) => item.kind === "match" && item.match === match);
                return (
                  <button key={`match:${match.path}:${match.line}:${match.preview}`} type="button" className={cx("flex w-full flex-col gap-0.5 rounded-2lg px-2 py-1.5 text-start", index === active ? "bg-dropdown-item-hover-background text-text-primary" : "text-text-secondary hover:bg-dropdown-item-hover-background hover:text-text-primary")} onMouseEnter={() => setActive(index)} onClick={() => open({ kind: "match", match })}>
                    <span className="flex min-w-0 items-center gap-1.5 text-caption-1-medium">
                      <FileIcon name={basename(match.path)} path={match.path} size={14} />
                      <span className="truncate">{match.path}</span>
                      <span>:{match.line}</span>
                    </span>
                    <span className="truncate text-caption-1-regular text-text-secondary">{match.preview}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
