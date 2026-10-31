import { useEffect, useState } from "react";
import { ExternalLink, Globe2, Plus, Trash2 } from "@toph/icons";
import { api, type WebTarget } from "../api";
import { useApp } from "../store";
import { useConfirm } from "../ui/confirm";
import { Button } from "@/boardui/base/buttons/button";
import { IconLinkButton } from "@/boardui/base/buttons/icon-button";
import { Input } from "@/boardui/base/input/input";

interface Props { onOpenWeb: (target: WebTarget) => void; embedded?: boolean; }

export default function WebSidebar({ onOpenWeb, embedded = false }: Props) {
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
      {embedded ? (
        <div className="shrink-0 border-b border-separator-border p-2">
          <Button variant="secondary" size="small" leadingIcon={Plus} className="w-full justify-start" onClick={() => setShowForm((value) => !value)}>Adicionar web app</Button>
        </div>
      ) : (
        <div className="flex shrink-0 flex-col items-stretch gap-2 border-b px-2 py-2 min-[901px]:h-9 min-[901px]:flex-row min-[901px]:items-center min-[901px]:justify-between min-[901px]:gap-0 min-[901px]:py-0">
          <span className="text-caption-1-medium text-text-secondary">Web apps</span>
          <Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Adicionar web app" className="max-[900px]:h-8 max-[900px]:w-full" onClick={() => setShowForm((value) => !value)} />
        </div>
      )}
      {showForm && <WebTargetForm onCreated={() => { setShowForm(false); void load(); }} />}
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {targets.map((target) => (
          <div className="group flex items-center gap-0.5 px-1" key={target.id}>
            <Button variant="ghost" size="small" className="h-8 min-w-0 flex-1 justify-start px-1.5" onClick={() => onOpenWeb(target)}>
              <Globe2 size={15} className="text-foreground-icon-secondary" /><span className="truncate text-caption-1-regular">{target.name}</span>
            </Button>
            <IconLinkButton icon={ExternalLink} size="small" aria-label="Abrir externamente" title="Abrir externamente" href={target.url} target="_blank" rel="noreferrer" className="border-transparent bg-transparent shadow-none" />
            <Button variant="ghost" size="xs" iconOnly leadingIcon={Trash2} aria-label="Excluir" onClick={async () => { const ok = await confirm({ title: "Excluir web app?", message: `Excluir "${target.name}" deste workspace?`, confirmLabel: "Excluir", danger: true }); if (!ok) return; await api.deleteWebTarget(target.id); await load(); }} />
          </div>
        ))}
        {targets.length === 0 && !showForm && (
          <div className="bg-background-secondary-default m-1 flex flex-col items-center gap-2 rounded-lg border p-6 text-center">
            <span className="flex size-9 items-center justify-center rounded-full bg-background-tertiary-default text-foreground-icon-secondary"><Globe2 size={20} /></span>
            <strong className="text-body-medium text-text-primary">Nenhum web app</strong>
            <p className="text-caption-1-regular text-text-secondary">Adicione uma URL para abrir dentro do Toph.</p>
            <Button variant="secondary" size="small" onClick={() => setShowForm(true)}>Adicionar web app</Button>
          </div>
        )}
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
      <Input placeholder="Nome" value={name} onChange={setName} isRequired />
      <Input placeholder="https://grafana.home.arpa" value={url} onChange={setUrl} isRequired />
      <Button size="small" disabled={busy} className="w-full">{busy ? "Adicionando..." : "Adicionar web app"}</Button>
    </form>
  );
}
