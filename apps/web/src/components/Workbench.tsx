import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Bell, Bot, Check, ChevronDown, ChevronRight, CircleAlert, FolderGit2, FolderPlus, GitBranch, Plus, Search, Settings2, TerminalSquare, X } from "@toph/icons";
import { api, getApiBase, type Repository, type SchemaTable, type WebTarget } from "../api";
import { basename, expandGitPattern, languageFor, quoteIdentifier, sanitizeBranchName } from "../lib";
import { useApp, type AppNotification, type Sidebar, type Tab } from "../store";
import { useBots, type BotWorkspace } from "../bots";
import { useAI } from "../ai";
import { nativePushToken, requestMobileNotificationPermission } from "../notifications";
import { PROJECT_EVENT, type ProjectEvent } from "../projectEvents";
import ActivityBar from "./ActivityBar";
import AvatarMenu from "./AvatarMenu";
import MobileNav from "./MobileNav";
import Tabs from "./Tabs";
import TopBar from "./TopBar";
import QuickOpen from "./QuickOpen";
import Toasts from "./Toasts";
import RepoPicker from "./RepoPicker";
import ExplorerPanel from "../panels/ExplorerPanel";
import DatabasesPanel from "../panels/DatabasesPanel";
import WebSidebar from "../panels/WebSidebar";
import EditorPanel from "../panels/EditorPanel";
import DbPanelTab from "../panels/DbPanelTab";
import BotStudioTab from "../panels/BotStudioTab";
import BotsSidebar from "./BotsSidebar";
import WebPanelTab from "../panels/WebPanelTab";
import DiffPanelTab from "../panels/DiffPanelTab";
import TerminalPanel from "../panels/TerminalPanel";
import SourceControlPanel from "../panels/SourceControlPanel";
import BrandMark from "@toph/brand";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";
import { Badge } from "@/boardui/base/badges/badge";
import { Avatar } from "@/boardui/base/avatar/avatar";
import { Checkbox } from "@/boardui/base/checkbox/checkbox";
import { Radio, RadioGroup } from "@/boardui/base/radio/radio";
import { Dropdown, DropdownDivider, DropdownGroup, DropdownItem, DropdownPopover, DropdownTrigger } from "@/boardui/base/dropdown/dropdown";
import { Kbd } from "@/boardui/base/kbd/kbd";
import { Modal } from "@/boardui/base/modal/modal";
import ResizeHandle from "../ui/resize";
import { useIsMobile } from "../ui/useIsMobile";
import { useSettings } from "../settings";
import { useConfirm } from "../ui/confirm";
import { cx } from "@/boardui/utils/cx";
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
  const closeTab = useApp((state) => state.closeTab);
  const setActiveTab = useApp((state) => state.setActiveTab);
  const openTab = useApp((state) => state.openTab);
  const sidebar = useApp((state) => state.sidebar);
  const setSidebar = useApp((state) => state.setSidebar);
  const terminalOpen = useApp((state) => state.terminalOpen);
  const setTerminalOpen = useApp((state) => state.setTerminalOpen);
  const notify = useApp((state) => state.notify);
  const notifications = useApp((state) => state.notifications);
  const markProjectNotificationsRead = useApp((state) => state.markProjectNotificationsRead);
  const botWorkspace = useBots((state) => activeProjectId ? state.byProject[activeProjectId] : undefined);
  const loadBots = useBots((state) => state.load);
  const snapshotBots = useBots((state) => state.snapshot);
  const loadAI = useAI((state) => state.load);
  const loadModels = useAI((state) => state.loadModels);
  const branchPattern = useSettings((state) => state.gitBranchPattern);
  const commitPattern = useSettings((state) => state.gitCommitPattern);
  const aiConfig = useAI((state) => state.config);
  const sidebarWidth = useSettings((state) => state.sidebarWidth);
  const updateSettings = useSettings((state) => state.update);
  const confirm = useConfirm();

  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [version, setVersion] = useState("0.1.0");
  const [gitStatus, setGitStatus] = useState("");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mobileTerminalOpen, setMobileTerminalOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const mobilePullStart = useRef<number | null>(null);
  const [projectsSheetOpen, setProjectsSheetOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [gitSettingsOpen, setGitSettingsOpen] = useState(false);
  const [quickOpenToken, setQuickOpenToken] = useState(0);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const menuVisible = useSettings((state) => state.menuVisible);
  const activityVisible = useSettings((state) => state.activityVisible);
  const sidebarVisible = useSettings((state) => state.sidebarVisible);
  const statusVisible = useSettings((state) => state.statusVisible);
  const primarySideBarPosition = useSettings((state) => state.primarySideBarPosition);
  const panelAlignment = useSettings((state) => state.panelAlignment);
  const quickInputPosition = useSettings((state) => state.quickInputPosition);
  const tabHistory = useRef<string[]>([]);
  const tabHistoryIndex = useRef(-1);
  const navigatingHistory = useRef(false);
  const [projectsMenuOpen, setProjectsMenuOpen] = useState(false);
  const [branchInfo, setBranchInfo] = useState<{ current: string; branches: string[] } | null>(null);
  const [branchBusy, setBranchBusy] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [branchError, setBranchError] = useState("");
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, column: 1, language: "" });
  const loadedProject = useRef<string | null>(null);
  const mobile = useIsMobile();

  const project = projects.find((item) => item.id === activeProjectId) ?? null;
  const closedProjects = projects.filter((item) => !openProjectIds.includes(item.id));
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
  const visibleBranches = sortedBranches.filter((name) =>
    name.toLowerCase().includes(branchFilter.trim().toLowerCase()),
  );

  useEffect(() => {
    void loadAI().then(() => loadModels());
  }, [loadAI, loadModels]);

  useEffect(() => {
    if (!activeTabId) return;
    if (navigatingHistory.current) { navigatingHistory.current = false; return; }
    const history = tabHistory.current;
    const existing = history.indexOf(activeTabId);
    const next = existing >= 0 ? history.slice(0, existing + 1) : [...history, activeTabId];
    tabHistory.current = next.slice(-50);
    tabHistoryIndex.current = tabHistory.current.length - 1;
  }, [activeTabId]);

  function navigateHistory(direction: -1 | 1) {
    const nextIndex = tabHistoryIndex.current + direction;
    const next = tabHistory.current[nextIndex];
    if (!next) return;
    navigatingHistory.current = true;
    tabHistoryIndex.current = nextIndex;
    setActiveTab(next);
  }

  useEffect(() => {
    const openQuick = () => setQuickOpenToken((current) => current + 1);
    window.addEventListener("toph:quick-open", openQuick);
    return () => window.removeEventListener("toph:quick-open", openQuick);
  }, []);

  useEffect(() => {
    const closeMobilePanel = () => setMobilePanelOpen(false);
    window.addEventListener("toph:close-mobile-panel", closeMobilePanel);
    return () => window.removeEventListener("toph:close-mobile-panel", closeMobilePanel);
  }, []);

  useEffect(() => {
    const openTerminal = () => {
      if (mobile) {
        setMobilePanelOpen(false);
        setMobileTerminalOpen(true);
      } else {
        setTerminalOpen(!useApp.getState().terminalOpen);
      }
    };
    window.addEventListener("toph:open-terminal", openTerminal);
    return () => window.removeEventListener("toph:open-terminal", openTerminal);
  }, [mobile, setTerminalOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("toph:editor-command", { detail: { command: "editor.action.quickCommand" } }));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        if (mobile) {
          setSidebar("files");
          setMobilePanelOpen(true);
          setProjectsSheetOpen(false);
          setTerminalOpen(false);
          setSearchFocusToken((current) => current + 1);
        } else {
          setQuickOpenToken((current) => current + 1);
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b" && !event.altKey) {
        event.preventDefault();
        updateSettings({ sidebarVisible: !useSettings.getState().sidebarVisible });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setTerminalOpen(!useApp.getState().terminalOpen);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setLayoutOpen(true);
        return;
      }
      if (event.key !== "Escape" || !mobile) return;
      if (document.querySelector(".modal-backdrop, .avatar-menu")) return;
      setMobilePanelOpen(false);
      setProjectsSheetOpen(false);
      setMobileControlsOpen(false);
      setTerminalOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [mobile, setSidebar, setTerminalOpen]);

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
      if (state.sidebar === "bots") return;
      state.addNotification({
        kind: "ai",
        title: payload.title?.trim() || "Resposta da IA",
        body: payload.body?.trim() || "A IA terminou de responder.",
        projectId: state.activeProjectId ?? undefined,
        tabId: state.activeProjectId ? `bots:${state.activeProjectId}` : undefined,
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
    setTerminalOpen(true);
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
        loadBots(activeProjectId, layout.bots as BotWorkspace | null | undefined);
        if (layout.sidebar) {
          const savedSidebar =
            layout.sidebar === "search" || layout.sidebar === "scm" || layout.sidebar === "settings"
              ? "files"
              : layout.sidebar;
          setSidebar(savedSidebar as Sidebar);
        }
        setTerminalOpen(typeof layout.terminalOpen === "boolean" ? layout.terminalOpen : true);
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
  }, [activeProjectId, loadBots, notify, setSidebar, setTabs, setTerminalOpen]);

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
      tabs.map(({ content: _content, hash: _hash, dirty: _dirty, autoRun: _autoRun, ...rest }) => rest),
    [tabs],
  );
  const layoutKey = JSON.stringify({
    tabs: layoutTabs,
    activeTabId,
    sidebar,
    terminalOpen,
    bots: botWorkspace,
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
          bots: snapshotBots(activeProjectId),
        })
        .catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activeProjectId, layoutKey, layoutTabs, terminalOpen, sidebar, activeTabId, botWorkspace, snapshotBots]);

  function switchProject(next: string) {
    if (next === activeProjectId) return;
    if (mobile) setMobilePanelOpen(false);
    if (project && loadedProject.current === project.id) {
      void api.saveLayout(project.id, {
        tabs: layoutTabs,
        activeTabId,
        sidebar,
        terminalOpen,
        bots: snapshotBots(project.id),
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
    setMobileControlsOpen(false);
    setMobilePanelOpen(true);
    setMobileTerminalOpen(false);
  }





  async function loadBranches() {
    if (!project) return;
    setBranchInfo(null);
    setBranchError("");
    try {
      setBranchInfo(await api.gitBranches(project.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível listar as branches.";
      setBranchError(/not a git repository/i.test(message)
        ? "Esta pasta não é um repositório Git. Abra um repositório Git para gerenciar branches."
        : message);
      setBranchInfo({ current: "", branches: [] });
    }
  }

  async function toggleBranchMenu() {
    if (branchMenuOpen) {
      setBranchMenuOpen(false);
      setGitSettingsOpen(false);
      return;
    }
    if (!project) return;
    setGitSettingsOpen(false);
    setBranchMenuOpen(true);
    setNewBranchName("");
    setBranchFilter("");
    setBranchInfo(null);
    void loadBranches();
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

  function openNotification(notification: AppNotification) {
    if (!notification.projectId) return;
    setBranchMenuOpen(false);
    setProjectsSheetOpen(false);
    markProjectNotificationsRead(notification.projectId);
    if (notification.projectId !== activeProjectId) setActiveProject(notification.projectId);
    setSidebar("bots");
    if (mobile) setMobilePanelOpen(false);
    setTerminalOpen(false);
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
    const next = await api.createProject(repo.name, repo.path, "#FFB547");
    setActiveProject(next.id);
    setProjects([...projects, next]);
    setShowRepoPicker(false);
    notify("success", `Opened ${next.name}.`);
  }

  async function closeProject(id: string) {
    const target = projects.find((item) => item.id === id);
    if (!target) return;
    const ok = await confirm({
      title: "Fechar projeto?",
      message: `Fechar ${target.name}? Isso encerra terminais, abas de banco, web e agentes deste projeto. Ele continua disponível para reabrir.`,
      confirmLabel: "Fechar projeto",
    });
    if (!ok) return;
    if (activeProjectId === id && loadedProject.current === id) {
      await api
        .saveLayout(id, {
          tabs: layoutTabs,
          activeTabId,
          sidebar,
          terminalOpen,
          bots: snapshotBots(id),
        })
        .catch(() => undefined);
    }
    try {
      await api.closeProjectTerminals(id);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not stop project terminals.");
    }
    if (activeProjectId === id) loadedProject.current = null;
    closeProjectTab(id);
    notify("info", `Projeto ${target.name} fechado. Processos e abas encerrados.`);
  }

  if (projects.length === 0 || !project) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <section className="bg-background-primary-default flex w-full max-w-md flex-col items-center gap-4 rounded-lg border p-8 text-center">
          <BrandMark size="large" />
          <h1 className="text-title-2-medium text-text-primary">Bem-vindo ao Toph</h1>
          <p className="text-body-regular text-text-secondary">
            {projects.length === 0 ? "Abra um repositório Git do servidor." : "Escolha um projeto para reabrir ou abra outro repositório."}
          </p>
          {projects.length > 0 && (
            <div className="flex max-h-48 w-full flex-col gap-1 overflow-y-auto">
              {projects.map((item) => (
                <Button key={item.id} variant="secondary" size="small" className="justify-start" leadingIcon={FolderGit2} onClick={() => switchProject(item.id)}>{item.name}</Button>
              ))}
            </div>
          )}
          <Button leadingIcon={FolderPlus} onClick={() => setShowRepoPicker(true)}>Abrir repositório</Button>
        </section>
        {showRepoPicker && <RepoPicker onClose={() => setShowRepoPicker(false)} onOpen={openRepo} />}
        <Toasts />
      </main>
    );
  }

  const activeProjectUnread = activeUnread.length;

  const SidebarContent = () => (
    <>
      {project && sidebar === "files" && <ExplorerPanel project={project} onOpenFile={openFile} searchFocusToken={searchFocusToken} onStatusChange={setGitStatus} />}
      {project && sidebar === "db" && <DatabasesPanel project={project} onOpenQuery={openQuery} onOpenTable={openTable} />}
      {project && sidebar === "scm" && <SourceControlPanel project={project} view="scm" onOpenDiff={openDiff} onStatusChange={setGitStatus} />}
      {project && sidebar === "web" && <WebSidebar onOpenWeb={openWeb} />}
      {project && sidebar === "bots" && <BotsSidebar project={project} />}
    </>
  );

  const primaryOnLeft = primarySideBarPosition === "left";
  const panelJustifyClass = panelAlignment === "left"
    ? "justify-start"
    : panelAlignment === "right"
      ? "justify-end"
      : panelAlignment === "center"
        ? "justify-center"
        : "justify-start";
  const panelWidthClass = panelAlignment === "justify" ? "w-full" : "w-[85%]";

  const primarySidebar = !mobile && sidebarVisible && activityVisible ? (
    <div className="flex min-h-0 shrink-0 overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar">
      <ActivityBar />
      <aside className="flex min-h-0 w-[var(--sidebar-width)] shrink-0 flex-col overflow-hidden bg-background-primary-default">
        <SidebarContent />
      </aside>
    </div>
  ) : null;
  const primaryResize = !mobile && sidebarVisible && activityVisible ? (
    <ResizeHandle className="sidebar-resize" orientation="vertical" value={sidebarWidth} min={220} max={460} invert={!primaryOnLeft} label="Resize sidebar" onChange={(width) => document.documentElement.style.setProperty("--sidebar-width", `${width}px`)} onCommit={(width) => updateSettings({ sidebarWidth: width })} />
  ) : null;
  const headerBranch = statusVisible ? (
    <>
      <Button variant="ghost" size="xs" title={branch || "detached"} className="h-6 min-w-0 max-w-[220px] gap-1 px-1.5" onClick={() => void toggleBranchMenu()} aria-expanded={branchMenuOpen}>
        <GitBranch size={12} className="shrink-0" /><span className="min-w-0 flex-1 truncate text-start">{branch || "detached"}</span><ChevronDown size={12} className="shrink-0" />
      </Button>
      <Dropdown isOpen={projectsMenuOpen} onOpenChange={setProjectsMenuOpen}>
        <DropdownTrigger className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-background-primary-hover">
          <Avatar size="xs" initials={project.name.slice(0, 1).toUpperCase()} className="bg-background-tertiary-default text-caption-2-semibold" style={{ color: project.color }} />
          <span className="max-w-[110px] truncate text-caption-2-regular">{project.name}</span>
          <Badge color="neutral" className="h-4 px-1 text-caption-2-regular">{openProjectIds.length}</Badge>
          <ChevronDown size={12} />
        </DropdownTrigger>
        <DropdownPopover aria-label="Projetos abertos" placement="bottom start" className="w-80">
          <DropdownGroup label={`Projetos abertos · ${openProjectIds.length}`}>
            {openProjectIds.map((id) => {
              const item = projects.find((projectItem) => projectItem.id === id);
              if (!item) return null;
              const unread = unreadForProject(item.id);
              return (
                <div key={item.id} className="flex items-center gap-1">
                  <DropdownItem className="min-w-0 flex-1" onSelect={() => { setProjectsMenuOpen(false); switchProject(item.id); }}>
                    <Avatar size="sm" initials={item.name.slice(0, 1).toUpperCase()} className="bg-background-tertiary-default text-caption-2-semibold" style={{ color: item.color }} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body-2-medium text-text-primary">{item.name}</span>
                      <span className="truncate text-caption-1-regular text-text-secondary">{item.root}</span>
                    </span>
                    {unread.length > 0 && <Badge color="primary">{unread.length > 9 ? "9+" : unread.length}</Badge>}
                    {item.id === activeProjectId && <Check size={14} className="text-accent-500" />}
                  </DropdownItem>
                  <Button variant="ghost" size="xs" iconOnly leadingIcon={X} aria-label={`Fechar ${item.name}`} title="Fechar projeto" onClick={(event) => { event.stopPropagation(); setProjectsMenuOpen(false); void closeProject(item.id); }} />
                </div>
              );
            })}
          </DropdownGroup>
          {closedProjects.length > 0 && (
            <>
              <DropdownDivider />
              <DropdownGroup label="Projetos fechados">
                {closedProjects.map((item) => (
                  <DropdownItem key={item.id} onSelect={() => { setProjectsMenuOpen(false); switchProject(item.id); }}>
                    <FolderGit2 size={14} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body-2-medium text-text-primary">{item.name}</span>
                      <span className="truncate text-caption-1-regular text-text-secondary">{item.root}</span>
                    </span>
                  </DropdownItem>
                ))}
              </DropdownGroup>
            </>
          )}
          <DropdownDivider />
          <DropdownGroup>
            <DropdownItem onSelect={() => { setProjectsMenuOpen(false); setShowRepoPicker(true); }}><FolderPlus size={14} /> Abrir repositório</DropdownItem>
          </DropdownGroup>
        </DropdownPopover>
      </Dropdown>
      {activeProjectUnread > 0 && (
        <Button variant="ghost" size="xs" className="h-6 gap-1 px-1.5" onClick={() => openLatestProjectNotification(project.id)}>
          <Bell size={11} /> {activeProjectUnread > 9 ? "9+" : activeProjectUnread}
        </Button>
      )}
    </>
  ) : null;

  const headerStatus = statusVisible ? (
    <>
      {activeTab?.kind === "editor" && <span>Ln {cursor.line}, Col {cursor.column}</span>}
      {cursor.language && <span>{cursor.language}</span>}
      <span>v{version}</span>
    </>
  ) : null;

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-background-full"
      style={mobile ? { height: "min(var(--visual-viewport-height, 100dvh), calc(100dvh - var(--keyboard-inset, 0px)))" } : undefined}
      onTouchStart={(event) => {
        if (!mobile) return;
        const y = event.touches[0]?.clientY;
        if (y !== undefined && y <= 36) mobilePullStart.current = y;
      }}
      onTouchMove={(event) => {
        if (!mobile || mobilePullStart.current === null) return;
        const y = event.touches[0]?.clientY;
        if (y !== undefined && y - mobilePullStart.current > 54) {
          setMobileControlsOpen(true);
          setMobilePanelOpen(false);
          setMobileTerminalOpen(false);
          mobilePullStart.current = null;
        }
      }}
      onTouchEnd={() => { mobilePullStart.current = null; }}
    >
      {mobile && mobileControlsOpen && project && (
        <div className="fixed inset-0 z-[90]">
          <button type="button" aria-label="Fechar controles" className="absolute inset-0 bg-black/50" onClick={() => setMobileControlsOpen(false)} />
          <section className="absolute inset-x-2 top-[calc(var(--safe-top)+0.5rem)] rounded-3xl border border-border-button-white bg-background-secondary-default p-3 shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-button-default" />
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-1.5 py-1 text-start hover:bg-background-primary-hover"
                onClick={() => { setMobileControlsOpen(false); setMobileTerminalOpen(false); setProjectsSheetOpen(true); }}
                aria-label="Abrir projetos"
              >
                <Avatar size="sm" initials={project.name.slice(0, 1).toUpperCase()} className="bg-background-tertiary-default text-caption-2-semibold" style={{ color: project.color }} />
                <span className="max-w-[150px] truncate text-body-2-medium font-medium">{project.name}</span>
                <Badge color="neutral">{openProjectIds.length}</Badge>
                <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
              </button>
              {activeProjectUnread > 0 && (
                <Button variant="ghost" size="xs" className="relative size-9" onClick={() => { setMobileControlsOpen(false); openLatestProjectNotification(project.id); }} aria-label="Abrir notificação mais recente">
                  <Bell size={17} />
                  <span className="absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">{activeProjectUnread > 9 ? "9+" : activeProjectUnread}</span>
                </Button>
              )}
              <AvatarMenu user={user} variant="titlebar" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" size="small" leadingIcon={Search} className="justify-start" onClick={() => { setMobileControlsOpen(false); setMobileSearchOpen(true); setQuickOpenToken((value) => value + 1); }}>Buscar</Button>
              <Button variant="secondary" size="small" leadingIcon={TerminalSquare} className="justify-start" onClick={() => { setMobileControlsOpen(false); setMobilePanelOpen(false); setMobileTerminalOpen(true); }}>Terminal</Button>
            </div>
          </section>
        </div>
      )}

      {!mobile && (
        <TopBar
          project={project}
          quickOpenToken={quickOpenToken}
          onOpenFile={openFile}
          onOpenRepo={() => setShowRepoPicker(true)}
          onCloseTab={() => { if (activeTabId) closeTab(activeTabId); }}
          onBack={() => navigateHistory(-1)}
          onForward={() => navigateHistory(1)}
          onSidebar={setSidebar}
          onToggleTerminal={() => setTerminalOpen(!useApp.getState().terminalOpen)}
          onShowTerminal={() => setTerminalOpen(true)}
          onCustomizeLayout={() => setLayoutOpen(true)}
          onToggleActivity={() => updateSettings({ activityVisible: !useSettings.getState().activityVisible })}
          onToggleSidebar={() => updateSettings({ sidebarVisible: !useSettings.getState().sidebarVisible })}
          sidebarVisible={sidebarVisible}
          onToggleStatus={() => updateSettings({ statusVisible: !useSettings.getState().statusVisible })}
          statusVisible={statusVisible}
          onAbout={() => setAboutOpen(true)}
          onShortcuts={() => setShortcutsOpen(true)}
          menuVisible={menuVisible}
          showQuickOpen={quickInputPosition === "top"}
          headerLeft={headerBranch}
          headerRight={headerStatus}
        />
      )}

      <div
        className={cx("flex min-h-0 flex-1 p-1", sidebar === "bots" ? "gap-3" : "gap-1")}
        style={mobile ? { paddingTop: "calc(var(--safe-top) + 0.5rem)" } : undefined}
      >
        {primaryOnLeft && primarySidebar}
        {primaryOnLeft && primaryResize}
        {mobile && mobilePanelOpen && (
          <aside className="fixed inset-x-2 bottom-[calc(4.5rem+var(--safe-bottom))] top-[calc(var(--safe-top)+0.5rem)] z-40 flex flex-col overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b px-2">
              <Button variant="ghost" size="xs" iconOnly leadingIcon={ArrowLeft} aria-label="Voltar" onClick={() => setMobilePanelOpen(false)} />
              <span className="text-body-medium text-text-primary">{sidebar === "db" ? "Bancos" : sidebar === "web" ? "Web apps" : sidebar === "ai" ? "Agente" : sidebar === "bots" ? "Bots" : sidebar === "scm" ? "Source Control" : "Arquivos"}</span>
            </div>
            <SidebarContent />
          </aside>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          <main className={cx(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
            sidebar === "bots" && project ? "bg-transparent" : "rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar",
          )}>
            {sidebar === "bots" && project ? (
              <BotStudioTab project={project} />
            ) : (
              <>
                <Tabs />
                <div className="relative flex min-h-0 flex-1 overflow-hidden">
                  {!activeTab && project && (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
                      <BrandMark size="large" />
                      <h2 className="text-title-2-medium text-text-primary">{project.name}</h2>
                      <p className="max-w-lg text-body-regular text-text-secondary">{project.root}</p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button variant="secondary" size="small" onClick={() => setSidebar("files")}>Explorer</Button>
                        <Button variant="secondary" size="small" onClick={() => setSidebar("db")}>Database</Button>
                        <Button variant="secondary" size="small" onClick={() => setSidebar("bots")}>Bots</Button>
                      </div>
                    </div>
                  )}
                  {activeTab?.kind === "editor" && project && <EditorPanel tab={activeTab} project={project} onOpenChanges={(path) => openDiff(path, false)} />}
                  {activeTab?.kind === "db" && <DbPanelTab tab={activeTab} />}
                  {activeTab?.kind === "web" && <WebPanelTab tab={activeTab} />}
                  {activeTab?.kind === "diff" && project && <DiffPanelTab tab={activeTab} project={project} />}
                  {quickInputPosition === "center" && !mobile && (
                    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center px-4">
                      <div className="pointer-events-auto w-[min(640px,82%)]">
                        <QuickOpen project={project} focusToken={quickOpenToken} onOpenFile={openFile} floating />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </main>

          {project && !mobile && sidebar !== "bots" && (
            <div className={terminalOpen ? `flex w-full shrink-0 ${panelJustifyClass}` : "hidden"}>
              <div className={panelWidthClass}>
                <TerminalPanel key={project.id} project={project} onOpenFile={openFile} />
              </div>
            </div>
          )}
        </div>

        {!primaryOnLeft && primaryResize}
        {!primaryOnLeft && primarySidebar}

        {mobile && project && mobileTerminalOpen && (
          <>
            <button type="button" aria-label="Fechar terminal" className="fixed inset-0 bottom-[calc(4.5rem+var(--safe-bottom))] z-30 bg-black/40" onClick={() => setMobileTerminalOpen(false)} />
            <div className="fixed inset-x-2 bottom-[calc(4.5rem+var(--safe-bottom))] z-40 flex h-[72dvh] flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default shadow-2xl">
              <div className="flex h-7 shrink-0 items-center justify-center">
                <span className="h-1 w-10 rounded-full bg-border-button-default" />
              </div>
              <div className="min-h-0 flex-1">
                <TerminalPanel key={`mobile:${project.id}`} project={project} onOpenFile={openFile} sheet onClose={() => setMobileTerminalOpen(false)} />
              </div>
            </div>
          </>
        )}

      </div>


      <Modal
        isOpen={branchMenuOpen && Boolean(project)}
        onClose={() => { setBranchMenuOpen(false); setGitSettingsOpen(false); }}
        title="Git"
        description="Branches, alterações e commit."
        size="full"
        className="max-w-5xl"
        bodyClassName="p-0"
      >
        <div className="grid min-h-[560px] grid-cols-1 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <section className="flex min-h-0 flex-col border-b bg-background-secondary-default/25 md:border-b-0 md:border-e">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-500"><GitBranch size={16} /></span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <strong className="text-body-medium text-text-primary">Branches</strong>
                    <Badge color="neutral">{branchInfo ? branchInfo.branches.length : "..."}</Badge>
                  </div>
                  <p className="truncate text-caption-1-regular text-text-secondary">{branchInfo?.current || branch || "detached"}</p>
                </div>
              </div>
              <Button variant={gitSettingsOpen ? "secondary" : "ghost"} size="xs" iconOnly leadingIcon={Settings2} aria-label="Configurações Git" title="Configurações Git" onClick={() => setGitSettingsOpen((value) => !value)} />
            </div>

            {gitSettingsOpen ? (
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="xs" iconOnly leadingIcon={ArrowLeft} aria-label="Voltar" onClick={() => setGitSettingsOpen(false)} />
                  <strong className="text-body-2-medium text-text-primary">Configurações Git</strong>
                </div>
                <Input label="Padrão de branch" value={branchPattern} onChange={(value) => updateSettings({ gitBranchPattern: value })} />
                <Input label="Padrão de commit" value={commitPattern} onChange={(value) => updateSettings({ gitCommitPattern: value })} />
                <p className="rounded-xl border border-border-button-default bg-background-primary-default p-3 text-caption-1-regular leading-relaxed text-text-secondary">
                  Tokens: {"{date}"}, {"{time}"}, {"{datetime}"}, {"{repo}"}, {"{branch}"}, {"{user}"}, {"{task}"}, {"{slug}"} e {"{summary}"}.
                </p>
                <Button variant="secondary" size="small" className="self-start" onClick={() => setGitSettingsOpen(false)}>Voltar para branches</Button>
              </div>
            ) : (
              <>
                <div className="px-4 py-3">
                  <Input value={branchFilter} onChange={setBranchFilter} placeholder="Filtrar branches" aria-label="Filtrar branches" leadingIcon={Search} />
                </div>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
                  {branchError ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                      <span className="flex size-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-500"><CircleAlert size={20} /></span>
                      <strong className="text-body-2-medium text-text-primary">Não foi possível carregar as branches</strong>
                      <p className="max-w-xs text-caption-1-regular text-text-secondary">{branchError}</p>
                      <Button variant="secondary" size="small" onClick={() => void loadBranches()}>Tentar novamente</Button>
                    </div>
                  ) : branchInfo ? visibleBranches.map((name) => {
                    const current = name === branchInfo.current;
                    return (
                      <button
                        key={name}
                        type="button"
                        disabled={Boolean(branchBusy)}
                        onClick={() => void checkoutBranch(name)}
                        className={cx(
                          "group flex h-10 w-full items-center gap-2.5 rounded-xl border px-2.5 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                          current
                            ? "border-border-button-default bg-background-primary-default shadow-xs"
                            : "border-transparent hover:border-border-button-default hover:bg-background-primary-hover",
                        )}
                      >
                        <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-lg", current ? "bg-accent-500/15 text-accent-500" : "bg-background-secondary-default text-foreground-icon-secondary")}>
                          <GitBranch size={14} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-body-2-medium text-text-primary">{name}</span>
                        {current ? (
                          <span className="flex shrink-0 items-center gap-1 text-caption-1-regular text-accent-500"><Check size={13} /> atual</span>
                        ) : (
                          <ChevronRight size={13} className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
                        )}
                      </button>
                    );
                  }) : <p className="px-2 py-8 text-center text-body-regular text-text-secondary">Carregando branches...</p>}
                  {!branchError && branchInfo && visibleBranches.length === 0 && <p className="px-2 py-8 text-center text-body-regular text-text-secondary">Nenhuma branch encontrada.</p>}
                </div>
                {!branchError && (
                  <form className="flex flex-col gap-2 border-t bg-background-primary-default p-3" onSubmit={(event) => void createBranchFromMenu(event)}>
                    <div className="flex items-center justify-between">
                      <span className="text-caption-1-semibold uppercase tracking-wide text-text-secondary">Nova branch</span>
                      <Button type="button" variant="ghost" size="xs" leadingIcon={Bot} disabled={Boolean(branchBusy)} onClick={() => void generateBranchName()}>Gerar nome</Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input value={newBranchName} onChange={setNewBranchName} placeholder="nome-da-branch" aria-label="Nome da nova branch" />
                      <Button type="submit" size="small" className="shrink-0" disabled={!newBranchName.trim() || Boolean(branchBusy)}>Criar</Button>
                    </div>
                  </form>
                )}
              </>
            )}
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="border-b px-4 py-3">
              <strong className="text-body-medium text-text-primary">Commit e alterações</strong>
              <p className="text-caption-1-regular text-text-secondary">Revise as alterações e descreva o commit.</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3"><SourceControlPanel project={project} embedded view="scm" onOpenDiff={openDiff} onStatusChange={setGitStatus} /></div>
          </section>
        </div>
      </Modal>

      <Modal
        isOpen={mobile && projectsSheetOpen}
        onClose={() => setProjectsSheetOpen(false)}
        title="Projetos"
        description="Abertos, fechados e repositórios."
        size="sm"
        placement="bottom"
        bodyClassName="p-3"
      >
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-border-button-default bg-background-secondary-default/50 p-2 ps-3">
          <GitBranch size={15} className="shrink-0 text-accent-500" />
          <span className="min-w-0 flex-1 truncate text-caption-1-regular text-text-secondary">{branch || "detached"}</span>
          <Button variant="secondary" size="xs" onClick={() => { setProjectsSheetOpen(false); void toggleBranchMenu(); }}>Branch</Button>
        </div>

        <div className="px-1 pb-1 text-caption-2-semibold uppercase tracking-wide text-text-tertiary">Abertos</div>
        <div className="flex flex-col gap-1">
          {openProjectIds.map((id) => {
            const item = projects.find((projectItem) => projectItem.id === id);
            if (!item) return null;
            const unread = unreadForProject(item.id);
            return (
              <div key={item.id} className="flex items-center gap-2 rounded-xl border border-border-button-default bg-background-primary-default px-2 py-1.5">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-start" onClick={() => { setProjectsSheetOpen(false); switchProject(item.id); }}>
                  <Avatar size="sm" initials={item.name.slice(0, 1).toUpperCase()} className="bg-background-tertiary-default text-caption-2-semibold" style={{ color: item.color }} />
                  <span className="flex min-w-0 flex-col"><span className="truncate text-body-2-medium text-text-primary">{item.name}</span><span className="truncate text-caption-1-regular text-text-secondary">{item.root}</span></span>
                  {item.id === activeProjectId && <Check size={16} className="ms-auto shrink-0 text-accent-500" />}
                </button>
                {unread.length > 0 && <Button variant="ghost" size="xs" iconOnly leadingIcon={Bell} aria-label={`Notificações de ${item.name}`} onClick={() => { setProjectsSheetOpen(false); switchProject(item.id); openLatestProjectNotification(item.id); }} />}
                <Button variant="ghost" size="xs" iconOnly leadingIcon={X} aria-label={`Fechar ${item.name}`} onClick={() => void closeProject(item.id)} />
              </div>
            );
          })}
        </div>

        {closedProjects.length > 0 && (
          <>
            <div className="px-1 pb-1 pt-4 text-caption-2-semibold uppercase tracking-wide text-text-tertiary">Fechados</div>
            <div className="flex flex-col gap-1">
              {closedProjects.map((item) => (
                <button key={item.id} type="button" className="flex min-w-0 items-center gap-2.5 rounded-xl border border-transparent px-2 py-2 text-start hover:border-border-button-default hover:bg-background-primary-hover" onClick={() => { setProjectsSheetOpen(false); switchProject(item.id); }}>
                  <FolderGit2 size={16} className="shrink-0 text-foreground-icon-secondary" />
                  <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-body-2-medium text-text-primary">{item.name}</span><span className="truncate text-caption-1-regular text-text-secondary">{item.root}</span></span>
                </button>
              ))}
            </div>
          </>
        )}

        <Button variant="secondary" className="mt-3 w-full justify-start" leadingIcon={Plus} onClick={() => { setProjectsSheetOpen(false); setShowRepoPicker(true); }}>Abrir repositório</Button>
      </Modal>

      <Modal
        isOpen={layoutOpen}
        onClose={() => setLayoutOpen(false)}
        title="Customize Layout"
        description="Visibilidade, posições e alinhamento."
        size="sm"
        footer={<Button variant="secondary" onClick={() => setLayoutOpen(false)}>Concluir</Button>}
      >
        <div className="flex flex-col gap-0.5">
          <div className="mb-1 px-2 text-right text-caption-1-regular text-text-tertiary">Visibility</div>
          <LayoutRow label="Menu Bar" checked={menuVisible} onChange={(value) => updateSettings({ menuVisible: value })} />
          <LayoutRow label="Activity Bar" checked={activityVisible} onChange={(value) => updateSettings({ activityVisible: value })} />
          <LayoutRow label="Primary Side Bar" shortcut="Ctrl+B" checked={sidebarVisible} onChange={(value) => updateSettings({ sidebarVisible: value })} />
          <LayoutRow label="Panel" shortcut="Ctrl+J" checked={terminalOpen} onChange={setTerminalOpen} />
          <LayoutRow label="Status Bar" checked={statusVisible} onChange={(value) => updateSettings({ statusVisible: value })} />
        </div>

        <LayoutSection label="Primary Side Bar Position">
          <RadioGroup className="flex flex-col gap-0.5" value={primarySideBarPosition} onChange={(value) => updateSettings({ primarySideBarPosition: value as "left" | "right" })}>
            <LayoutRadio value="left" label="Left" />
            <LayoutRadio value="right" label="Right" />
          </RadioGroup>
        </LayoutSection>

        <LayoutSection label="Panel Alignment">
          <RadioGroup className="flex flex-col gap-0.5" value={panelAlignment} onChange={(value) => updateSettings({ panelAlignment: value as "left" | "right" | "center" | "justify" })}>
            <LayoutRadio value="left" label="Left" />
            <LayoutRadio value="right" label="Right" />
            <LayoutRadio value="center" label="Center" />
            <LayoutRadio value="justify" label="Justify" />
          </RadioGroup>
        </LayoutSection>

        <LayoutSection label="Quick Input Position">
          <RadioGroup className="flex flex-col gap-0.5" value={quickInputPosition} onChange={(value) => updateSettings({ quickInputPosition: value as "top" | "center" })}>
            <LayoutRadio value="top" label="Top" />
            <LayoutRadio value="center" label="Center" />
          </RadioGroup>
        </LayoutSection>
      </Modal>

      <Modal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} title="Toph" description="Workbench self-hosted para código, dados e IA." size="sm">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <BrandMark size="large" />
          <p className="text-body-medium text-text-primary">Toph v{version}</p>
          <p className="text-caption-1-regular text-text-secondary">Interface construída com BoardUI.</p>
        </div>
      </Modal>

      <Modal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard Shortcuts" description="Atalhos principais do Toph." size="sm">
        <div className="flex flex-col divide-y divide-separator-border">
          {[
            ["Busca rápida", "Ctrl+P"],
            ["Toggle Primary Side Bar", "Ctrl+B"],
            ["Toggle Panel", "Ctrl+J"],
            ["Salvar arquivo", "Ctrl+S"],
            ["Executar", "Ctrl+Enter"],
            ["Command Palette", "Ctrl+Shift+P"],
            ["Customize Layout", "Ctrl+Shift+L"],
          ].map(([label, shortcut]) => (
            <div key={label} className="flex items-center justify-between py-2 text-body-2-regular">
              <span className="text-text-secondary">{label}</span>
              <span className="text-caption-1-medium text-text-primary">{shortcut}</span>
            </div>
          ))}
        </div>
      </Modal>

      {mobile && mobileSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-background-full px-3 pt-[calc(var(--safe-top)+0.5rem)]">
          <button type="button" aria-label="Fechar busca" className="absolute inset-0 cursor-default" onClick={() => setMobileSearchOpen(false)} />
          <div className="relative z-10 flex w-full max-w-md flex-col gap-2">
            <div className="flex items-center justify-between px-1 text-caption-1-semibold uppercase tracking-wide text-text-secondary">
              <span>Buscar</span>
              <Button variant="ghost" size="xs" iconOnly leadingIcon={X} aria-label="Fechar busca" onClick={() => setMobileSearchOpen(false)} />
            </div>
            <QuickOpen
              project={project}
              focusToken={quickOpenToken}
              onOpenFile={(path, line) => { openFile(path, line); setMobileSearchOpen(false); }}
              floating
            />
          </div>
        </div>
      )}

      {mobile && (
        <MobileNav sidebar={sidebar} panelOpen={mobilePanelOpen} onSidebar={openMobileSidebar} onWeb={() => openMobileSidebar("web")} onBots={() => openMobileSidebar("bots")} />
      )}
      {showRepoPicker && <RepoPicker onClose={() => setShowRepoPicker(false)} onOpen={openRepo} />}
      <Toasts />
    </div>
  );
}


function LayoutRow({ label, shortcut, checked, onChange }: { label: string; shortcut?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex h-9 items-center justify-between rounded-lg px-2 hover:bg-background-primary-hover">
      <Checkbox isSelected={checked} onChange={onChange}>{label}</Checkbox>
      {shortcut && <Shortcut value={shortcut} />}
    </div>
  );
}

function LayoutSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-3 border-t border-separator-border pt-2">
      <div className="px-2 pb-1 text-right text-caption-1-regular text-text-tertiary">{label}</div>
      {children}
    </section>
  );
}

function LayoutRadio({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex h-8 items-center rounded-lg px-2 hover:bg-background-primary-hover">
      <Radio value={value} className="w-full">{label}</Radio>
    </div>
  );
}

function Shortcut({ value }: { value: string }) {
  const keys = value.split("+");
  return (
    <span className="flex items-center gap-1">
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className="flex items-center gap-1">
          <Kbd>{key}</Kbd>
          {index < keys.length - 1 && <span className="text-caption-2-regular text-text-tertiary">+</span>}
        </span>
      ))}
    </span>
  );
}
