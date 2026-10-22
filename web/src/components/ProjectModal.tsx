import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { api, ApiError, type Project } from "../api";
import { useApp } from "../store";

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
          ? "That path is outside TOPH_WORKSPACES."
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>New project</h2>
          <button className="icon-button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
          </label>
          <label>
            Server path
            <input
              value={root}
              onChange={(event) => setRoot(event.target.value)}
              placeholder="/workspaces/my-project"
              required
            />
          </label>
          <p className="muted small">
            The path must exist and be inside one of the server's allowed workspace roots.
          </p>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Creating..." : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
