import { useEffect, useMemo, useRef, useState } from "react";
import { FolderGit2 } from "@toph/icons";
import { Accordion, AccordionItem } from "@/boardui/base/accordion/accordion";
import { api, type Repository } from "../api";
import { Button } from "@/boardui/base/buttons/button";
import { SearchField } from "@/boardui/base/search-field/search-field";
import { Chip } from "@/boardui/base/badges/chip";
import { Modal } from "@/boardui/base/modal/modal";
import LoadingState from "./LoadingState";

interface Props {
  onClose: () => void;
  onOpen: (repo: Repository) => Promise<void>;
}

const CACHE_TTL_MS = 30_000;
let repositoryCache: { items: Repository[]; at: number } | null = null;

function groupRepos(repos: Repository[]): Array<[string, Repository[]]> {
  const groups = new Map<string, Repository[]>();
  for (const repo of repos) {
    const group = repo.relative.includes("/") ? repo.relative.split("/")[0] : "raiz";
    const current = groups.get(group) ?? [];
    current.push(repo);
    groups.set(group, current);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
}

export default function RepoPicker({ onClose, onOpen }: Props) {
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<Repository[]>(repositoryCache?.items ?? []);
  const [loading, setLoading] = useState(!repositoryCache);
  const [opening, setOpening] = useState("");
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = repositoryCache;
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setRepos(cached.items);
      setLoading(false);
    } else {
      setLoading(true);
    }
    api.repos()
      .then((items) => {
        if (cancelled) return;
        repositoryCache = { items, at: Date.now() };
        setRepos(items);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Não foi possível buscar repositórios.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [query]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return repos;
    return repos.filter((repo) =>
      `${repo.name} ${repo.relative} ${repo.path}`.toLowerCase().includes(needle),
    );
  }, [query, repos]);

  const groups = useMemo(() => groupRepos(filtered), [filtered]);

  const folders = useMemo(() => {
    const paths = new Set<string>();
    for (const repo of repos) {
      const parts = repo.relative.split("/").filter(Boolean);
      parts.pop();
      let current = "";
      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        paths.add(current);
      }
    }
    return [...paths].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [repos]);

  const folderSuggestions = useMemo(() => {
    const raw = query.trim().toLowerCase();
    const needle = raw.replace(/\/+$/, "");
    if (!needle) return [];
    return folders
      .filter((folder) => {
        const value = folder.toLowerCase();
        return value.includes(needle) && (value !== needle || !raw.endsWith("/"));
      })
      .slice(0, 5);
  }, [folders, query]);

  async function open(repo: Repository) {
    if (opening) return;
    setOpening(repo.path);
    try {
      await onOpen(repo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o repositório.");
      setOpening("");
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Abrir repositório"
      description="Navegue pelas pastas ou busque por nome e caminho."
      size="lg"
    >
      <div className="flex min-h-0 flex-col gap-3">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Buscar repositórios ou pastas..."
          aria-label="Buscar repositórios ou pastas"
          shape="rounded"
          isLoading={loading}
          autoFocus
        />
        {folderSuggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            <span className="text-caption-2-semibold uppercase tracking-[0.14em] text-text-tertiary">Pastas</span>
            {folderSuggestions.map((folder) => (
              <button
                key={folder}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setQuery(`${folder}/`)}
                className="rounded-md border border-border-button-default bg-background-secondary-default/50 px-2 py-0.5 text-caption-1-regular text-text-secondary hover:border-accent-500/35 hover:text-accent-400"
              >
                {folder}
              </button>
            ))}
          </div>
        )}
        {error && <Chip color="rose" variant="subtle" className="justify-start whitespace-normal px-2 py-1.5">{error}</Chip>}
        {loading && repos.length === 0 && <LoadingState label="Buscando repositórios..." className="py-2" />}
        {!loading && filtered.length === 0 && !error && (
          <p className="py-6 text-center text-body-regular text-text-secondary">
            {query.trim() ? "Nenhum repositório encontrado." : "Nenhum repositório Git encontrado no servidor."}
          </p>
        )}
        <div
          ref={listRef}
          className="no-scrollbar flex flex-col gap-3 overflow-y-auto pe-2"
          style={{ maxHeight: "clamp(220px, calc(100dvh - 260px), 420px)" }}
        >
          <Accordion
            key={groups.map(([group]) => group).join("|")}
            variant="divided"
            allowsMultipleExpanded
            defaultExpandedKeys={groups.map(([group]) => group)}
          >
            {groups.map(([group, items]) => (
              <AccordionItem
                key={group}
                id={group}
                icon={FolderGit2}
                title={
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate text-caption-2-semibold uppercase tracking-[0.14em] text-text-tertiary">{group}</span>
                    <span className="shrink-0 text-caption-1-regular font-normal tracking-normal text-text-tertiary">{items.length}</span>
                  </span>
                }
              >
                <div className="flex flex-col gap-1">
                  {items.map((repo) => (
                    <Button
                      key={repo.path}
                      variant="ghost"
                      className="group h-auto min-h-[64px] shrink-0 justify-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-start hover:border-accent-500/25 hover:bg-accent-500/[0.06]"
                      disabled={Boolean(opening)}
                      onClick={() => void open(repo)}
                      title={repo.path}
                    >
                      <span className="me-3 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default/60 text-foreground-icon-secondary">
                        <FolderGit2 size={17} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-body-medium text-text-primary">{repo.name}</span>
                        <span className="truncate text-caption-1-regular text-text-secondary">{repo.relative}</span>
                      </span>
                    </Button>
                  ))}
                </div>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </Modal>
  );
}
