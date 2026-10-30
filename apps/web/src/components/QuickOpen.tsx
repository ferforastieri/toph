import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "@toph/icons";
import LoadingState from "./LoadingState";
import { api, type Project, type SearchMatch } from "../api";
import { basename, dirname } from "../lib";
import FileIcon from "../ui/FileIcon";
import { SearchField } from "@/boardui/base/search-field/search-field";
import { cx } from "@/boardui/utils/cx";
import { useDebouncedValue } from "../ui/useDebouncedValue";

interface Props {
  project: Project | null;
  focusToken: number;
  onOpenFile: (path: string, line?: number) => void;
  floating?: boolean;
  /** Header trigger shows a chevron that rotates with the dropdown. */
  showChevron?: boolean;
  className?: string;
}

type Result = { kind: "file"; path: string } | { kind: "match"; match: SearchMatch };
const MAX_FILES = 30;

export default function QuickOpen({ project, focusToken, onOpenFile, floating = false, showChevron = false, className }: Props) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 220);
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
    if (!query.trim()) {
      setFiles([]);
      setMatches([]);
      setBusy(false);
    }
  }, [query]);

  useEffect(() => {
    if (!project) return;
    const text = debouncedQuery.trim();
    if (!text) { setFiles([]); setMatches([]); setBusy(false); return; }
    let cancelled = false;
    setBusy(true);
    Promise.allSettled([api.files(project.id, text), api.search(project.id, text)])
      .then(([fileResult, matchResult]) => {
        if (cancelled) return;
        setFiles(fileResult.status === "fulfilled" ? fileResult.value.slice(0, MAX_FILES) : []);
        setMatches(matchResult.status === "fulfilled" ? matchResult.value : []);
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [project, debouncedQuery]);

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

  function fileRow(path: string, index: number) {
    return (
      <button
        key={`file:${path}`}
        type="button"
        onMouseEnter={() => setActive(index)}
        onClick={() => choose({ kind: "file", path })}
        className={cx(
          "flex w-full items-center gap-2 rounded-2lg px-2 py-1.5 text-start text-caption-1-regular",
          index === active ? "bg-dropdown-item-hover-background text-text-primary" : "text-text-secondary hover:bg-dropdown-item-hover-background hover:text-text-primary",
        )}
      >
        <FileIcon name={basename(path)} path={path} size={15} />
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate text-text-primary">{basename(path)}</span>
          {dirname(path) && <span className="truncate text-caption-2-regular text-text-tertiary">{dirname(path)}</span>}
        </span>
      </button>
    );
  }

  function matchRow(match: SearchMatch, index: number) {
    return (
      <button
        key={`match:${match.path}:${match.line}:${match.preview}`}
        type="button"
        onMouseEnter={() => setActive(index)}
        onClick={() => choose({ kind: "match", match })}
        className={cx(
          "flex w-full items-start gap-2 rounded-2lg px-2 py-1.5 text-start text-caption-1-regular",
          index === active ? "bg-dropdown-item-hover-background text-text-primary" : "text-text-secondary hover:bg-dropdown-item-hover-background hover:text-text-primary",
        )}
      >
        <FileIcon name={basename(match.path)} path={match.path} size={15} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-text-primary">{basename(match.path)}</span>
            {dirname(match.path) && <span className="truncate text-caption-2-regular text-text-tertiary">{dirname(match.path)}</span>}
          </span>
          <span className="truncate text-caption-1-regular text-text-tertiary">{match.preview}</span>
        </span>
        <span className="shrink-0 text-caption-2-regular text-text-tertiary">{match.line}</span>
      </button>
    );
  }

  const resultContent = (
    <>
      {!query.trim() && (
        <div className="px-2 py-2 text-caption-1-regular text-text-tertiary">
          Busque por nome de arquivo ou por termo no conteúdo.
        </div>
      )}
      {busy && <LoadingState label="Buscando..." className="px-2 py-1" />}
      {query.trim() && (
        <div className="flex flex-col gap-1">
          <section className="flex flex-col gap-0.5">
            <div className="px-2 pb-0.5 pt-1 text-caption-2-semibold uppercase tracking-wide text-text-tertiary">
              Arquivos
            </div>
            {files.length > 0
              ? files.map((path, index) => fileRow(path, index))
              : !busy && <p className="px-2 py-1.5 text-caption-1-regular text-text-tertiary">Nenhum arquivo encontrado.</p>}
          </section>
          <section className="flex flex-col gap-0.5">
            <div className="px-2 pb-0.5 pt-1 text-caption-2-semibold uppercase tracking-wide text-text-tertiary">
              Conteúdo
            </div>
            {matches.length > 0
              ? matches.map((match, index) => matchRow(match, files.length + index))
              : !busy && <p className="px-2 py-1.5 text-caption-1-regular text-text-tertiary">Nenhum termo encontrado.</p>}
          </section>
        </div>
      )}
    </>
  );

  return (
    <div
      className={cx("relative w-full", className)}
      ref={wrapRef}
      onKeyDownCapture={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); setActive((current) => Math.min(results.length - 1, current + 1)); }
        else if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => Math.max(0, current - 1)); }
        else if (event.key === "Enter" && results[active]) { event.preventDefault(); choose(results[active]); }
        else if (event.key === "Escape") { setQuery(""); setOpen(false); inputRef.current?.blur(); }
      }}
    >
      {floating ? (
        <div className="overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default shadow-sidebar">
          <div className="border-b border-separator-border p-3">
            <SearchField
              inputRef={inputRef}
              value={query}
              onChange={setQuery}
              placeholder="Buscar por nome ou conteúdo..."
              aria-label="Busca rápida"
              shape="rounded"
              isLoading={busy}
              fieldClassName="h-10 rounded-xl bg-background-secondary-default"
            />
          </div>
          <div className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
            {resultContent}
          </div>
          <div className="flex items-center justify-between border-t border-separator-border px-3 py-2 text-caption-1-regular text-text-tertiary">
            <span>↑ ↓ navegar</span>
            <span>Enter abrir · Esc fechar</span>
          </div>
        </div>
      ) : (
        <div onFocusCapture={() => setOpen(true)} onClick={() => setOpen(true)}>
          <SearchField
            inputRef={inputRef}
            value={query}
            onChange={setQuery}
            placeholder="Buscar por nome ou conteúdo..."
            aria-label="Busca rápida"
            shape="rounded"
            size="small"
            isLoading={busy}
            fieldClassName={showChevron ? "h-[26px]" : "h-8"}
            endAddon={
              showChevron ? (
                <ChevronDown
                  aria-hidden
                  className={cx(
                    "size-4 shrink-0 text-foreground-icon-tertiary transition-[rotate,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                    open && "rotate-180",
                  )}
                />
              ) : null
            }
          />
          {open && (
            <div className="dropdown-reveal absolute inset-x-0 top-full z-[300] mt-1 max-h-80 overflow-y-auto rounded-2xl border border-border-button-default bg-background-primary-default p-1.5 shadow-dropdown">
              {resultContent}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
