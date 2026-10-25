import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Boxes, Check, ChevronDown, FolderPlus, GitBranch, Plus, Settings2, X } from "lucide-react";
import { api, getApiBase, type Repository, type SchemaTable, type WebTarget } from "../api";
import { basename, quoteIdentifier } from "../lib";
import { useApp, type AppNotification, type Sidebar, type Tab } from "../store";
import { providerLabel, useAI } from "../ai";
import { nativePushToken, requestMobileNotificationPermission } from "../notifications";
import ActivityBar from "./ActivityBar";
import AvatarMenu from "./AvatarMenu";
import MobileNav from "./MobileNav";
import NotificationBell from "./NotificationBell";
import Tabs from "./Tabs";
import Toasts from "./Toasts";
import RepoPicker from "./RepoPicker";
import ExplorerPanel from "../panels/ExplorerPanel";
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
import { Button } from "@toph/ui";
import BrandMark from "@toph/brand";
import { ResizeHandle } from "@toph/ui";
import { useSettings } from "../settings";

export default function Workbench() {
  const projects = useApp((state) => state.projects);
  const user = useApp((state) => state.user);
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
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [projectsSheetOpen, setProjectsSheetOpen] = useState(false);
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const loadedProject = useRef<string | null>(null);
  const mobile = document.documentElement.classList.contains("mobile-client");

  const project = projects.find((item) => item.id === activeProjectId) ?? null;
  const branch = gitStatus.split("\n")[0]?.replace(/^##\s*/, "").split("...")[0] ?? "";
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  useEffect(() => {
    void loadAI().then(() => loadModels());
  }, [loadAI, loadModels]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setSidebar("files");
        if (mobile) {
          setMobilePanelOpen(true);
          setProjectsSheetOpen(false);
          setAiPanelOpen(false);
          setTerminalOpen(false);
        }
        setSearchFocusToken((current) => current + 1);
        return;
      }
      if (event.key !== "Escape" || !mobile) return;
      if (document.querySelector(".modal-backdrop, .avatar-menu")) return;
      setMobilePanelOpen(false);
      setProjectsSheetOpen(false);
      setAiPanelOpen(false);
      setTerminalOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [mobile, setAiPanelOpen, setSidebar, setTerminalOpen]);

  useEffect(() => {
    setSearchFocusToken(0);
  }, [activeProjectId]);

  useEffect(() => {
    const handler = (payload: { title?: string; body?: string }) => {
      const state = useApp.getState();
      if (state.aiPanelOpen) return;
      state.addNotification({
        kind: "ai",
        title: payload.title?.trim() || "Resposta da IA",
        body: payload.body?.trim() || "A IA terminou de responder.",
        projectId: state.activeProjectId ?? undefined,
        tabId: state.aiDockTab?.id,
        sessionId: state.aiDockTab?.sessionId,
      });
    };
    (window as unknown as { __tophPush?: (payload: { title?: string; body?: string }) => void }).__tophPush = handler;

    if (typeof EventSource === "undefined") {
      return () => {
        delete (window as unknown as { __tophPush?: (payload: { title?: string; body?: string }) => void }).__tophPush;
      };
    }
    const stream = new EventSource(`${getApiBase()}/api/notifications/stream`, {
      withCredentials: true,
    });
    const onAI = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { title?: string; body?: string };
        handler(payload);
      } catch {
        // Ignore malformed notification events.
      }
    };
    stream.addEventListener("ai.done", onAI as EventListener);
    return () => {
      stream.removeEventListener("ai.done", onAI as EventListener);
      stream.close();
      delete (window as unknown as { __tophPush?: (payload: { title?: string; body?: string }) => void }).__tophPush;
    };
  }, []);

  useEffect(() => {
    if (!mobile) return;
    const timer = window.setTimeout(() => requestMobileNotificationPermission(), 900);
    let attempts = 0;
    let stopped = false;
    const register = async () => {
      const token = nativePushToken();
      if (!token || stopped) return false;
      try {
        await api.registerPushToken(token, "android");
      } catch {
        return false;
      }
      return true;
    };
    void register();
    const poll = window.setInterval(() => {
      attempts += 1;
      void register().then((registered) => {
        if ((registered || attempts > 20) && !stopped) {
          stopped = true;
          window.clearInterval(poll);
        }
      });
    }, 2500);
    const onToken = (token: string) => {
      if (token) void api.registerPushToken(token, "android").catch(() => undefined);
    };
    (window as unknown as { __tophPushToken?: (token: string) => void }).__tophPushToken = onToken;
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
      delete (window as unknown as { __tophPushToken?: (token: string) => void }).__tophPushToken;
    };
  }, [mobile]);

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
        if (layout.sidebar) {
          const savedSidebar =
            layout.sidebar === "search" || layout.sidebar === "scm"
              ? "files"
              : layout.sidebar;
          setSidebar(savedSidebar as Sidebar);
        }
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
      tabs.map(({ content: _content, hash: _hash, dirty: _dirty, autoRun: _autoRun, ...rest }) => rest),
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
    if (mobile) setMobilePanelOpen(false);
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

  function openMobileSidebar(next: Sidebar) {
    if (mobilePanelOpen && sidebar === next) {
      setMobilePanelOpen(false);
      return;
    }
    setSidebar(next);
    setMobilePanelOpen(true);
    setAiPanelOpen(false);
    setTerminalOpen(false);
  }

  function openMobileSettings() {
    setSidebar("settings");
    setMobilePanelOpen(true);
    setAiPanelOpen(false);
    setTerminalOpen(false);
  }

  function openMobileAI() {
    setMobilePanelOpen(false);
    setTerminalOpen(false);
    if (aiPanelOpen) setAiPanelOpen(false);
    else openAI();
  }

  function openMobileTerminal() {
    setMobilePanelOpen(false);
    setAiPanelOpen(false);
    setTerminalOpen(!terminalOpen);
  }

  function openFile(path: string, line?: number) {
    if (!project) return;
    if (mobile) setMobilePanelOpen(false);
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
    if (mobile) setMobilePanelOpen(false);
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
    if (mobile) setMobilePanelOpen(false);
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
    if (mobile) setMobilePanelOpen(false);
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
      autoRun: true,
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

  function newAiSession() {
    if (!project) return;
    if (mobile) setMobilePanelOpen(false);
    setAiDockTab({
      id: `ai:dock:${project.id}`,
      kind: "ai",
      title: providerLabel(aiProvider),
      projectId: project.id,
    });
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
    if (mobile) setMobilePanelOpen(false);
    setAiDockTab({
      id: `ai:dock:${project.id}`,
      kind: "ai",
      title: session.title ?? providerLabel(aiProvider),
      projectId: project.id,
      sessionId: session.id,
    });
    setAiPanelOpen(true);
  }

  function openNotification(notification: AppNotification) {
    if (!notification.projectId) return;
    if (notification.projectId !== activeProjectId) setActiveProject(notification.projectId);
    setAiDockTab({
      id: notification.tabId ?? `ai:dock:${notification.projectId}`,
      kind: "ai",
      title: providerLabel(aiProvider),
      projectId: notification.projectId,
      sessionId: notification.sessionId,
    });
    if (mobile) setMobilePanelOpen(false);
    setTerminalOpen(false);
    setAiPanelOpen(true);
  }

  function openWeb(target: WebTarget) {
    if (!project) return;
    if (mobile) setMobilePanelOpen(false);
    openTab({
      id: `web:${project.id}:${target.id}`,
      kind: "web",
      title: target.name,
      projectId: project.id,
      url: target.url,
    });
  }

  async function openRepo(repo: Repository) {
    if (mobile) setMobilePanelOpen(false);
    const existing = projects.find((item) => item.root === repo.path);
    if (existing) {
      switchProject(existing.id);
      setShowRepoPicker(false);
      return;
    }
    const next = await api.createProject(repo.name, repo.path, "#43E6A0");
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
          {mobile ? (
            <button
              type="button"
              className="mobile-project-trigger"
              onClick={() => setProjectsSheetOpen(true)}
              aria-label="Abrir projetos"
            >
              <span className="mobile-project-avatar" style={{ background: project?.color ?? "var(--primary)" }}>
                {(project?.name ?? "T").slice(0, 1).toUpperCase()}
              </span>
              <span className="mobile-project-name">{project?.name ?? "Toph"}</span>
              <span className="mobile-project-count">{openProjectIds.length}</span>
              <ChevronDown size={16} />
            </button>
          ) : (
            <>
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
            </>
          )}
        </div>
        {mobile && (
          <>
            <NotificationBell variant="titlebar" onOpen={openNotification} />
            <AvatarMenu
              user={user}
              variant="titlebar"
              active={sidebar === "settings" && mobilePanelOpen}
              onSettings={openMobileSettings}
            />
          </>
        )}
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
        <ActivityBar onOpenAI={toggleAI} onOpenNotification={openNotification} />
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
        <aside className={`sidebar ${mobile && mobilePanelOpen ? "mobile-open" : ""}`}>
          {mobile && mobilePanelOpen && (
            <div className="mobile-panel-head">
              <Button
                className="icon-button"
                onClick={() => setMobilePanelOpen(false)}
                aria-label="Voltar"
                title="Voltar"
              >
                <ArrowLeft size={18} />
              </Button>
              <strong>
                {sidebar === "settings" ? "Configurações" : sidebar === "db" ? "Bancos" : sidebar === "web" ? "Web apps" : "Arquivos"}
              </strong>
            </div>
          )}
          {project && sidebar === "files" && (
            <ExplorerPanel
              project={project}
              onOpenFile={openFile}
              onOpenDiff={openDiff}
              searchFocusToken={searchFocusToken}
            />
          )}
          {project && sidebar === "db" && <DatabasesPanel project={project} onOpenQuery={openQuery} onOpenTable={openTable} />}
          {project && sidebar === "ai" && <AiSidebar project={project} onNewSession={newAiSession} onOpenSession={openAiSession} />}
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

      {mobile && projectsSheetOpen && (
        <>
          <button
            type="button"
            className="mobile-sheet-backdrop"
            aria-label="Fechar projetos"
            onClick={() => setProjectsSheetOpen(false)}
          />
          <section className="mobile-sheet projects-sheet" role="dialog" aria-modal="true" aria-label="Projetos abertos">
            <div className="mobile-sheet-handle" aria-hidden="true"><span /></div>
            <div className="mobile-sheet-title">
              <div>
                <span className="eyebrow">Workspace</span>
                <strong>Projetos abertos</strong>
              </div>
              <Button className="icon-button" aria-label="Fechar" onClick={() => setProjectsSheetOpen(false)}>
                <X size={16} />
              </Button>
            </div>
            <div className="mobile-project-list">
              {openProjectIds.map((id) => {
                const item = projects.find((projectItem) => projectItem.id === id);
                if (!item) return null;
                const active = item.id === activeProjectId;
                return (
                  <div className={`mobile-project-row ${active ? "active" : ""}`} key={item.id}>
                    <button
                      type="button"
                      className="mobile-project-main"
                      onClick={() => {
                        setProjectsSheetOpen(false);
                        switchProject(item.id);
                      }}
                    >
                      <span className="mobile-project-avatar" style={{ background: item.color }}>
                        {item.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="mobile-project-copy">
                        <strong>{item.name}</strong>
                        <small>{item.root}</small>
                      </span>
                      {active && <Check size={16} className="mobile-project-check" />}
                    </button>
                    <Button
                      className="icon-button"
                      aria-label={`Fechar ${item.name}`}
                      onClick={() => void closeProject(item.id)}
                    >
                      <X size={15} />
                    </Button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="mobile-sheet-action"
              onClick={() => {
                setProjectsSheetOpen(false);
                setShowRepoPicker(true);
              }}
            >
              <span><Plus size={17} /> Abrir projeto</span>
              <span className="mobile-sheet-action-hint">repositório</span>
            </button>
            <div className="mobile-sheet-footer">
              <button
                type="button"
                onClick={() => {
                  setProjectsSheetOpen(false);
                  openMobileSidebar("settings");
                }}
              >
                <Settings2 size={16} /> Configurações
              </button>
              <span>Toph · {version}</span>
            </div>
          </section>
        </>
      )}
      {mobile && (
        <MobileNav
          sidebar={sidebar}
          panelOpen={mobilePanelOpen}
          terminalOpen={terminalOpen}
          aiPanelOpen={aiPanelOpen}
          onSidebar={openMobileSidebar}
          onAI={openMobileAI}
          onWeb={() => openMobileSidebar("web")}
          onTerminal={openMobileTerminal}
        />
      )}
      {showRepoPicker && (
        <RepoPicker onClose={() => setShowRepoPicker(false)} onOpen={openRepo} />
      )}
      <Toasts />
    </div>
  );
}
