import { useEffect, useState } from "react";
import { ExternalLink, Globe2, Plus, Trash2 } from "@toph/icons";
import { api, type WebTarget } from "../../api";
import { useApp } from "../../store";
import { useConfirm } from "../../ui/confirm";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";
import { Modal } from "@/boardui/base/modal/modal";
import LoadingState from "../../components/LoadingState";

interface Props {
  onOpenWeb: (target: WebTarget) => void;
}

export default function WebAppsScreen({ onOpenWeb }: Props) {
  const notify = useApp((state) => state.notify);
  const confirm = useConfirm();
  const [targets, setTargets] = useState<WebTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setTargets(await api.webTargets());
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível carregar os web apps.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function remove(target: WebTarget) {
    const ok = await confirm({
      title: "Excluir web app?",
      message: `Excluir "${target.name}" deste workspace?`,
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteWebTarget(target.id);
      await load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background-secondary-default">
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <Button className="h-11 w-full justify-center" leadingIcon={Plus} onClick={() => setFormOpen(true)}>
          Adicionar web app
        </Button>

        {loading ? <LoadingState label="Carregando web apps..." className="py-6" /> : null}
        {!loading && targets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-border-button-white bg-background-primary-default p-6 text-center shadow-xs">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-500">
              <Globe2 className="size-6" />
            </span>
            <strong className="text-title-3-medium text-text-primary">Nenhum web app</strong>
            <p className="text-caption-1-regular text-text-secondary">Adicione uma URL para abrir dentro do Toph.</p>
          </div>
        ) : null}

        {targets.map((target) => (
          <section key={target.id} className="overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-xs">
            <button type="button" className="flex w-full items-center gap-3 p-3 text-start" onClick={() => onOpenWeb(target)}>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-500">
                <Globe2 className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-body-2-medium text-text-primary">{target.name}</span>
                <span className="truncate text-caption-2-regular text-text-tertiary">{target.url}</span>
              </span>
            </button>
            <div className="grid grid-cols-2 gap-1 border-t border-separator-border p-2">
              <Button variant="secondary" size="small" className="w-full justify-center" leadingIcon={ExternalLink} onClick={() => window.open(target.url, "_blank", "noopener,noreferrer")}>Abrir fora</Button>
              <Button variant="ghost" size="small" className="w-full justify-center" leadingIcon={Trash2} onClick={() => void remove(target)}>Excluir</Button>
            </div>
          </section>
        ))}
      </div>

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title="Novo web app" description="Adicione uma URL ao workspace." placement="bottom" size="sm" bodyClassName="p-3" swipeToClose>
        <WebTargetForm onCreated={() => { setFormOpen(false); void load(); }} />
      </Modal>
    </div>
  );
}

function WebTargetForm({ onCreated }: { onCreated: () => void }) {
  const notify = useApp((state) => state.notify);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createWebTarget(name, url);
      onCreated();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível adicionar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Input placeholder="Nome" value={name} onChange={setName} isRequired fieldClassName="h-10" />
      <Input placeholder="https://grafana.home.arpa" value={url} onChange={setUrl} isRequired fieldClassName="h-10" />
      <Button type="submit" className="h-11 w-full justify-center" disabled={busy || !name.trim() || !url.trim()}>
        {busy ? "Adicionando..." : "Adicionar web app"}
      </Button>
    </form>
  );
}
