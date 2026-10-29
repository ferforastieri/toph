import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, LoaderCircle, Search } from "@toph/icons";
import { api, type Project, type SearchMatch } from "../api";
import { basename } from "../lib";
import FileIcon from "../ui/FileIcon";
import { Input } from "@/boardui/base/input/input";
import { cx } from "@/boardui/utils/cx";

interface Props {
  project: Project | null;
  focusToken: number;
  onOpenFile: (path: string, line?: number) => void;
  floating?: boolean;
  className?: string;
}

type Result = { kind: "file"; path: string } | { kind: "match"; match: SearchMatch };
const MAX_FILES = 30;

export default function QuickOpen({ project, focusToken, onOpenFile, floating = false, className }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusToken <= 0) return;
    setOpen(true);
    const frame = requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
    return () => cancelAnimationFrame(frame);
  }, [focusToken]);

  useEffect(() => {
    if (!project) return;
    const text = query.trim();
    if (!text) { setFiles([]); setMatches([]); setBusy(false); return; }
    let cancelled = false;
    setBusy(true);
    const timer = window.setTimeout(() => {
      Promise.allSettled([api.files(project.id, text), api.search(project.id, text)])
        .then(([fileResult, matchResult]) => {
          if (cancelled) return;
          setFiles(fileResult.status === "fulfilled" ? fileResult.value.slice(0, MAX_FILES) : []);
          setMatches(matchResult.status === "fulfilled" ? matchResult.value : []);
        })
        .finally(() => { if (!cancelled) setBusy(false); });
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [project, query]);

  const results = useMemo<Result[]>(() => [
    ...files.map((path) => ({ kind: "file" as const, path })),
    ...matches.map((match) => ({ kind: "match" as const, match })),
  ], [files, matches]);

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  function choose(result: Result) {
    if (result.kind === "file") onOpenFile(result.path);
    else onOpenFile(result.match.path, result.match.line);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  if (floating && !open) return null;

  return (
    <div className={cx("relative", floating ? "w-full" : "w-[min(360px,38vw)]", className)} ref={wrapRef} onKeyDownCapture={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); setActive((current) => Math.min(results.length - 1, current + 1)); }
        else if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => Math.max(0, current - 1)); }
        else if (event.key === "Enter" && results[active]) { event.preventDefault(); choose(results[active]); }
        else if (event.key === "Escape") { setQuery(""); setOpen(false); inputRef.current?.blur(); }
      }}>
      <Input
        ref={inputRef}
        value={query}
        onChange={setQuery}
        onFocus={() => setOpen(true)}
        placeholder={project?.name ?? "Buscar"}
        aria-label="Busca rápida"
        leadingIcon={Search}
        fieldClassName={floating ? "h-9 rounded-full bg-background-primary-default px-3 py-2 shadow-dropdown" : "h-7 rounded-full bg-background-secondary-default px-2 py-1"}
        className="text-body-2-regular"
      />
      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-2xl border border-border-button-default bg-background-primary-default p-1.5 shadow-dropdown">
          {!query.trim() && <p className="px-2 py-2 text-caption-1-regular text-text-tertiary">Digite para buscar arquivos ou conteúdo.</p>}
          {busy && <div className="flex items-center gap-2 px-2 py-1.5 text-caption-1-regular text-text-secondary"><LoaderCircle size={13} className="animate-spin" /> Buscando...</div>}
          {!busy && query.trim() && results.length === 0 && <p className="px-2 py-1.5 text-caption-1-regular text-text-secondary">Nenhum resultado.</p>}
          {results.map((result, index) => {
            const path = result.kind === "file" ? result.path : result.match.path;
            return (
              <button
                key={`${result.kind}:${path}:${result.kind === "match" ? result.match.line : ""}`}
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(result)}
                className={cx(
                  "flex w-full items-start gap-2 rounded-2lg px-2 py-1.5 text-start text-caption-1-regular",
                  index === active ? "bg-dropdown-item-hover-background text-text-primary" : "text-text-secondary hover:bg-dropdown-item-hover-background hover:text-text-primary",
                )}
              >
                {result.kind === "file" ? <FileIcon name={basename(path)} path={path} size={14} /> : <FileText size={12} className="mt-0.5 shrink-0" />}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{path}</span>
                  {result.kind === "match" && <span className="truncate text-text-tertiary">{result.match.preview}</span>}
                </span>
                {result.kind === "match" && <span className="shrink-0 text-caption-2-regular text-text-tertiary">{result.match.line}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
