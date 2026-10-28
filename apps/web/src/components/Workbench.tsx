import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bell, Bot, Check, ChevronDown, Database as DatabaseIcon, Files as FilesIcon, Globe2 as GlobeIcon, FolderPlus, GitBranch, Plus, Settings2, TerminalSquare, X } from "@toph/icons";
import { api, getApiBase, type Repository, type SchemaTable, type WebTarget } from "../api";
import { basename, expandGitPattern, languageFor, quoteIdentifier, sanitizeBranchName } from "../lib";
import { useApp, type AppNotification, type Sidebar as SidebarSection, type Tab } from "../store";
import { providerLabel, useAI } from "../ai";
import { nativePushToken, requestMobileNotificationPermission } from "../notifications";
import { PROJECT_EVENT, type ProjectEvent } from "../projectEvents";
import AvatarMenu from "./AvatarMenu";
import Tabs from "./Tabs";
import Toasts from "./Toasts";
import RepoPicker from "./RepoPicker";
import ExplorerPanel from "../panels/ExplorerPanel";
import DatabasesPanel from "../panels/DatabasesPanel";
import AiSidebar from "../panels/AiSidebar";
import WebSidebar from "../panels/WebSidebar";
import EditorPanel from "../panels/EditorPanel";
import DbPanelTab from "../panels/DbPanelTab";
import AiPanelTab from "../panels/AiPanelTab";
import WebPanelTab from "../panels/WebPanelTab";
import DiffPanelTab from "../panels/DiffPanelTab";
import TerminalPanel from "../panels/TerminalPanel";
import SourceControlPanel from "../panels/SourceControlPanel";
import BrandMark from "@toph/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SettingsDialog from "./SettingsDialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
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
  const toggleTerminal = useApp((state) => state.toggleTerminal);
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
  const branchPattern = useSettings((state) => state.gitBranchPattern);
  const aiConfig = useAI((state) => state.config);

  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [version, setVersion] = useState("0.1.0");
  const [gitStatus, setGitStatus] = useState("");
  const [projectsSheetOpen, setProjectsSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<"general" | "ai" | "workspace" | "git" | "server">("general");
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branchInfo, setBranchInfo] = useState<{ current: string; branches: string[] } | null>(null);
  const [branchBusy, setBranchBusy] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, column: 1, language: "" });
  const loadedProject = useRef<string | null>(null);
  const mobile = document.documentElement.classList.contains("mobile-client");
  const { isMobile, setOpenMobile } = useSidebar();
  const narrow = mobile || isMobile;

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
    const openSettings = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (next === "general" || next === "ai" || next === "workspace" || next === "git" || next === "server") {
        setSettingsCategory(next);
      }
      setSettingsOpen(true);
    };
    window.addEventListener("toph:open-settings", openSettings);
    return () => window.removeEventListener("toph:open-settings", openSettings);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setSidebar("files");
        if (mobile) {
          setOpenMobile(true);
          setProjectsSheetOpen(false);
          setAiPanelOpen(false);
          setTerminalOpen(false);
        }
        setSearchFocusToken((current) => current + 1);
        return;
      }
      if (event.key !== "Escape" || !mobile) return;
      if (document.querySelector(".modal-backdrop, .avatar-menu")) return;
      setOpenMobile(false);
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
    let flushTimer: number | undefined;
    const pending = new Map<string, ProjectEvent>();

    const dispatch = (event: ProjectEvent) => {
      pending.set(`${event.projectId}:${event.type}`, event);
      window.clearTimeout(flushTimer);
      flushTimer = window.setTimeout(() => {
        const events = [...pending.values()];
        pending.clear();
        for (const current of events) {
          window.dispatchEvent(new CustomEvent(PROJECT_EVENT, { detail: current }));
        }
      }, 140);
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
      window.clearTimeout(flushTimer);
      pending.clear();
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
            layout.sidebar === "search" || layout.sidebar === "scm" || layout.sidebar === "settings"
              ? "files"
              : layout.sidebar;
          setSidebar(savedSidebar as SidebarSection);
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
    if (mobile) setOpenMobile(false);
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



  function openMobileSettings() {
    setOpenMobile(false);
    setAiPanelOpen(false);
    setTerminalOpen(false);
    setSettingsOpen(true);
  }





  async function toggleBranchMenu() {
    if (branchMenuOpen) {
      setBranchMenuOpen(false);
      return;
    }
    if (!project) return;
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
    if (mobile) setOpenMobile(false);
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
    if (mobile) setOpenMobile(false);
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
    if (mobile) setOpenMobile(false);
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
    if (mobile) setOpenMobile(false);
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
    if (mobile) setOpenMobile(false);
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
    if (mobile) setOpenMobile(false);
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
    if (mobile) setOpenMobile(false);
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
    if (mobile) setOpenMobile(false);
    openTab({
      id: `web:${project.id}:${target.id}`,
      kind: "web",
      title: target.name,
      projectId: project.id,
      url: target.url,
    });
  }

  async function openRepo(repo: Repository) {
    if (mobile) setOpenMobile(false);
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
      <main className="flex min-h-dvh items-center justify-center bg-background p-4">
        <section className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center shadow-sm">
          <BrandMark size="large" />
          <h1 className="text-xl font-semibold">Bem-vindo ao Toph</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length === 0 ? "Abra um repositório Git do servidor." : "Abra uma aba de projeto para continuar."}
          </p>
          <Button onClick={() => setShowRepoPicker(true)}><FolderPlus size={15} /> Abrir repositório</Button>
        </section>
        {showRepoPicker && <RepoPicker onClose={() => setShowRepoPicker(false)} onOpen={openRepo} />}
        <Toasts />
      </main>
    );
  }

  const activeProjectUnread = activeUnread.length;
  const navItems: Array<{ id: SidebarSection; label: string; icon: typeof FilesIcon }> = [
    { id: "files", label: "Arquivos", icon: FilesIcon },
    { id: "db", label: "Bancos", icon: DatabaseIcon },
    { id: "ai", label: "Agente", icon: Bot },
    { id: "web", label: "Web apps", icon: GlobeIcon },
  ];

  return (
    <>
      <Sidebar collapsible="offcanvas" className="border-e">
        <SidebarHeader className="gap-3 border-b p-3">
          <div className="flex items-center gap-2">
            <BrandMark size="small" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Toph</p>
              <p className="truncate text-[11px] text-muted-foreground">{project.name}</p>
            </div>
          </div>
          <SidebarMenu>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = sidebar === item.id;
              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={active}
                    tooltip={item.label}
                    onClick={() => { if (item.id === "ai") { setSidebar("ai"); toggleAI(); } else setSidebar(item.id); }}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Terminal" onClick={toggleTerminal}>
                <TerminalSquare size={16} />
                <span>Terminal</span>
                {terminalOpen && <span className="ms-auto size-1.5 rounded-full bg-primary" />}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="p-0">
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {project && sidebar === "files" && <ExplorerPanel project={project} onOpenFile={openFile} searchFocusToken={searchFocusToken} onOpenDiff={openDiff} onStatusChange={setGitStatus} />}
            {project && sidebar === "db" && <DatabasesPanel project={project} onOpenQuery={openQuery} onOpenTable={openTable} />}
            {project && sidebar === "ai" && <AiSidebar project={project} onNewSession={newAiSession} onOpenSession={openAiSession} />}
            {project && sidebar === "web" && <WebSidebar onOpenWeb={openWeb} />}
          </div>
        </SidebarContent>
        <SidebarFooter className="border-t p-2">
          <div className="flex items-center justify-between gap-2">
            <AvatarMenu user={user} variant="activity" onSettings={() => setSettingsOpen(true)} />
            <Button variant="ghost" size="icon-sm" aria-label="Configurações" title="Configurações" onClick={() => setSettingsOpen(true)}><Settings2 size={16} /></Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="max-w-[260px] gap-2 px-1.5">
                <Avatar className="size-5"><AvatarFallback className="bg-primary/15 text-[9px] font-semibold text-primary">{project.name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
                <span className="truncate text-xs font-medium">{project.name}</span>
                <ChevronDown size={13} className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <DropdownMenuLabel className="flex items-center justify-between">Projetos abertos <Badge variant="secondary">{openProjectIds.length}</Badge></DropdownMenuLabel>
              {openProjectIds.map((id) => {
                const item = projects.find((projectItem) => projectItem.id === id);
                if (!item) return null;
                const unread = unreadForProject(item.id);
                return (
                  <DropdownMenuItem key={item.id} onSelect={() => switchProject(item.id)} className="gap-2">
                    <Avatar className="size-6"><AvatarFallback className="bg-primary/15 text-[10px] font-semibold text-primary">{item.name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
                    <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-sm">{item.name}</span><span className="truncate text-[11px] text-muted-foreground">{item.root}</span></span>
                    {unread.length > 0 && <Badge>{unread.length > 9 ? "9+" : unread.length}</Badge>}
                    {item.id === activeProjectId && <Check size={14} className="text-primary" />}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setShowRepoPicker(true)} className="gap-2"><FolderPlus size={14} /> Abrir repositório</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex-1" />
          {activeProjectUnread > 0 && (
            <Button variant="ghost" size="icon-sm" className="relative" aria-label="Notificações" onClick={() => openLatestProjectNotification(project.id)}>
              <Bell size={16} />
              <span className="absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">{activeProjectUnread > 9 ? "9+" : activeProjectUnread}</span>
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Configurações" onClick={() => setSettingsOpen(true)}><Settings2 size={16} /></Button>
        </header>

        <Tabs />
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize={aiPanelOpen && !narrow ? "68" : "100"} minSize="30">
            <ResizablePanelGroup orientation="vertical" className="min-h-0">
              <ResizablePanel defaultSize={terminalOpen ? "70" : "100"} minSize="30">
                <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
                  {!activeTab && project && (
                    <Empty className="h-full">
                      <EmptyHeader><EmptyMedia variant="icon"><BrandMark size="large" /></EmptyMedia><EmptyTitle>{project.name}</EmptyTitle><EmptyDescription>{project.root}</EmptyDescription></EmptyHeader>
                      <EmptyContent><div className="flex flex-wrap items-center justify-center gap-2"><Button variant="outline" size="sm" onClick={() => setSidebar("files")}>Explorer</Button><Button variant="outline" size="sm" onClick={() => setSidebar("db")}>Database</Button><Button variant="outline" size="sm" onClick={openAI}>Agente</Button></div></EmptyContent>
                    </Empty>
                  )}
                  {activeTab?.kind === "editor" && project && <EditorPanel tab={activeTab} project={project} onOpenChanges={(path) => openDiff(path, false)} />}
                  {activeTab?.kind === "db" && <DbPanelTab tab={activeTab} />}
                  {activeTab?.kind === "ai" && project && <AiPanelTab tab={activeTab} project={project} />}
                  {activeTab?.kind === "web" && <WebPanelTab tab={activeTab} />}
                  {activeTab?.kind === "diff" && project && <DiffPanelTab tab={activeTab} project={project} />}
                </div>
              </ResizablePanel>
              {terminalOpen && project && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize="30" minSize="15">
                    <TerminalPanel project={project} />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>
          {aiPanelOpen && aiDockTab && !narrow && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize="32" minSize="22" maxSize="50">
                <div className="flex h-full min-h-0 flex-col overflow-hidden border-s bg-background">
                  <AiPanelTab tab={aiDockTab} project={project} onClose={() => setAiPanelOpen(false)} />
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>

        <footer className="flex h-7 shrink-0 items-center justify-between border-t bg-muted/20 px-2 text-[11px] text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button variant="ghost" size="xs" className="h-6 gap-1 px-1.5" onClick={() => void toggleBranchMenu()} aria-expanded={branchMenuOpen}><GitBranch size={12} /><span className="max-w-[220px] truncate">{branch || "detached"}</span><ChevronDown size={12} /></Button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {activeTab?.kind === "editor" && <span>Ln {cursor.line}, Col {cursor.column}</span>}
            {cursor.language && <span>{cursor.language}</span>}
            <span>UTF-8</span><span>LF</span><span>v{version}</span>
          </div>
        </footer>
      </SidebarInset>

      <Sheet open={narrow && aiPanelOpen && Boolean(aiDockTab)} onOpenChange={(open) => !open && setAiPanelOpen(false)}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-md">
          <SheetHeader className="sr-only"><SheetTitle>Agente</SheetTitle><SheetDescription>Painel do agente de IA.</SheetDescription></SheetHeader>
          {aiDockTab && <AiPanelTab tab={aiDockTab} project={project} onClose={() => setAiPanelOpen(false)} />}
        </SheetContent>
      </Sheet>

      <Dialog open={branchMenuOpen && Boolean(project)} onOpenChange={(open) => !open && setBranchMenuOpen(false)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="sr-only"><DialogTitle>Git</DialogTitle><DialogDescription>Branches e commit.</DialogDescription></DialogHeader>
          <div className="grid min-h-[520px] grid-cols-1 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="flex min-h-0 flex-col border-b md:border-b-0 md:border-e">
              <div className="flex items-center justify-between border-b px-3 py-2"><div className="flex items-center gap-2"><GitBranch size={14} /><span className="text-sm font-medium">Branches</span><Badge variant="secondary">{branchInfo ? branchInfo.branches.length : "..."}</Badge></div><span className="truncate text-xs text-muted-foreground">{branchInfo?.current || branch || "detached"}</span></div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {branchInfo ? sortedBranches.map((name) => (
                  <Button key={name} variant={name === branchInfo.current ? "secondary" : "ghost"} className="mb-0.5 h-8 w-full justify-start px-2" disabled={Boolean(branchBusy)} onClick={() => void checkoutBranch(name)}><GitBranch size={13} className="text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-start">{name}</span>{name === branchInfo.current && <Check size={14} className="text-primary" />}</Button>
                )) : <p className="px-2 py-6 text-center text-sm text-muted-foreground">Carregando branches...</p>}
              </div>
              <form className="flex flex-col gap-2 border-t p-2" onSubmit={(event) => void createBranchFromMenu(event)}>
                <Input value={newBranchName} onChange={(event) => setNewBranchName(event.target.value)} placeholder="nome-da-branch" aria-label="Nome da nova branch" />
                <div className="flex items-center gap-2"><Button type="button" variant="ghost" size="sm" disabled={Boolean(branchBusy)} onClick={() => void generateBranchName()}><Bot size={13} /> Gerar</Button><Button type="submit" size="sm" className="ms-auto" disabled={!newBranchName.trim() || Boolean(branchBusy)}>Criar branch</Button></div>
              </form>
            </section>
            <section className="flex min-h-0 flex-col"><div className="border-b px-3 py-2 text-sm font-medium">Commit</div><div className="min-h-0 flex-1 overflow-y-auto p-2"><SourceControlPanel project={project} embedded view="commit" onOpenDiff={openDiff} onStatusChange={setGitStatus} /></div></section>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={narrow && projectsSheetOpen} onOpenChange={(open) => !open && setProjectsSheetOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Projetos abertos</DialogTitle><DialogDescription>Alterne entre os projetos deste workspace.</DialogDescription></DialogHeader>
          <div className="flex flex-col gap-1">
            {openProjectIds.map((id) => {
              const item = projects.find((projectItem) => projectItem.id === id);
              if (!item) return null;
              const unread = unreadForProject(item.id);
              return (
                <div key={item.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => { setProjectsSheetOpen(false); switchProject(item.id); }}><Avatar className="size-7"><AvatarFallback className="bg-primary/15 text-[10px] font-semibold text-primary">{item.name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar><span className="flex min-w-0 flex-col"><span className="truncate text-sm">{item.name}</span><span className="truncate text-[11px] text-muted-foreground">{item.root}</span></span>{item.id === activeProjectId && <Check size={16} className="ms-auto text-primary" />}</button>
                  {unread.length > 0 && <Button variant="ghost" size="icon-sm" onClick={() => { setProjectsSheetOpen(false); switchProject(item.id); openLatestProjectNotification(item.id); }}><Bell size={15} /></Button>}
                  <Button variant="ghost" size="icon-sm" aria-label={`Fechar ${item.name}`} onClick={() => void closeProject(item.id)}><X size={15} /></Button>
                </div>
              );
            })}
          </div>
          <Button variant="outline" className="justify-start" onClick={() => { setProjectsSheetOpen(false); setShowRepoPicker(true); }}><Plus size={16} /> Abrir projeto</Button>
          <DialogFooter><Button variant="ghost" size="sm" onClick={() => { setProjectsSheetOpen(false); openMobileSettings(); }}><Settings2 size={16} /> Configurações</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {showRepoPicker && <RepoPicker onClose={() => setShowRepoPicker(false)} onOpen={openRepo} />}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} version={version} initialCategory={settingsCategory} />
      <Toasts />
    </>
  );
}
