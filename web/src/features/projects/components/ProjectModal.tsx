import { useState, type FormEvent } from "react";
import { api, ApiError, type Project } from "../../../shared/api";
import { useApp } from "../../../app/store";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Input } from "@/shared/boardui/base/input/input";
import { Chip } from "@/shared/boardui/base/badges/chip";
import { Modal } from "@/shared/boardui/base/modal/modal";

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
      const project = await api.createProject(name, root, "#FFB547");
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
    <Modal
      isOpen
      onClose={onClose}
      title="Novo projeto"
      description="Abra uma pasta do servidor como projeto."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="new-project-form" disabled={busy}>{busy ? "Criando..." : "Criar projeto"}</Button>
        </>
      }
    >
      <form id="new-project-form" className="flex flex-col gap-4" onSubmit={submit}>
        <Input label="Nome" value={name} onChange={setName} isRequired autoFocus />
        <Input label="Caminho no servidor" value={root} onChange={setRoot} placeholder="/srv/repos/my-project" isRequired />
        {error && <Chip color="rose" variant="subtle" className="justify-start whitespace-normal px-2 py-1.5">{error}</Chip>}
      </form>
    </Modal>
  );
}
