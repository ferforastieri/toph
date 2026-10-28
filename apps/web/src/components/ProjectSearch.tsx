import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { FileText, Search, X } from "@toph/icons";
import { api, type Project, type SearchMatch } from "../api";
import { basename } from "../lib";
import FileIcon from "../ui/FileIcon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  project: Project;
  onOpenFile: (path: string, line?: number) => void;
  focusToken?: number;
}

type SearchResult = { kind: "file"; path: string } | { kind: "match"; match: SearchMatch };
const MAX_FILE_RESULTS = 30;

export default function ProjectSearch({ project, onOpenFile, focusToken = 0 }: Props) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!focusToken) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  useEffect(() => {
    const text = query.trim();
    if (!text) { setFiles([]); setMatches([]); setError(""); setBusy(false); setActive(0); return; }
    let cancelled = false;
    setBusy(true); setError(""); setActive(0);
    const timer = window.setTimeout(() => {
      let pending = 2; let failed = 0;
      const finish = () => {
        if (cancelled) return;
        pending -= 1;
        if (pending === 0) { setError(failed === 2 ? "Não foi possível buscar no projeto." : ""); setBusy(false); }
      };
      void api.files(project.id, text).then((items) => { if (!cancelled) setFiles(items.slice(0, MAX_FILE_RESULTS)); }).catch(() => { if (!cancelled) { setFiles([]); failed += 1; } }).finally(finish);
      void api.search(project.id, text).then((items) => { if (!cancelled) setMatches(items); }).catch(() => { if (!cancelled) { setMatches([]); failed += 1; } }).finally(finish);
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [project.id, query]);

  const results = useMemo<SearchResult[]>(() => [...files.map((path) => ({ kind: "file" as const, path })), ...matches.map((match) => ({ kind: "match" as const, match }))], [files, matches]);
  useEffect(() => { if (active >= results.length) setActive(Math.max(0, results.length - 1)); }, [active, results.length]);
  useEffect(() => { resultRefs.current[active]?.scrollIntoView({ block: "nearest" }); }, [active]);

  function submit(event: FormEvent) { event.preventDefault(); }
  function open(result: SearchResult) {
    if (result.kind === "file") onOpenFile(result.path);
    else onOpenFile(result.match.path, result.match.line);
    setQuery("");
  }
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length > 0) { event.preventDefault(); setActive((current) => Math.min(results.length - 1, current + 1)); }
    else if (event.key === "ArrowUp" && results.length > 0) { event.preventDefault(); setActive((current) => Math.max(0, current - 1)); }
    else if (event.key === "Enter" && results[active]) { event.preventDefault(); open(results[active]); }
    else if (event.key === "Escape") { event.preventDefault(); if (query) setQuery(""); else inputRef.current?.blur(); }
  }

  const searching = query.trim().length > 0;
  return (
    <div className="flex flex-col gap-1.5">
      <form className="relative" onSubmit={submit}>
        <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKeyDown} placeholder="Buscar" aria-label="Buscar arquivos ou conteúdo no projeto" className="h-9 pe-16 ps-9" autoComplete="off" />
        {query ? (
          <Button type="button" variant="ghost" size="icon-xs" className="absolute end-1 top-1/2 -translate-y-1/2" aria-label="Limpar busca" onClick={() => { setQuery(""); inputRef.current?.focus(); }}><X size={13} /></Button>
        ) : (
          <kbd className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Ctrl P</kbd>
        )}
      </form>
      {busy && <p className="px-1 text-[11px] text-muted-foreground">Buscando...</p>}
      {error && <p className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">{error}</p>}
      {searching && !busy && !error && results.length === 0 && <p className="px-1 text-[11px] text-muted-foreground">Nenhum resultado.</p>}
      {results.length > 0 && (
        <div className="flex max-h-[320px] flex-col gap-0.5 overflow-y-auto rounded-lg border bg-card p-1">
          {files.length > 0 && (
            <section aria-label="Arquivos">
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><span>Arquivos</span><span>{files.length}</span></div>
              {files.map((path, index) => (
                <button key={`file:${path}`} ref={(node) => { resultRefs.current[index] = node; }} className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-xs hover:bg-accent", active === index && "bg-accent")} title={path} onMouseEnter={() => setActive(index)} onClick={() => open({ kind: "file", path })}>
                  <FileIcon name={basename(path)} size={13} /><span className="truncate">{path}</span>
                </button>
              ))}
            </section>
          )}
          {matches.length > 0 && (
            <section aria-label="Conteúdo">
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><span>Conteúdo</span><span>{matches.length}</span></div>
              {matches.map((match, offset) => {
                const index = files.length + offset;
                return (
                  <button key={`match:${match.path}:${match.line}:${match.preview}`} ref={(node) => { resultRefs.current[index] = node; }} className={cn("flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-start hover:bg-accent", active === index && "bg-accent")} title={match.preview} onMouseEnter={() => setActive(index)} onClick={() => open({ kind: "match", match })}>
                    <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"><FileText size={12} className="shrink-0" /><span className="truncate">{match.path}</span><span className="shrink-0">:{match.line}</span></span>
                    <span className="truncate text-[11px] text-muted-foreground">{match.preview}</span>
                  </button>
                );
              })}
            </section>
          )}
        </div>
      )}
      <Badge variant="secondary" className="sr-only">{results.length} resultados</Badge>
    </div>
  );
}
