import { useEffect, useState } from "react";
import { ExternalLink, Globe2, Plus, Trash2 } from "@toph/icons";
import { api, type WebTarget } from "../api";
import { useApp } from "../store";
import { useConfirm } from "../ui/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props { onOpenWeb: (target: WebTarget) => void; }

export default function WebSidebar({ onOpenWeb }: Props) {
  const [targets, setTargets] = useState<WebTarget[]>([]);
  const [showForm, setShowForm] = useState(false);
  const notify = useApp((state) => state.notify);
  const confirm = useConfirm();

  async function load() {
    try { setTargets(await api.webTargets()); }
    catch (err) { notify("error", err instanceof Error ? err.message : "Could not load web apps."); }
  }
  useEffect(() => { void load(); }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-2">
        <span className="text-xs font-medium text-muted-foreground">Web apps</span>
        <Button variant="ghost" size="icon-xs" aria-label="Adicionar web app" onClick={() => setShowForm((value) => !value)}><Plus size={15} /></Button>
      </div>
      {showForm && <WebTargetForm onCreated={() => { setShowForm(false); void load(); }} />}
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {targets.map((target) => (
          <div className="group flex items-center gap-0.5 px-1" key={target.id}>
            <Button variant="ghost" size="sm" className="h-8 min-w-0 flex-1 justify-start px-1.5" onClick={() => onOpenWeb(target)}><Globe2 size={15} className="text-muted-foreground" /><span className="truncate text-xs">{target.name}</span></Button>
            <a className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent" href={target.url} target="_blank" rel="noreferrer" title="Abrir externamente"><ExternalLink size={13} /></a>
            <Button variant="ghost" size="icon-xs" aria-label="Excluir" onClick={async () => { const ok = await confirm({ title: "Excluir web app?", message: `Excluir "${target.name}" deste workspace?`, confirmLabel: "Excluir", danger: true }); if (!ok) return; await api.deleteWebTarget(target.id); await load(); }}><Trash2 size={13} /></Button>
          </div>
        ))}
        {targets.length === 0 && !showForm && <div className="flex flex-col items-center gap-2 px-4 py-10 text-center"><Globe2 size={22} className="text-muted-foreground" /><p className="text-sm text-muted-foreground">Nenhum web app ainda.</p><Button variant="outline" size="sm" onClick={() => setShowForm(true)}>Adicionar web app</Button></div>}
      </div>
    </div>
  );
}

function WebTargetForm({ onCreated }: { onCreated: () => void }) {
  const notify = useApp((state) => state.notify);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await api.createWebTarget(name, url); onCreated(); }
    catch (err) { notify("error", err instanceof Error ? err.message : "Could not add web app."); }
    finally { setBusy(false); }
  }
  return (
    <form className="flex shrink-0 flex-col gap-2 border-b p-2" onSubmit={submit}>
      <Input placeholder="Nome" value={name} onChange={(event) => setName(event.target.value)} required />
      <Input placeholder="https://grafana.home.arpa" value={url} onChange={(event) => setUrl(event.target.value)} required />
      <Button size="sm" disabled={busy}>{busy ? "Adicionando..." : "Adicionar web app"}</Button>
    </form>
  );
}
