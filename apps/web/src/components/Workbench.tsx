import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Bell, Bot, Check, ChevronDown, FolderPlus, GitBranch, Plus, Settings2, X } from "@toph/icons";
import { api, getApiBase, type Repository, type SchemaTable, type WebTarget } from "../api";
import { basename, expandGitPattern, languageFor, quoteIdentifier, sanitizeBranchName } from "../lib";
import { useApp, type AppNotification, type Sidebar, type Tab } from "../store";
import { providerLabel, useAI } from "../ai";
import { nativePushToken, requestMobileNotificationPermission } from "../notifications";
import { PROJECT_EVENT, type ProjectEvent } from "../projectEvents";
import ActivityBar from "./ActivityBar";
import AvatarMenu from "./AvatarMenu";
import MobileNav from "./MobileNav";
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
import SourceControlPanel from "../panels/SourceControlPanel";
import { Button } from "@toph/ui";
import BrandMark from "@toph/brand";
import { ResizeHandle } from "@toph/ui";
import { useSettings } from "../settings";
import { suggestGitChanges } from "../gitAi";
import { parseGitStatus } from "../gitStatus";

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
  const notifications = useApp((state) => state.notifications);
  const markProjectNotificationsRead = useApp((state) => state.markProjectNotificationsRead);
  const aiPanelOpen = useApp((state) => state.aiPanelOpen);
  const setAiPanelOpen = useApp((state) => state.setAiPanelOpen);
  const aiDockTab = useApp((state) => state.aiDockTab);
  const setAiDockTab = useApp((state) => state.setAiDockTab);
  const loadAI = useAI((state) => state.load);
  const loadModels = useAI((state) => state.loadModels);
  const aiProvider = useAI((state) => state.config?.provider);
  const sidebarWidth = useSettings((state) => state.sidebarWidth);
  const branchPattern = useSettings((state) => state.gitBranchPattern);
  const aiConfig = useAI((state) => state.config);
  const aiPanelWidth = useSettings((state) => state.aiPanelWidth);
  const updateSettings = useSettings((state) => state.update);

  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [version, setVersion] = useState("0.1.0");
  const [gitStatus, setGitStatus] = useState("");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [projectsSheetOpen, setProjectsSheetOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branchInfo, setBranchInfo] = useState<{ current: string; branches: string[] } | null>(null);
  const [branchBusy, setBranchBusy] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, column: 1, language: "" });
  const loadedProject = useRef<string | null>(null);
  const mobile = document.documentElement.classList.contains("mobile-client");

  const project = projects.find((item) => item.id === activeProjectId) ?? null;
  const branch = gitStatus.split("\n")[0]?.replace(/^##\s*/, "").split("...")[0] ?? "";
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const unreadForProject = (projectId: string) =>
    notifications.filter((notification) => !notification.read && notification.projectId === projectId);
  const activeUnread = project ? unreadForProject(project.id) : [];
  const sortedBranches = branchInfo
    ? [...branchInfo.branches].sort((a, b) => {
        if (a === branchInfo.current) return -1;
        if (b === branchInfo.current) return 1;
        return a.localeCompare(b);
      })
    : [];

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
    if (!branchMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBranchMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [branchMenuOpen]);

  useEffect(() => {
    setSearchFocusToken(0);
  }, [activeProjectId]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let stopped = false;
    let attempts = 0;
    let hasConnected = false;

    const dispatch = (event: ProjectEvent) => {
      window.dispatchEvent(new CustomEvent(PROJECT_EVENT, { detail: event }));
    };
    const connect = () => {
      if (stopped || socket) return;
      const base = (getApiBase() || window.location.origin).replace(/\/+$/, "");
      let url: URL;
      try {
        url = new URL(`${base}/api/events/ws`, window.location.origin);
      } catch {
        return;
      }
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      let current: WebSocket;
      try {
        current = new WebSocket(url);
      } catch {
        retryTimer = window.setTimeout(connect, Math.min(10000, 750 * 2 ** attempts++));
        return;
      }
      socket = current;
      current.onopen = () => {
        attempts = 0;
        if (hasConnected) {
          const projectId = useApp.getState().activeProjectId;
          if (projectId) dispatch({ type: "sync", projectId, at: Date.now() });
        }
        hasConnected = true;
      };
      current.onmessage = (message) => {
        try {
          const event = JSON.parse(String(message.data)) as ProjectEvent;
          if (event && typeof event.type === "string" && typeof event.projectId === "string") {
            dispatch(event);
          }
        } catch {
          // Ignore malformed live update events.
        }
      };
      current.onerror = () => current.close();
      current.onclose = () => {
        if (socket === current) socket = null;
        if (stopped) return;
        retryTimer = window.setTimeout(connect, Math.min(10000, 750 * 2 ** attempts++));
      };
    };

    connect();
    const onOnline = () => {
      if (!socket) {
        window.clearTimeout(retryTimer);
        connect();
      }
    };
    window.addEventListener("online", onOnline);
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.removeEventListener("online", onOnline);
      socket?.close();
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const projectId = useApp.getState().activeProjectId;
      if (!projectId) return;
      window.dispatchEvent(
        new CustomEvent(PROJECT_EVENT, {
          detail: { type: "sync", projectId, at: Date.now() } satisfies ProjectEvent,
        }),
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("focus", sync);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!activeProjectId) {
      setGitStatus("");
      return;
    }
    const onProjectEvent = (raw: Event) => {
      const event = (raw as CustomEvent<ProjectEvent>).detail;
      if (!event || event.projectId !== activeProjectId) return;
      if (event.type !== "git" && event.type !== "files" && event.type !== "sync") return;
      api.gitStatus(activeProjectId).then(setGitStatus).catch(() => undefined);
    };
    window.addEventListener(PROJECT_EVENT, onProjectEvent);
    return () => window.removeEventListener(PROJECT_EVENT, onProjectEvent);
  }, [activeProjectId]);

  useEffect(() => {
    const onCursor = (event: Event) => {
      const detail = (event as CustomEvent<{ line: number; column: number; language: string }>).detail;
      if (detail) setCursor(detail);
    };
    window.addEventListener("toph:cursor", onCursor);
    return () => window.removeEventListener("toph:cursor", onCursor);
  }, []);

  useEffect(() => {
    if (activeTab?.kind === "editor") {
      setCursor({
        line: activeTab.line ?? 1,
        column: 1,
        language: languageFor(activeTab.path ?? activeTab.title),
      });
    } else {
      setCursor({ line: 1, column: 1, language: "" });
    }
  }, [activeTabId]);

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

  async function toggleBranchMenu() {
    if (branchMenuOpen) {
      setBranchMenuOpen(false);
      return;
    }
    if (!project) return;
    setProjectMenuOpen(false);
    setBranchMenuOpen(true);
    setNewBranchName("");
    setBranchInfo(null);
    try {
      setBranchInfo(await api.gitBranches(project.id));
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível listar as branches.");
    }
  }

  async function checkoutBranch(name: string) {
    if (!project || branchBusy) return;
    setBranchBusy(name);
    try {
      await api.gitCheckout(project.id, name);
      setGitStatus(await api.gitStatus(project.id));
      window.dispatchEvent(new Event("toph:git-changed"));
      setBranchMenuOpen(false);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível trocar de branch.");
    } finally {
      setBranchBusy("");
    }
  }

  async function collectBranchDiff(): Promise<string> {
    if (!project) return "";
    const parsed = parseGitStatus(await api.gitStatus(project.id));
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const change of parsed.changes) {
      if (seen.has(change.path)) continue;
      seen.add(change.path);
      const staged = change.staged && !change.unstaged;
      const diff = await api.gitDiff(project.id, change.path, staged).catch(() => "");
      if (diff) parts.push(diff);
    }
    return parts.join("\n").slice(0, 16000);
  }

  async function generateBranchName() {
    if (!project || branchBusy) return;
    setBranchBusy("generate");
    try {
      const status = await api.gitStatus(project.id);
      const parsed = parseGitStatus(status);
      const diff = await collectBranchDiff();
      const suggestion = await suggestGitChanges(aiConfig, diff, parsed.branch);
      const generated = sanitizeBranchName(
        expandGitPattern(branchPattern, {
          repo: project.name,
          branch: parsed.branch,
          user: user?.username ?? "",
          task: suggestion.task,
          slug: suggestion.slug || "update",
          summary: suggestion.summary,
        }),
      );
      setNewBranchName(generated);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível gerar a branch.");
    } finally {
      setBranchBusy("");
    }
  }

  async function createBranchFromMenu(event: FormEvent) {
    event.preventDefault();
    if (!project || !newBranchName.trim() || branchBusy) return;
    const name = newBranchName.trim();
    setBranchBusy("create");
    try {
      await api.gitCreateBranch(project.id, name);
      setNewBranchName("");
      setGitStatus(await api.gitStatus(project.id));
      setBranchInfo(await api.gitBranches(project.id));
      window.dispatchEvent(new Event("toph:git-changed"));
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível criar a branch.");
    } finally {
      setBranchBusy("");
    }
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
    markProjectNotificationsRead(project.id);
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
    markProjectNotificationsRead(project.id);
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
    markProjectNotificationsRead(project.id);
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
    setProjectMenuOpen(false);
    setBranchMenuOpen(false);
    setProjectsSheetOpen(false);
    markProjectNotificationsRead(notification.projectId);
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

  function openLatestProjectNotification(projectId: string) {
    const latest = notifications.find(
      (notification) => !notification.read && notification.projectId === projectId,
    );
    if (!latest) return;
    openNotification(latest);
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
      {mobile && (
        <header className="titlebar">
          <div className="project-switcher">
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
            {activeUnread.length > 0 && (
              <button
                type="button"
                className="titlebar-project-notify"
                title={`${activeUnread.length} notificação(ões) em ${project?.name ?? "projeto"}`}
                aria-label="Abrir a notificação mais recente do projeto"
                onClick={() => project && openLatestProjectNotification(project.id)}
              >
                <Bell size={17} />
                <span>{activeUnread.length > 9 ? "9+" : activeUnread.length}</span>
              </button>
            )}
          </div>
          <AvatarMenu
            user={user}
            variant="titlebar"
            active={sidebar === "settings" && mobilePanelOpen}
            onSettings={openMobileSettings}
          />
        </header>
      )}

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
              searchFocusToken={searchFocusToken}
              onOpenGit={mobile ? () => void toggleBranchMenu() : undefined}
              onOpenDiff={openDiff}
              onStatusChange={setGitStatus}
            />
          )}
          {project && sidebar === "db" && <DatabasesPanel project={project} onOpenQuery={openQuery} onOpenTable={openTable} />}
          {project && sidebar === "ai" && <AiSidebar project={project} onNewSession={newAiSession} onOpenSession={openAiSession} />}
          {project && sidebar === "web" && <WebSidebar onOpenWeb={openWeb} />}
          {sidebar === "settings" && <SettingsPanel version={version} />}
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

        {!mobile && project && aiPanelOpen && aiDockTab && (
          <>
            <ResizeHandle
              className="ai-resize"
              orientation="vertical"
              value={aiPanelWidth}
              min={300}
              max={620}
              label="Resize agent panel"
              onChange={(width) => document.documentElement.style.setProperty("--ai-panel-width", `${width}px`)}
              onCommit={(width) => updateSettings({ aiPanelWidth: width })}
            />
            <aside className="right-sidebar">
            <div className="right-agent">
              <AiPanelTab
                tab={aiDockTab}
                project={project}
                onClose={() => setAiPanelOpen(false)}
              />
            </div>
            </aside>
          </>
        )}

        {mobile && project && aiDockTab && aiPanelOpen && (
          <aside className="ai-dock">
            <AiPanelTab
              tab={aiDockTab}
              project={project}
              onClose={() => setAiPanelOpen(false)}
            />
          </aside>
        )}
      </div>

      {!mobile && (
        <>
          <footer className="desktop-footer">
            <div className="desktop-footer-left">
              <button
                type="button"
                className="desktop-branch-button"
                onClick={() => void toggleBranchMenu()}
                aria-haspopup="menu"
                aria-expanded={branchMenuOpen}
              >
                <GitBranch size={12} />
                <span>{branch || "detached"}</span>
                <ChevronDown size={12} />
              </button>
              <div className="desktop-project-pill">
                <button
                  type="button"
                  className="desktop-project-button"
                  onClick={() => {
                    setBranchMenuOpen(false);
                    setProjectMenuOpen((current) => !current);
                  }}
                  aria-haspopup="menu"
                  aria-expanded={projectMenuOpen}
                >
                  <span className="desktop-project-avatar" style={{ background: project.color }}>
                    {project.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="desktop-project-name">{project.name}</span>
                  <span className="desktop-project-count">{openProjectIds.length}</span>
                  <ChevronDown size={14} />
                </button>
                {activeUnread.length > 0 && (
                  <button
                    type="button"
                    className="desktop-project-notify"
                    title={`${activeUnread.length} notificação(ões) em ${project.name}`}
                    aria-label="Abrir a notificação mais recente do projeto"
                    onClick={() => openLatestProjectNotification(project.id)}
                  >
                    <Bell size={11} />
                    <span>{activeUnread.length > 9 ? "9+" : activeUnread.length}</span>
                  </button>
                )}
              </div>
            </div>
            <div className="desktop-footer-right">
              {activeTab?.kind === "editor" && (
                <span className="desktop-footer-item">Ln {cursor.line}, Col {cursor.column}</span>
              )}
              {cursor.language && <span className="desktop-footer-item">{cursor.language}</span>}
              <span className="desktop-footer-item">UTF-8</span>
              <span className="desktop-footer-item">LF</span>
              <span className="desktop-footer-version">v{version}</span>
            </div>
          </footer>

          {branchMenuOpen && project && (
            <>
              <button
                type="button"
                className="desktop-branch-backdrop"
                aria-label="Fechar painel de Git"
                onClick={() => setBranchMenuOpen(false)}
              />
              <div
                className="desktop-branch-menu"
                role="dialog"
                aria-modal="true"
                aria-label="Branches"
              >
                <div className="desktop-branch-modal-head">
                  <div className="desktop-branch-modal-title">
                    <GitBranch size={14} />
                    <span>Git</span>
                    <strong>{branchInfo?.current || branch || "detached"}</strong>
                  </div>
                  <Button
                    className="icon-button"
                    title="Fechar"
                    aria-label="Fechar painel de Git"
                    onClick={() => setBranchMenuOpen(false)}
                  >
                    <X size={15} />
                  </Button>
                </div>

                <div className="desktop-branch-modal-body">
                  <section className="desktop-branch-pane">
                    <div className="desktop-branch-pane-head">
                      <span>Branches</span>
                      <b>{branchInfo ? branchInfo.branches.length : "..."}</b>
                    </div>
                    <div className="desktop-branch-menu-list">
                      {branchInfo ? (
                        sortedBranches.map((name) => (
                          <button
                            key={name}
                            type="button"
                            role="menuitem"
                            title={name}
                            aria-current={name === branchInfo.current ? "true" : undefined}
                            className={`desktop-branch-item ${name === branchInfo.current ? "active" : ""}`}
                            disabled={Boolean(branchBusy)}
                            onClick={() => void checkoutBranch(name)}
                          >
                            <GitBranch size={13} />
                            <span className="desktop-branch-name">{name}</span>
                            {name === branchInfo.current && <Check size={14} />}
                          </button>
                        ))
                      ) : (
                        <div className="desktop-branch-menu-state">Carregando branches...</div>
                      )}
                    </div>
                    <div className="desktop-branch-menu-footer">
                      <form className="desktop-branch-form" onSubmit={(event) => void createBranchFromMenu(event)}>
                        <div className="desktop-branch-input">
                          <input
                            value={newBranchName}
                            onChange={(event) => setNewBranchName(event.target.value)}
                            placeholder="nome-da-branch"
                            aria-label="Nome da nova branch"
                          />
                          <Button
                            type="button"
                            className="icon-button branch-generate"
                            title="Gerar nome da branch com IA"
                            aria-label="Gerar nome da branch com IA"
                            disabled={Boolean(branchBusy)}
                            onClick={() => void generateBranchName()}
                          >
                            {branchBusy === "generate" ? "..." : <Bot size={13} />}
                          </Button>
                        </div>
                        <Button className="primary small" disabled={!newBranchName.trim() || Boolean(branchBusy)}>
                          Criar
                        </Button>
                      </form>
                    </div>
                  </section>

                  <section className="desktop-branch-commit">
                    <div className="desktop-branch-pane-head">
                      <span>Commit</span>
                    </div>
                    <SourceControlPanel
                      project={project}
                      embedded
                      view="commit"
                      onOpenDiff={openDiff}
                      onStatusChange={setGitStatus}
                    />
                  </section>
                </div>
              </div>
            </>
          )}

          {projectMenuOpen && (
            <>
              <button
                type="button"
                className="desktop-project-menu-backdrop"
                aria-label="Fechar seletor de projetos"
                onClick={() => setProjectMenuOpen(false)}
              />
              <div className="desktop-project-menu" role="menu" aria-label="Selecionar projeto">
                <div className="desktop-project-menu-head">
                  <span>Projetos abertos</span>
                  <span>{openProjectIds.length}</span>
                </div>
                <div className="desktop-project-menu-list">
                  {openProjectIds.map((id) => {
                    const item = projects.find((projectItem) => projectItem.id === id);
                    if (!item) return null;
                    const active = item.id === activeProjectId;
                    const unread = unreadForProject(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`desktop-project-menu-row ${active ? "active" : ""}`}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="desktop-project-menu-item"
                          onClick={() => {
                            setProjectMenuOpen(false);
                            switchProject(item.id);
                          }}
                        >
                          <span className="desktop-project-avatar" style={{ background: item.color }}>
                            {item.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="desktop-project-menu-copy">
                            <strong>{item.name}</strong>
                            <small>{item.root}</small>
                          </span>
                          {active && <Check size={15} />}
                        </button>
                        {unread.length > 0 && (
                          <button
                            type="button"
                            className="desktop-project-menu-notify"
                            title={`${unread.length} notificação(ões) em ${item.name}`}
                            aria-label={`Abrir notificação de ${item.name}`}
                            onClick={() => {
                              setProjectMenuOpen(false);
                              switchProject(item.id);
                              openLatestProjectNotification(item.id);
                            }}
                          >
                            <Bell size={12} />
                            <span>{unread.length > 9 ? "9+" : unread.length}</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="desktop-project-menu-open"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    setShowRepoPicker(true);
                  }}
                >
                  <FolderPlus size={15} /> Abrir repositório
                </button>
              </div>
            </>
          )}
        </>
      )}

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
                const unread = unreadForProject(item.id);
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
                    {unread.length > 0 && (
                      <Button
                        className="icon-button mobile-project-notify"
                        aria-label={`Abrir notificação de ${item.name}`}
                        title={`${unread.length} notificação(ões) em ${item.name}`}
                        onClick={() => {
                          setProjectsSheetOpen(false);
                          switchProject(item.id);
                          openLatestProjectNotification(item.id);
                        }}
                      >
                        <Bell size={15} />
                        {unread.length > 1 && <span>{unread.length > 9 ? "9+" : unread.length}</span>}
                      </Button>
                    )}
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
