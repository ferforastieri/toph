import { FormEvent, useState } from "react";
import { api, ApiError, type Project } from "../api";
import { useApp } from "../store";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

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
      const project = await api.createProject(name, root, "#A8C66C");
      onCreated(project);
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 403
          ? "That path is outside the allowed workspace folders."
          : err instanceof Error
            ? err.message
            : "Could not create project.";
      setError(message);
      notify("error", message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New project"
      onClose={onClose}
      footer={
        <>
          <Button type="button" className="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="new-project-form" className="primary" disabled={busy}>
            {busy ? "Creating..." : "Create project"}
          </Button>
        </>
      }
    >
      <form id="new-project-form" className="modal-form" onSubmit={submit}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
        </label>
        <label>
          Server path
          <input
            value={root}
            onChange={(event) => setRoot(event.target.value)}
            placeholder="/srv/repos/my-project"
            required
          />
        </label>
        <p className="muted small">
          The path must exist and be inside one of the folders allowed in Settings → Workspace.
        </p>
        {error && <div className="form-error">{error}</div>}
      </form>
    </Modal>
  );
}
