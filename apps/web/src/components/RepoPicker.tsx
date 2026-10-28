import { useEffect, useState } from "react";
import { FolderGit2, Search } from "@toph/icons";
import { api, type Repository } from "../api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Abrir repositório</DialogTitle>
          <DialogDescription>Escolha um repositório Git disponível no servidor.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar repositórios..." className="ps-9" autoFocus />
        </div>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        {loading && repos.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Buscando...</p>}
        {!loading && repos.length === 0 && !error && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum repositório encontrado.</p>}
        <div className="flex max-h-[420px] flex-col gap-1 overflow-y-auto">
          {repos.map((repo) => (
            <Button key={repo.path} variant="ghost" className="h-auto justify-start px-3 py-2 text-start" disabled={Boolean(opening)} onClick={() => void open(repo)} title={repo.path}>
              <FolderGit2 size={17} className="shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{repo.name}</span>
                <span className="truncate text-xs text-muted-foreground">{repo.relative}</span>
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
