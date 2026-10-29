import { useEffect, useState } from "react";
import { FolderGit2, Search } from "@toph/icons";
import { api, type Repository } from "../api";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";
import { Chip } from "@/boardui/base/badges/chip";
import { Modal } from "@/boardui/base/modal/modal";

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
      api.repos(query)
        .then((items) => { if (!cancelled) { setRepos(items); setError(""); } })
        .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Não foi possível buscar repositórios."); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, query ? 180 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  async function open(repo: Repository) {
    if (opening) return;
    setOpening(repo.path);
    try { await onOpen(repo); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível abrir o repositório."); setOpening(""); }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Abrir repositório"
      description="Escolha um repositório Git disponível no servidor."
      size="lg"
    >
      <div className="flex flex-col gap-3">
        <Input value={query} onChange={setQuery} placeholder="Buscar repositórios..." leadingIcon={Search} autoFocus />
        {error && <Chip color="rose" variant="subtle" className="justify-start whitespace-normal px-2 py-1.5">{error}</Chip>}
        {loading && repos.length === 0 && <p className="py-6 text-center text-body-regular text-text-secondary">Buscando...</p>}
        {!loading && repos.length === 0 && !error && <p className="py-6 text-center text-body-regular text-text-secondary">Nenhum repositório encontrado.</p>}
        <div className="flex max-h-[420px] flex-col gap-1 overflow-y-auto">
          {repos.map((repo) => (
            <Button key={repo.path} variant="ghost" className="h-auto justify-start px-3 py-2 text-start" disabled={Boolean(opening)} onClick={() => void open(repo)} title={repo.path}>
              <FolderGit2 size={17} className="shrink-0 text-foreground-icon-secondary" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body-medium text-text-primary">{repo.name}</span>
                <span className="truncate text-caption-1-regular text-text-secondary">{repo.relative}</span>
              </span>
            </Button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
