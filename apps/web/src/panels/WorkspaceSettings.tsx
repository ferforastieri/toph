import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, FolderOpen, FolderPlus, HardDrive, Plus, Trash2 } from "@toph/icons";
import { api } from "../api";
import { basename } from "../lib";
import { useApp } from "../store";
import { useConfirm } from "../ui/confirm";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";
import { Chip } from "@/boardui/base/badges/chip";

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
      const project = await api.createProject(projectName.trim() || basename(path), path, "#FFB547");
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
        <h3 className="flex items-center gap-2 text-body-medium text-text-primary"><HardDrive size={16} /> Workspace</h3>
        <p className="mt-1 text-caption-1-regular text-text-secondary">As pastas são lidas diretamente do servidor.</p>
      </div>

      {current && (
        <div className="bg-background-secondary-default flex items-start gap-2 rounded-lg border p-4">
          <FolderOpen size={16} className="mt-0.5 text-foreground-icon-secondary" />
          <div className="min-w-0">
            <p className="text-body-medium text-text-primary">{current.name}</p>
            <code className="text-caption-1-regular text-text-secondary">{current.root}</code>
          </div>
        </div>
      )}

      <form className="bg-background-secondary-default flex flex-col gap-3 rounded-lg border p-4" onSubmit={(event) => void createProject(event)}>
        <Input label="Caminho da pasta" value={projectPath} onChange={setProjectPath} placeholder="/srv/repos/my-project" />
        <Input label="Nome do projeto" value={projectName} onChange={setProjectName} placeholder={projectPath ? basename(projectPath) : "Opcional"} />
        <Button type="submit" className="self-start" disabled={busy || !projectPath.trim()} leadingIcon={Plus}>{busy ? "Abrindo..." : "Abrir como projeto"}</Button>
      </form>

      <section className="flex flex-col gap-2">
        <h4 className="flex items-center gap-2 text-body-medium text-text-primary"><FolderPlus size={14} /> Pastas permitidas</h4>
        {roots.map((value) => (
          <div key={value} className="bg-background-secondary-default flex items-center gap-2 rounded-lg border px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-caption-1-regular text-text-secondary">{value}</code>
            <Button type="button" variant="ghost" size="xs" iconOnly leadingIcon={Trash2} onClick={() => void removeRoot(value)} aria-label="Remover" />
          </div>
        ))}
        {roots.length === 0 && <p className="rounded-lg border border-dashed border-border-button-default px-3 py-6 text-center text-caption-1-regular text-text-secondary">Nenhuma pasta configurada.</p>}
      </section>

      <form className="flex items-end gap-2" onSubmit={(event) => void addRoot(event)}>
        <Input value={root} onChange={setRoot} placeholder="/srv/repos" className="flex-1" />
        <Button type="submit" variant="secondary" disabled={busy || !root.trim()} leadingIcon={FolderPlus}>Adicionar</Button>
      </form>

      <div className="flex items-start gap-2 rounded-lg bg-background-tertiary-default px-3 py-2 text-caption-1-regular text-text-secondary">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-status-yellow-text" />
        Adicione apenas diretórios confiáveis. O servidor pode ler e escrever dentro deles.
      </div>
      {error && <Chip color="rose" variant="subtle" className="justify-start whitespace-normal px-2 py-1.5">{error}</Chip>}
    </div>
  );
}
