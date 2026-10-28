import { useEffect, useMemo, useRef, useState } from "react";
import { FileText } from "@toph/icons";
import { api, type Project, type SearchMatch } from "../api";
import { basename } from "../lib";
import FileIcon from "../ui/FileIcon";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusToken) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  useEffect(() => {
    const text = query.trim();
    if (!text) { setFiles([]); setMatches([]); setError(""); setBusy(false); return; }
    let cancelled = false;
    setBusy(true); setError("");
    const timer = window.setTimeout(() => {
      let pending = 2; let failed = 0;
      const finish = () => { if (cancelled) return; pending -= 1; if (pending === 0) { setError(failed === 2 ? "Não foi possível buscar." : ""); setBusy(false); } };
      void api.files(project.id, text).then((items) => { if (!cancelled) setFiles(items.slice(0, MAX_FILE_RESULTS)); }).catch(() => { if (!cancelled) { setFiles([]); failed += 1; } }).finally(finish);
      void api.search(project.id, text).then((items) => { if (!cancelled) setMatches(items); }).catch(() => { if (!cancelled) { setMatches([]); failed += 1; } }).finally(finish);
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [project.id, query]);

  const results = useMemo<SearchResult[]>(() => [...files.map((path) => ({ kind: "file" as const, path })), ...matches.map((match) => ({ kind: "match" as const, match }))], [files, matches]);
  const searching = query.trim().length > 0;

  function open(result: SearchResult) {
    if (result.kind === "file") onOpenFile(result.path);
    else onOpenFile(result.match.path, result.match.line);
    setQuery("");
  }

  return (
    <Command shouldFilter={false} className="rounded-lg border bg-popover">
      <CommandInput ref={inputRef} value={query} onValueChange={setQuery} placeholder="Buscar" aria-label="Buscar arquivos ou conteúdo" />
      <CommandList>
        {busy && <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><Spinner /> Buscando...</div>}
        {error && <div className="px-3 py-2 text-xs text-destructive">{error}</div>}
        {searching && !busy && !error && results.length === 0 && <CommandEmpty>Nenhum resultado.</CommandEmpty>}
        {files.length > 0 && (
          <CommandGroup heading="Arquivos">
            {files.map((path) => (
              <CommandItem key={`file:${path}`} value={`file:${path}`} onSelect={() => open({ kind: "file", path })}>
                <FileIcon name={basename(path)} size={14} />
                <span className="truncate">{path}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {matches.length > 0 && (
          <CommandGroup heading="Conteúdo">
            {matches.map((match) => (
              <CommandItem key={`match:${match.path}:${match.line}:${match.preview}`} value={`match:${match.path}:${match.line}:${match.preview}`} onSelect={() => open({ kind: "match", match })} className="flex-col items-start gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><FileText size={12} /><span className="truncate">{match.path}</span><span>:{match.line}</span></span>
                <span className="truncate text-xs text-muted-foreground">{match.preview}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
