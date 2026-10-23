import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, FolderPlus, Plus } from "lucide-react";
import { api, type Project, type SchemaTable, type WebTarget } from "../api";
import { basename, quoteIdentifier } from "../lib";
import { useApp, type Sidebar, type Tab } from "../store";
import { providerLabel, useAI } from "../ai";
import ActivityBar from "./ActivityBar";
import Tabs from "./Tabs";
import StatusBar from "./StatusBar";
import Toasts from "./Toasts";
import ProjectModal from "./ProjectModal";
import FileTree from "../panels/FileTree";
import SearchPanel from "../panels/SearchPanel";
import DatabasesPanel from "../panels/DatabasesPanel";
import AiSidebar from "../panels/AiSidebar";
import WebSidebar from "../panels/WebSidebar";
import SettingsPanel from "../panels/SettingsPanel";
import EditorPanel from "../panels/EditorPanel";
import DbPanelTab from "../panels/DbPanelTab";
import AiPanelTab from "../panels/AiPanelTab";
import WebPanelTab from "../panels/WebPanelTab";
import TerminalPanel from "../panels/TerminalPanel";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";

export default function Workbench() {
  const projects = useApp((state) => state.projects);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const setProjects = useApp((state) => state.setProjects);
  const setActiveProject = useApp((state) => state.setActiveProject);
  const tabs = useApp((state) => state.tabs);
  const activeTabId = useApp((state) => state.activeTabId);
  const setTabs = useApp((state) => state.setTabs);
  const openTab = useApp((state) => state.openTab);
  const sidebar = useApp((state) => state.sidebar);
  const setSidebar = useApp((state) => state.setSidebar);
  const terminalOpen = useApp((state) => state.terminalOpen);
  const setTerminalOpen = useApp((state) => state.setTerminalOpen);
  const notify = useApp((state) => state.notify);
  const loadAI = useAI((state) => state.load);
  const loadModels = useAI((state) => state.loadModels);
  const aiProvider = useAI((state) => state.config?.provider);

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [version, setVersion] = useState("0.1.0");
  const [buildId, setBuildId] = useState("");
  const [gitStatus, setGitStatus] = useState("");
  const loadedProject = useRef<string | null>(null);

  const project = projects.find((item) => item.id === activeProjectId) ?? null;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  useEffect(() => {
    void loadAI().then(() => loadModels());
  }, [loadAI, loadModels]);

  useEffect(() => {
    api
      .health()
      .then((health) => {
        setVersion(health.version);
        setBuildId(health.buildId ?? "");
      })
      .catch(() => undefined);
    api
      .projects()
      .then((items) => {
        setProjects(items);
        if (items.length === 0) setShowProjectModal(true);
      })
      .catch((error) => {
        notify("error", error instanceof Error ? error.message : "Could not load projects.");
      });
  }, [notify, setProjects]);

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    loadedProject.current = null;
    setTabs([]);
    setTerminalOpen(false);
    setSidebar("files");
    api
      .layout(activeProjectId)
      .then((layout) => {
        if (cancelled) return;
        const restored = (Array.isArray(layout.tabs) ? (layout.tabs as Tab[]) : []).filter(
          (tab) =>
            tab &&
            typeof tab.id === "string" &&
            ["editor", "db", "ai", "web"].includes(tab.kind),
        );
        setTabs(
          restored.map((tab) => ({ ...tab, projectId: activeProjectId })),
          typeof layout.activeTabId === "string" ? layout.activeTabId : null,
        );
        if (layout.sidebar) setSidebar(layout.sidebar as Sidebar);
        setTerminalOpen(Boolean(layout.terminalOpen));
        loadedProject.current = activeProjectId;
      })
      .catch((error) => {
        if (!cancelled) {
          notify("error", error instanceof Error ? error.message : "Could not restore workspace.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, notify, setSidebar, setTabs, setTerminalOpen]);

  useEffect(() => {
    if (!activeProjectId) {
      setGitStatus("");
      return;
    }
    api
      .gitStatus(activeProjectId)
      .then(setGitStatus)
      .catch(() => setGitStatus(""));
  }, [activeProjectId, tabs.length]);

  const layoutTabs = useMemo(
    () =>
      tabs.map(({ content: _content, hash: _hash, dirty: _dirty, ...rest }) => rest),
    [tabs],
  );
  const layoutKey = JSON.stringify({
    tabs: layoutTabs,
    activeTabId,
    sidebar,
    terminalOpen,
  });

  useEffect(() => {
    if (!activeProjectId || loadedProject.current !== activeProjectId) return;
    const timer = window.setTimeout(() => {
      api
        .saveLayout(activeProjectId, {
          tabs: layoutTabs,
          activeTabId,
          sidebar,
          terminalOpen,
        })
        .catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activeProjectId, layoutKey, layoutTabs, terminalOpen, sidebar, activeTabId]);

  function switchProject(next: string) {
    if (project && loadedProject.current === project.id) {
      void api.saveLayout(project.id, {
        tabs: layoutTabs,
        activeTabId,
        sidebar,
        terminalOpen,
      });
    }
    loadedProject.current = null;
    setActiveProject(next);
  }

  function openFile(path: string, line?: number) {
    if (!project) return;
    openTab({
      id: `editor:${project.id}:${path}`,
      kind: "editor",
      title: basename(path),
      projectId: project.id,
      path,
      line,
    });
  }

  function openQuery(profileId: string, sql: string) {
    if (!project) return;
    openTab({
      id: `db:${project.id}:${crypto.randomUUID()}`,
      kind: "db",
      title: "SQL query",
      projectId: project.id,
      profileId,
      sql,
    });
  }

  function openTable(profileId: string, table: SchemaTable, driver: string) {
    if (!project) return;
    const schema = table.schema;
    let sql = "";
    if (driver === "mongodb") {
      sql = JSON.stringify(
        { database: schema, collection: table.name, filter: {}, limit: 100 },
        null,
        2,
      );
    } else if (driver === "redis") {
      sql = "SCAN 0 COUNT 100";
    } else if (driver === "elasticsearch") {
      sql = JSON.stringify(
        { index: table.name, body: { query: { match_all: {} }, size: 100 } },
        null,
        2,
      );
    } else if (driver === "neo4j") {
      sql = `MATCH (n:${table.name}) RETURN n LIMIT 100;`;
    } else if (driver === "cassandra") {
      sql = `SELECT * FROM ${schema}.${table.name} LIMIT 100;`;
    } else {
      sql = `SELECT * FROM ${quoteIdentifier(driver, schema, table.name)} LIMIT 100;`;
    }
    const editable = !["mongodb", "redis", "elasticsearch", "neo4j", "cassandra"].includes(driver);
    openTab({
      id: `db:table:${project.id}:${profileId}:${schema}.${table.name}`,
      kind: "db",
      title: table.name,
      projectId: project.id,
      profileId,
      sql,
      table: editable
        ? {
            schema,
            name: table.name,
            primary: table.columns.filter((column) => column.primary).map((column) => column.name),
          }
        : undefined,
    });
  }

  function openAI() {
    if (!project) return;
    openTab({
      id: `ai:${project.id}:${crypto.randomUUID()}`,
      kind: "ai",
      title: providerLabel(aiProvider),
      projectId: project.id,
    });
  }

  function openAiSession(session: { id: string; title?: string }) {
    if (!project) return;
    openTab({
      id: `ai:${project.id}:${session.id}`,
      kind: "ai",
      title: session.title ?? providerLabel(aiProvider),
      projectId: project.id,
      sessionId: session.id,
    });
  }

  function openWeb(target: WebTarget) {
    if (!project) return;
    openTab({
      id: `web:${project.id}:${target.id}`,
      kind: "web",
      title: target.name,
      projectId: project.id,
      url: target.url,
    });
  }

  function projectCreated(next: Project) {
    setShowProjectModal(false);
    setProjects([...projects, next]);
    switchProject(next.id);
  }

  if (projects.length === 0) {
    return (
      <main className="empty-workbench">
        <div className="welcome-card">
          <div className="brand-mark large">T</div>
          <h1>Welcome to Toph</h1>
          <p>Create your first project from a directory on the server.</p>
          <Button className="primary" onClick={() => setShowProjectModal(true)}>
            <FolderPlus size={15} /> Create project
          </Button>
        </div>
        {showProjectModal && (
          <ProjectModal onClose={() => setShowProjectModal(false)} onCreated={projectCreated} />
        )}
        <Toasts />
      </main>
    );
  }

  return (
    <div className="workbench">
      <header className="titlebar">
        <div className="titlebar-brand">
          <div className="brand-mark small">T</div>
          <span>Toph</span>
        </div>
        <div className="project-switcher">
          <Select
            value={activeProjectId ?? ""}
            options={projects.map((item) => ({ value: item.id, label: item.name }))}
            onChange={switchProject}
            label="Project"
            placeholder="Select project"
            className="project-select-trigger"
          />
          <Button className="icon-button" title="New project" onClick={() => setShowProjectModal(true)}>
            <Plus size={15} />
          </Button>
        </div>
        <div className="titlebar-spacer" />
        <div className="titlebar-note">
          <Boxes size={13} />
          <span>{project?.root}</span>
        </div>
      </header>

      <div className="workbench-body">
        <ActivityBar />
        <aside className="sidebar">
          {project && sidebar === "files" && <FileTree project={project} onOpenFile={openFile} />}
          {project && sidebar === "search" && <SearchPanel project={project} onOpenFile={openFile} />}
          {project && sidebar === "db" && <DatabasesPanel onOpenQuery={openQuery} onOpenTable={openTable} />}
          {project && sidebar === "ai" && <AiSidebar project={project} onOpenAI={openAI} onOpenSession={openAiSession} />}
          {project && sidebar === "web" && <WebSidebar onOpenWeb={openWeb} />}
          {sidebar === "settings" && <SettingsPanel version={version} buildId={buildId} />}
        </aside>

        <main className="editor-column">
          <Tabs />
          <div className="editor-host">
            {!activeTab && project && (
              <div className="welcome">
                <div className="welcome-mark">T</div>
                <h2>{project.name}</h2>
                <p>{project.root}</p>
                <div className="welcome-actions">
                  <Button className="ghost" onClick={() => setSidebar("files")}>
                    Open Explorer
                  </Button>
                  <Button className="ghost" onClick={() => setSidebar("db")}>
                    Database
                  </Button>
                  <Button className="ghost" onClick={openAI}>
                    Agent
                  </Button>
                </div>
              </div>
            )}
            {activeTab?.kind === "editor" && project && (
              <EditorPanel tab={activeTab} project={project} />
            )}
            {activeTab?.kind === "db" && <DbPanelTab tab={activeTab} />}
            {activeTab?.kind === "ai" && project && (
              <AiPanelTab tab={activeTab} project={project} />
            )}
            {activeTab?.kind === "web" && <WebPanelTab tab={activeTab} />}
          </div>
          {terminalOpen && project && <TerminalPanel project={project} />}
        </main>
      </div>

      {project && (
        <StatusBar project={project} version={version} gitStatus={gitStatus} />
      )}

      {showProjectModal && (
        <ProjectModal onClose={() => setShowProjectModal(false)} onCreated={projectCreated} />
      )}
      <Toasts />
    </div>
  );
}
