import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, FolderPlus, GitBranch, Plus, X } from "lucide-react";
import { api, type Repository, type SchemaTable, type WebTarget } from "../api";
import { basename, quoteIdentifier } from "../lib";
import { useApp, type Sidebar, type Tab } from "../store";
import { providerLabel, useAI } from "../ai";
import ActivityBar from "./ActivityBar";
import Tabs from "./Tabs";
import Toasts from "./Toasts";
import RepoPicker from "./RepoPicker";
import FileTree from "../panels/FileTree";
import SearchPanel from "../panels/SearchPanel";
import SourceControlPanel from "../panels/SourceControlPanel";
import DatabasesPanel from "../panels/DatabasesPanel";
import AiSidebar from "../panels/AiSidebar";
import WebSidebar from "../panels/WebSidebar";
import SettingsPanel from "../panels/SettingsPanel";
import EditorPanel from "../panels/EditorPanel";
import DbPanelTab from "../panels/DbPanelTab";
import AiPanelTab from "../panels/AiPanelTab";
import WebPanelTab from "../panels/WebPanelTab";
import DiffPanelTab from "../panels/DiffPanelTab";
import TerminalPanel from "../panels/TerminalPanel";
import { Button } from "../ui/Button";
import BrandMark from "../brand/BrandMark";
import ResizeHandle from "../ui/ResizeHandle";
import { useSettings } from "../settings";

export default function Workbench() {
  const projects = useApp((state) => state.projects);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const setProjects = useApp((state) => state.setProjects);
  const setActiveProject = useApp((state) => state.setActiveProject);
  const openProjectIds = useApp((state) => state.openProjectIds);
  const closeProjectTab = useApp((state) => state.closeProjectTab);
  const tabs = useApp((state) => state.tabs);
  const activeTabId = useApp((state) => state.activeTabId);
  const setTabs = useApp((state) => state.setTabs);
  const openTab = useApp((state) => state.openTab);
  const sidebar = useApp((state) => state.sidebar);
  const setSidebar = useApp((state) => state.setSidebar);
  const terminalOpen = useApp((state) => state.terminalOpen);
  const setTerminalOpen = useApp((state) => state.setTerminalOpen);
  const notify = useApp((state) => state.notify);
  const aiPanelOpen = useApp((state) => state.aiPanelOpen);
  const setAiPanelOpen = useApp((state) => state.setAiPanelOpen);
  const aiDockTab = useApp((state) => state.aiDockTab);
  const setAiDockTab = useApp((state) => state.setAiDockTab);
  const loadAI = useAI((state) => state.load);
  const loadModels = useAI((state) => state.loadModels);
  const aiProvider = useAI((state) => state.config?.provider);
  const sidebarWidth = useSettings((state) => state.sidebarWidth);
  const aiPanelWidth = useSettings((state) => state.aiPanelWidth);
  const updateSettings = useSettings((state) => state.update);

  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [version, setVersion] = useState("0.1.0");
  const [buildId, setBuildId] = useState("");
  const [gitStatus, setGitStatus] = useState("");
  const loadedProject = useRef<string | null>(null);

  const project = projects.find((item) => item.id === activeProjectId) ?? null;
  const branch = gitStatus.split("\n")[0]?.replace(/^##\s*/, "").split("...")[0] ?? "";
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
        if (items.length === 0) setShowRepoPicker(true);
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
            ["editor", "db", "web", "diff"].includes(tab.kind),
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

  useEffect(() => {
    if (!project) {
      setAiDockTab(null);
      return;
    }
    const current = useApp.getState().aiDockTab;
    const next: Tab = {
      id: `ai:dock:${project.id}`,
      kind: "ai",
      title: providerLabel(aiProvider),
      projectId: project.id,
      sessionId: current?.projectId === project.id ? current.sessionId : undefined,
    };
    if (!current || current.projectId !== project.id || current.title !== next.title) {
      setAiDockTab(next);
    }
  }, [aiProvider, project?.id, setAiDockTab]);

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
    if (next === activeProjectId) return;
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

  function openDiff(path: string, staged: boolean) {
    if (!project) return;
    openTab({
      id: `diff:${project.id}:${staged ? "staged" : "worktree"}:${path}`,
      kind: "diff",
      title: basename(path),
      projectId: project.id,
      path,
      staged,
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
    const current = useApp.getState().aiDockTab;
    if (!current || current.projectId !== project.id) {
      setAiDockTab({
        id: `ai:dock:${project.id}`,
        kind: "ai",
        title: providerLabel(aiProvider),
        projectId: project.id,
      });
    }
    setAiPanelOpen(true);
  }

  function toggleAI() {
    if (aiPanelOpen) {
      setAiPanelOpen(false);
    } else {
      openAI();
    }
  }

  function openAiSession(session: { id: string; title?: string }) {
    if (!project) return;
    setAiDockTab({
      id: `ai:dock:${project.id}`,
      kind: "ai",
      title: session.title ?? providerLabel(aiProvider),
      projectId: project.id,
      sessionId: session.id,
    });
    setAiPanelOpen(true);
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

  async function openRepo(repo: Repository) {
    const existing = projects.find((item) => item.root === repo.path);
    if (existing) {
      switchProject(existing.id);
      setShowRepoPicker(false);
      return;
    }
    const next = await api.createProject(repo.name, repo.path, "#7C9BFF");
    setActiveProject(next.id);
    setProjects([...projects, next]);
    setShowRepoPicker(false);
    notify("success", `Opened ${next.name}.`);
  }

  async function closeProject(id: string) {
    const target = projects.find((item) => item.id === id);
    if (!target) return;
    if (activeProjectId === id && loadedProject.current === id) {
      await api
        .saveLayout(id, { tabs: layoutTabs, activeTabId, sidebar, terminalOpen })
        .catch(() => undefined);
    }
    try {
      await api.closeProjectTerminals(id);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not stop project terminals.");
    }
    if (activeProjectId === id) loadedProject.current = null;
    closeProjectTab(id);
    notify("info", `Closed ${target.name}. Terminals stopped.`);
  }

  if (projects.length === 0 || !project) {
    return (
      <main className="empty-workbench">
        <div className="welcome-card">
          <BrandMark size="large" />
          <h1>Welcome to Toph</h1>
          <p>{projects.length === 0 ? "Open a Git repository from the server." : "Open a project tab to continue."}</p>
          <Button className="primary" onClick={() => setShowRepoPicker(true)}>
            <FolderPlus size={15} /> Open repository
          </Button>
        </div>
        {showRepoPicker && (
          <RepoPicker onClose={() => setShowRepoPicker(false)} onOpen={openRepo} />
        )}
        <Toasts />
      </main>
    );
  }

  return (
    <div className="workbench">
      <header className="titlebar">
        <div className="titlebar-brand">
          <BrandMark size="small" />
        </div>
        <div className="project-switcher">
          <div className="project-tabs" role="tablist" aria-label="Open projects">
            {openProjectIds.map((id) => {
              const item = projects.find((projectItem) => projectItem.id === id);
              if (!item) return null;
              return (
                <div
                  key={item.id}
                  className={`project-tab ${item.id === activeProjectId ? "active" : ""}`}
                  role="tab"
                  aria-selected={item.id === activeProjectId}
                >
                  <Button
                    className="project-tab-main"
                    title={item.root}
                    onClick={() => switchProject(item.id)}
                  >
                    {item.name}
                  </Button>
                  <Button
                    className="project-tab-close"
                    title={`Close ${item.name}`}
                    aria-label={`Close ${item.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void closeProject(item.id);
                    }}
                  >
                    <X size={11} />
                  </Button>
                </div>
              );
            })}
          </div>
          <Button className="icon-button" title="Open repository" onClick={() => setShowRepoPicker(true)}>
            <Plus size={15} />
          </Button>
        </div>
        <div className="titlebar-spacer" />
        <div className="titlebar-meta">
          {branch && (
            <span className="titlebar-chip"><GitBranch size={12} /> {branch}</span>
          )}
          <span className="titlebar-version">v{version}</span>
        </div>
        <div className="titlebar-note">
          <Boxes size={13} />
          <span>{project?.root}</span>
        </div>
      </header>

      <div className={`workbench-body ${aiPanelOpen && project ? "ai-open" : ""}`}>
        <ActivityBar onOpenAI={toggleAI} />
        <ResizeHandle
          className="sidebar-resize"
          orientation="vertical"
          value={sidebarWidth}
          min={220}
          max={460}
          label="Resize sidebar"
          onChange={(width) => document.documentElement.style.setProperty("--sidebar-width", `${width}px`)}
          onCommit={(width) => updateSettings({ sidebarWidth: width })}
        />
        <aside className="sidebar">
          {project && sidebar === "files" && <FileTree project={project} onOpenFile={openFile} />}
          {project && sidebar === "search" && <SearchPanel project={project} onOpenFile={openFile} />}
          {project && sidebar === "scm" && <SourceControlPanel project={project} onOpenDiff={openDiff} />}
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
                <BrandMark size="large" className="welcome-mark" />
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
            {activeTab?.kind === "diff" && project && (
              <DiffPanelTab tab={activeTab} project={project} />
            )}
          </div>
          {terminalOpen && project && <TerminalPanel project={project} />}
        </main>

        {project && aiDockTab && aiPanelOpen && (
          <ResizeHandle
            className="ai-resize"
            orientation="vertical"
            value={aiPanelWidth}
            min={300}
            max={620}
            invert
            label="Resize agent panel"
            onChange={(width) => document.documentElement.style.setProperty("--ai-panel-width", `${width}px`)}
            onCommit={(width) => updateSettings({ aiPanelWidth: width })}
          />
        )}
        {project && aiDockTab && aiPanelOpen && (
          <aside className="ai-dock">
            <AiPanelTab
              tab={aiDockTab}
              project={project}
              onClose={() => setAiPanelOpen(false)}
            />
          </aside>
        )}
      </div>

      {showRepoPicker && (
        <RepoPicker onClose={() => setShowRepoPicker(false)} onOpen={openRepo} />
      )}
      <Toasts />
    </div>
  );
}
