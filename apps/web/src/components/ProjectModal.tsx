import { useState, type FormEvent } from "react";
import { api, ApiError, type Project } from "../api";
import { useApp } from "../store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export default function ProjectModal({ onClose, onCreated }: Props) {
  const notify = useApp((state) => state.notify);
  const [name, setName] = useState("");
  const [root, setRoot] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const project = await api.createProject(name, root, "#FF50FF");
      onCreated(project);
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 403
          ? "O caminho está fora das pastas permitidas."
          : err instanceof Error ? err.message : "Não foi possível criar o projeto.";
      setError(message);
      notify("error", message);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
          <DialogDescription>Abra uma pasta do servidor como projeto.</DialogDescription>
        </DialogHeader>
        <form id="new-project-form" className="flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-1.5 text-sm">Nome<Input value={name} onChange={(event) => setName(event.target.value)} required autoFocus /></label>
          <label className="flex flex-col gap-1.5 text-sm">Caminho no servidor<Input value={root} onChange={(event) => setRoot(event.target.value)} placeholder="/srv/repos/my-project" required /></label>
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="new-project-form" disabled={busy}>{busy ? "Criando..." : "Criar projeto"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
