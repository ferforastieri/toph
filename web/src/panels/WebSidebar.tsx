import { useEffect, useState } from "react";
import { ExternalLink, Globe2, Plus, Trash2 } from "lucide-react";
import { api, type WebTarget } from "../api";
import { useApp } from "../store";
import { Button } from "../ui/Button";
import { useConfirm } from "../ui/Confirm";

interface Props {
  onOpenWeb: (target: WebTarget) => void;
}

export default function WebSidebar({ onOpenWeb }: Props) {
  const [targets, setTargets] = useState<WebTarget[]>([]);
  const [showForm, setShowForm] = useState(false);
  const notify = useApp((state) => state.notify);
  const confirm = useConfirm();

  async function load() {
    try {
      setTargets(await api.webTargets());
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not load web apps.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="panel">
      <div className="panel-heading">
        <span>Web apps</span>
        <Button className="icon-button" title="Add web app" onClick={() => setShowForm((v) => !v)}>
          <Plus size={15} />
        </Button>
      </div>

      {showForm && <WebTargetForm onCreated={() => { setShowForm(false); void load(); }} />}

      {targets.map((target) => (
        <div className="web-target" key={target.id}>
          <Button className="web-target-main" onClick={() => onOpenWeb(target)}>
            <Globe2 size={15} />
            <span>{target.name}</span>
          </Button>
          <a className="icon-button" href={target.url} target="_blank" rel="noreferrer" title="Open externally">
            <ExternalLink size={13} />
          </a>
          <Button
            className="icon-button danger"
            title="Delete"
            onClick={async () => {
              const ok = await confirm({
                title: "Delete web app?",
                message: `Delete "${target.name}" from this workspace?`,
                confirmLabel: "Delete",
                danger: true,
              });
              if (!ok) return;
              await api.deleteWebTarget(target.id);
              await load();
            }}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      ))}

      {targets.length === 0 && !showForm && (
        <div className="empty-hint">
          <Globe2 size={22} />
          <p>No web apps yet.</p>
          <Button className="ghost" onClick={() => setShowForm(true)}>
            Add web app
          </Button>
        </div>
      )}
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
      notify("error", err instanceof Error ? err.message : "Could not add web app.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="connection-form" onSubmit={submit}>
      <input placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} required />
      <input
        placeholder="https://grafana.home.arpa"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        required
      />
      <Button className="primary small" disabled={busy}>
        {busy ? "Adding..." : "Add web app"}
      </Button>
    </form>
  );
}
