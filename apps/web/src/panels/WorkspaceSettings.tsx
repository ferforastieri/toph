import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, FolderOpen, FolderPlus, HardDrive, Plus, Trash2 } from "@toph/icons";
import { api } from "../api";
import { basename } from "../lib";
import { useApp } from "../store";
import { useConfirm } from "../ui/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function WorkspaceSettings() {
  const projects = useApp((state) => state.projects);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const setProjects = useApp((state) => state.setProjects);
  const setActiveProject = useApp((state) => state.setActiveProject);
  const setSidebar = useApp((state) => state.setSidebar);
  const notify = useApp((state) => state.notify);
  const confirm = useConfirm();
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
    const ok = await confirm({
      title: "Remover pasta do workspace?",
      message: `Remover ${value} das pastas permitidas?`,
      confirmLabel: "Remover",
      danger: true,
    });
    if (!ok) return;
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
      const project = await api.createProject(projectName.trim() || basename(path), path, "#FF50FF");
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
          ? "Essa pasta está fora das raízes permitidas. Adicione-a abaixo primeiro."
          : err instanceof Error
            ? err.message
            : "Could not create project.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium"><HardDrive size={16} /> Workspace</h3>
        <p className="mt-1 text-xs text-muted-foreground">As pastas são lidas diretamente do servidor.</p>
      </div>

      {current && (
        <div className="flex items-start gap-2 rounded-xl border bg-card p-4">
          <FolderOpen size={16} className="mt-0.5 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{current.name}</p>
            <code className="text-xs text-muted-foreground">{current.root}</code>
          </div>
        </div>
      )}

      <form className="flex flex-col gap-3 rounded-xl border bg-card p-4" onSubmit={(event) => void createProject(event)}>
        <label className="flex flex-col gap-1.5 text-sm">Caminho da pasta<Input value={projectPath} onChange={(event) => setProjectPath(event.target.value)} placeholder="/srv/repos/my-project" /></label>
        <label className="flex flex-col gap-1.5 text-sm">Nome do projeto<Input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder={projectPath ? basename(projectPath) : "Opcional"} /></label>
        <Button type="submit" className="self-start" disabled={busy || !projectPath.trim()}>
          <Plus size={14} /> {busy ? "Abrindo..." : "Abrir como projeto"}
        </Button>
      </form>

      <section className="flex flex-col gap-2">
        <h4 className="flex items-center gap-2 text-sm font-medium"><FolderPlus size={14} /> Pastas permitidas</h4>
        {roots.map((value) => (
          <div key={value} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{value}</code>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => void removeRoot(value)} aria-label="Remover">
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
        {roots.length === 0 && <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">Nenhuma pasta configurada.</p>}
      </section>

      <form className="flex items-end gap-2" onSubmit={(event) => void addRoot(event)}>
        <Input value={root} onChange={(event) => setRoot(event.target.value)} placeholder="/srv/repos" className="flex-1" />
        <Button type="submit" variant="outline" disabled={busy || !root.trim()}><FolderPlus size={14} /> Adicionar</Button>
      </form>

      <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
        Adicione apenas diretórios confiáveis. O servidor pode ler e escrever dentro deles.
      </div>
      {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
    </div>
  );
}
