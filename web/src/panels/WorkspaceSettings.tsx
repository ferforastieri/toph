import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, FolderOpen, FolderPlus, HardDrive, Plus, Trash2 } from "lucide-react";
import { api } from "../api";
import { basename } from "../lib";
import { useApp } from "../store";

export default function WorkspaceSettings() {
  const projects = useApp((state) => state.projects);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const setProjects = useApp((state) => state.setProjects);
  const setActiveProject = useApp((state) => state.setActiveProject);
  const setSidebar = useApp((state) => state.setSidebar);
  const notify = useApp((state) => state.notify);
  const [roots, setRoots] = useState<string[]>([]);
  const [root, setRoot] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = projects.find((project) => project.id === activeProjectId);

  useEffect(() => {
    api
      .workspaceRoots()
      .then((response) => setRoots(response.roots))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load workspace roots."));
  }, []);

  async function addRoot(event: FormEvent) {
    event.preventDefault();
    if (!root.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await api.addWorkspaceRoot(root.trim());
      setRoots(response.roots);
      setRoot("");
      notify("success", "Workspace folder added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add folder.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRoot(value: string) {
    if (!window.confirm(`Remove ${value} from the workspace roots?`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await api.removeWorkspaceRoot(value);
      setRoots(response.roots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove folder.");
    } finally {
      setBusy(false);
    }
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    const path = projectPath.trim();
    if (!path) return;
    setBusy(true);
    setError("");
    try {
      const project = await api.createProject(
        projectName.trim() || basename(path),
        path,
        getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#A8C66C",
      );
      const next = await api.projects();
      setProjects(next);
      setActiveProject(project.id);
      setSidebar("files");
      setProjectPath("");
      setProjectName("");
      notify("success", `${project.name} is ready.`);
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("outside")
          ? "That folder is outside the allowed roots. Add it below first."
          : err instanceof Error
            ? err.message
            : "Could not create project.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-page-title"><HardDrive size={15} /> Workspace</div>
      <p className="settings-note">
        Folders are read directly from the server. On a native install this avoids bind mounts:
        add the parent folder once, then open any project inside it.
      </p>

      {current && (
        <div className="settings-callout">
          <FolderOpen size={15} />
          <div>
            <strong>{current.name}</strong>
            <code>{current.root}</code>
          </div>
        </div>
      )}

      <form className="settings-form" onSubmit={(event) => void createProject(event)}>
        <label>
          Folder path
          <input
            value={projectPath}
            onChange={(event) => setProjectPath(event.target.value)}
            placeholder="/srv/repos/my-project"
          />
        </label>
        <label>
          Project name
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder={projectPath ? basename(projectPath) : "Optional"}
          />
        </label>
        <button className="primary small" disabled={busy || !projectPath.trim()}>
          <Plus size={14} /> {busy ? "Opening..." : "Open as project"}
        </button>
      </form>

      <div className="settings-subtitle"><FolderPlus size={13} /> Allowed folders</div>
      <div className="settings-roots">
        {roots.map((value) => (
          <div className="settings-root" key={value}>
            <code>{value}</code>
            <button className="icon-button danger" title="Remove" onClick={() => void removeRoot(value)}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {roots.length === 0 && <div className="settings-empty">No allowed folders configured.</div>}
      </div>
      <form className="settings-inline-form" onSubmit={(event) => void addRoot(event)}>
        <input
          value={root}
          onChange={(event) => setRoot(event.target.value)}
          placeholder="/srv/repos"
        />
        <button className="ghost small" disabled={busy || !root.trim()}>
          <FolderPlus size={14} /> Add folder
        </button>
      </form>
      <div className="settings-warning">
        <AlertTriangle size={13} />
        <span>Only add directories you trust. The server process can read and write inside them.</span>
      </div>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
