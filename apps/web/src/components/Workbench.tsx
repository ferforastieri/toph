import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Bell, Bot, ChevronRight, CircleAlert, FolderGit2, FolderPlus, GitBranch, Plus, Trash2, X } from "@toph/icons";
import { SearchField } from "@/boardui/base/search-field/search-field";
import { api, getApiBase, type Repository, type SchemaTable, type WebTarget } from "../api";
import { basename, expandGitPattern, languageFor, quoteIdentifier, sanitizeBranchName } from "../lib";
import { useApp, type AppNotification, type Sidebar, type Tab } from "../store";
import { useBots, type BotWorkspace } from "../bots";
import { useAI } from "../ai";
import { nativePushToken, requestMobileNotificationPermission } from "../notifications";
import { PROJECT_EVENT, type ProjectEvent } from "../projectEvents";
import ActivityBar from "./ActivityBar";
import MobileMenu, { type MobileScreen } from "./MobileMenu";
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
import NotificationBell from "./NotificationBell";
import HeaderAccordion from "./HeaderAccordion";
import { IconButton } from "@/boardui/base/buttons/icon-button";
import { Accordion, AccordionItem } from "@/boardui/base/accordion/accordion";
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
import { RadioDot } from "@/boardui/base/radio/radio";
import { Radio, RadioGroup } from "@/boardui/base/radio/radio";
import { Kbd } from "@/boardui/base/kbd/kbd";
import { Modal } from "@/boardui/base/modal/modal";
import ResizeHandle from "../ui/resize";
import { useIsMobile } from "../ui/useIsMobile";
import { useSettings } from "../settings";
import { useConfirm } from "../ui/confirm";
import { cx } from "@/boardui/utils/cx";
import { suggestGitChanges } from "../gitAi";
import { parseGitStatus } from "../gitStatus";
import LoadingState from "./LoadingState";

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
  const markNotificationRead = useApp((state) => state.markNotificationRead);
  const botWorkspace = useBots((state) => activeProjectId ? state.byProject[activeProjectId] : undefined);
  const pendingBotSelection = useRef<{ projectId: string; botId: string } | null>(null);
  const loadBots = useBots((state) => state.load);
  const snapshotBots = useBots((state) => state.snapshot);
  const loadAI = useAI((state) => state.load);
  const loadModels = useAI((state) => state.loadModels);
  const branchPattern = useSettings((state) => state.gitBranchPattern);
  const aiConfig = useAI((state) => state.config);
  const sidebarWidth = useSettings((state) => state.sidebarWidth);
  const updateSettings = useSettings((state) => state.update);
  const confirm = useConfirm();

  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [version, setVersion] = useState("0.1.0");
  const [gitStatus, setGitStatus] = useState("");
  const [, setMobilePanelOpen] = useState(false);
  const [mobileTerminalOpen, setMobileTerminalOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileScreen, setMobileScreen] = useState<MobileScreen>("bots");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileSwipeStart = useRef<{ x: number; y: number } | null>(null);
  const [projectsSheetOpen, setProjectsSheetOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branchCreateOpen, setBranchCreateOpen] = useState(false);
  const [branchListOpen, setBranchListOpen] = useState(true);
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
  const tabHistory = useRef<string[]>([]);
  const tabHistoryIndex = useRef(-1);
  const navigatingHistory = useRef(false);
  const [projectsMenuOpen, setProjectsMenuOpen] = useState(false);
  const [branchInfo, setBranchInfo] = useState<{ current: string; branches: string[] } | null>(null);
  const [branchBusy, setBranchBusy] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [branchError, setBranchError] = useState("");
  const [cursor, setCursor] = useState({ line: 1, column: 1, language: "" });
  const loadedProject = useRef<string | null>(null);
  const mobile = useIsMobile();

  const project = projects.find((item) => item.id === activeProjectId) ?? null;
  const closedProjects = projects.filter((item) => !openProjectIds.includes(item.id));
  const branch = gitStatus.split("\n")[0]?.replace(/^##\s*/, "").split("...")[0] ?? "";
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const unreadForProject = (projectId: string) =>
    notifications.filter((notification) => !notification.read && notification.projectId === projectId);
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

  // Warm the branch list for the active project so opening the selector is instant.
  useEffect(() => {
    if (!activeProjectId) return;
    setBranchInfo(null);
    setBranchError("");
    void loadBranches();
  }, [activeProjectId]);

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
    if (!mobile) return;
    setMobileScreen("bots");
    setMobileMenuOpen(false);
  }, [activeProjectId, mobile]);

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
          setMobileSearchOpen(true);
          setQuickOpenToken((current) => current + 1);
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
      setTerminalOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [mobile, setSidebar, setTerminalOpen]);

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
    type PushPayload = {
      title?: string;
      body?: string;
      notificationId?: string;
      projectId?: string;
      botId?: string;
      botName?: string;
      botRole?: string;
      sessionId?: string;
      tabId?: string;
      opened?: string;
    };
    const handler = (payload: PushPayload) => {
      if (payload.opened === "true" && payload.projectId) {
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("toph:open-bot", { detail: payload })), 0);
        return;
      }
      const state = useApp.getState();
      const projectId = payload.projectId || state.activeProjectId || undefined;
      if (!projectId) return;
      if (document.visibilityState === "visible" && document.hasFocus() && state.sidebar === "bots" && state.activeProjectId === projectId) return;
      state.addNotification({
        kind: "ai",
        title: payload.botName?.trim() || payload.title?.trim() || "Resposta da IA",
        body: payload.body?.trim() || "A IA terminou de responder.",
        projectId,
        tabId: payload.tabId || `bots:${projectId}`,
        sessionId: payload.sessionId,
        notificationId: payload.notificationId,
        botId: payload.botId,
        botName: payload.botName,
        botRole: payload.botRole,
      });
    };
    (window as unknown as { __tophPush?: (payload: PushPayload) => void }).__tophPush = handler;

    if (typeof EventSource === "undefined") {
      return () => {
        delete (window as unknown as { __tophPush?: (payload: PushPayload) => void }).__tophPush;
      };
    }
    const stream = new EventSource(`${getApiBase()}/api/notifications/stream`, {
      withCredentials: true,
    });
    const onAI = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as PushPayload;
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
    const onOpenBot = (event: Event) => {
      const payload = (event as CustomEvent<{ projectId?: string; botId?: string; notificationId?: string }>).detail;
      if (!payload?.projectId) return;
      const state = useApp.getState();
      if (payload.notificationId) {
        const notification = state.notifications.find((item) => item.notificationId === payload.notificationId);
        if (notification) state.markNotificationRead(notification.id);
      }
      state.setActiveProject(payload.projectId);
      if (payload.botId) selectBot(payload.projectId, payload.botId);
      state.setSidebar("bots");
      setMobilePanelOpen(false);
      setMobileTerminalOpen(false);
    };
    window.addEventListener("toph:open-bot", onOpenBot as EventListener);
    return () => window.removeEventListener("toph:open-bot", onOpenBot as EventListener);
  }, []);

  useEffect(() => {
    const pending = pendingBotSelection.current;
    if (!pending || pending.projectId !== activeProjectId || !botWorkspace) return;
    if (!botWorkspace.bots.some((bot) => bot.id === pending.botId)) {
      pendingBotSelection.current = null;
      return;
    }
    useBots.getState().setActiveBot(pending.projectId, pending.botId);
    pendingBotSelection.current = null;
  }, [activeProjectId, botWorkspace]);

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

  function selectMobileScreen(next: MobileScreen) {
    setMobileScreen(next);
    setMobileMenuOpen(false);
    setMobilePanelOpen(false);
    setMobileTerminalOpen(false);
    setMobileSearchOpen(false);
  }






  async function loadBranches() {
    if (!project) return;
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

  function openBranchMenu() {
    if (!project) return;
    setBranchMenuOpen(true);
    setBranchListOpen(true);
    setNewBranchName("");
    setBranchFilter("");
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

  async function deleteOtherBranches() {
    if (!project || !branchInfo || branchBusy) return;
    const current = branchInfo.current || branch;
    const others = branchInfo.branches.filter((name) => name !== current);
    if (others.length === 0) {
      notify("info", "Só existe a branch atual. Nada para excluir.");
      return;
    }
    const ok = await confirm({
      title: "Excluir outras branches?",
      message: `Excluir ${others.length} branch${others.length === 1 ? "" : "es"} e manter somente ${current}? Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir branches",
      danger: true,
    });
    if (!ok) return;
    setBranchBusy("delete");
    try {
      const deleted = await api.gitDeleteOtherBranches(project.id);
      setBranchInfo(await api.gitBranches(project.id));
      setGitStatus(await api.gitStatus(project.id));
      window.dispatchEvent(new Event("toph:git-changed"));
      notify("success", `${deleted} branch${deleted === 1 ? "" : "es"} excluída${deleted === 1 ? "" : "s"}.`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível excluir as branches.");
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
      setBranchCreateOpen(false);
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
    if (mobile) { setMobileScreen("workspace"); setMobileMenuOpen(false); }
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
    if (mobile) { setMobileScreen("workspace"); setMobileMenuOpen(false); }
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
    if (mobile) { setMobileScreen("workspace"); setMobileMenuOpen(false); }
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
    if (mobile) { setMobileScreen("workspace"); setMobileMenuOpen(false); }
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

  function selectBot(projectId: string, botId: string) {
    pendingBotSelection.current = { projectId, botId };
    const workspace = useBots.getState().byProject[projectId];
    if (workspace?.bots.some((bot) => bot.id === botId)) {
      useBots.getState().setActiveBot(projectId, botId);
      pendingBotSelection.current = null;
    }
  }

  function openNotification(notification: AppNotification) {
    if (!notification.projectId) return;
    setBranchMenuOpen(false);
    setProjectsSheetOpen(false);
    markNotificationRead(notification.id);
    if (notification.projectId !== activeProjectId) setActiveProject(notification.projectId);
    if (notification.botId) selectBot(notification.projectId, notification.botId);
    setSidebar("bots");
    if (mobile) { setMobileScreen("bots"); setMobileMenuOpen(false); }
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
    if (mobile) { setMobileScreen("workspace"); setMobileMenuOpen(false); }
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
    const hasProjects = projects.length > 0;
    return (
      <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background-full p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-accent-500/[0.08] to-transparent" />
        <section className="relative max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border-button-white bg-background-primary-default shadow-2xl">
          <div className="flex flex-col gap-6 p-6 sm:p-8">
            <header className="flex flex-col items-center gap-4 text-center">
              <span className="flex size-16 items-center justify-center rounded-2xl border border-accent-500/25 bg-accent-500/10 shadow-[0_0_32px_-18px_var(--color-accent-500)]">
                <BrandMark size="large" />
              </span>
              <div className="space-y-2">
                <h1 className="text-title-2-medium text-text-primary">Bem-vindo ao Toph</h1>
                <p className="mx-auto max-w-md text-body-regular text-text-secondary">
                  {hasProjects ? "Retome um projeto recente ou abra outro repositório do servidor." : "Abra um repositório Git do servidor para começar."}
                </p>
              </div>
            </header>

            {hasProjects && (
              <section className="flex min-h-0 flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-caption-2-semibold uppercase tracking-[0.14em] text-text-tertiary">Projetos disponíveis</span>
                  <span className="text-caption-1-regular text-text-tertiary">{projects.length}</span>
                </div>
                <div className="grid max-h-[300px] gap-2 overflow-y-auto pe-1 sm:grid-cols-2">
                  {projects.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => switchProject(item.id)}
                      className="group flex min-w-0 items-center gap-3 rounded-xl border border-border-button-default bg-background-secondary-default/40 p-2.5 text-start transition-colors hover:border-accent-500/35 hover:bg-accent-500/[0.06]"
                    >
                      <Avatar size="sm" initials={item.name.slice(0, 1).toUpperCase()} className="bg-background-tertiary-default text-caption-2-semibold" style={{ color: item.color }} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-body-2-medium text-text-primary">{item.name}</span>
                        <span className="truncate text-caption-1-regular text-text-tertiary">{item.root}</span>
                      </span>
                      <ChevronRight size={14} className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            <footer className={cx("flex flex-col gap-3 border-t border-separator-border pt-5 sm:flex-row sm:items-center", hasProjects ? "sm:justify-between" : "sm:justify-center")}>
              <p className="text-caption-1-regular text-text-tertiary">
                {hasProjects ? "Escolha um cartão para continuar." : "Código, dados e IA no seu próprio servidor."}
              </p>
              <Button leadingIcon={FolderPlus} onClick={() => setShowRepoPicker(true)} className="w-full sm:w-auto">Abrir repositório</Button>
            </footer>
          </div>
        </section>
        {showRepoPicker && <RepoPicker onClose={() => setShowRepoPicker(false)} onOpen={openRepo} />}
        <Toasts />
      </main>
    );
  }


  const SidebarContent = () => (
    <>
      {project && sidebar === "files" && <ExplorerPanel project={project} onOpenFile={openFile} onStatusChange={setGitStatus} />}
      {project && sidebar === "db" && <DatabasesPanel project={project} onOpenQuery={openQuery} onOpenTable={openTable} />}
      {project && sidebar === "scm" && <SourceControlPanel project={project} view="scm" onOpenDiff={openDiff} onStatusChange={setGitStatus} />}
      {project && sidebar === "web" && <WebSidebar onOpenWeb={openWeb} />}
      {project && sidebar === "bots" && <BotsSidebar project={project} />}
    </>
  );

  const primaryOnLeft = primarySideBarPosition === "left";
  const primarySidebar = !mobile && sidebarVisible && activityVisible ? (
    <div className="flex min-h-0 shrink-0 overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar">
      <ActivityBar />
      <aside className="flex min-h-0 w-[var(--sidebar-width)] shrink-0 flex-col overflow-hidden bg-background-primary-default">
        <SidebarContent />
      </aside>
    </div>
  ) : null;
  const primaryResize = !mobile && sidebarVisible && activityVisible ? (
    <ResizeHandle className="sidebar-resize" orientation="vertical" value={sidebarWidth} min={220} max={320} invert={!primaryOnLeft} label="Resize sidebar" onChange={(width) => document.documentElement.style.setProperty("--sidebar-width", `${width}px`)} onCommit={(width) => updateSettings({ sidebarWidth: width })} />
  ) : null;
  function branchPickerBody() {
    return (
      <div className="flex min-h-0 flex-col gap-2 p-3">
        <div className="flex min-w-0 items-center gap-2.5 px-1">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-500">
            <GitBranch size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-caption-2-regular text-text-tertiary">Branch atual</p>
            <p className="truncate text-caption-1-semibold text-text-primary">{branchInfo?.current || branch || "detached"}</p>
          </div>
        </div>
        <Accordion
          variant="divided"
          expandedKeys={branchListOpen ? ["branches"] : []}
          onExpandedChange={(keys) => setBranchListOpen(Array.from(keys).includes("branches"))}
          className="px-1"
        >
          <AccordionItem
            id="branches"
            icon={GitBranch}
            title={<span className="text-caption-2-semibold uppercase tracking-[0.14em] text-text-tertiary">Branches</span>}
            triggerClassName="py-1"
            contentClassName="p-0"
            actions={
              <div className="flex items-center gap-1">
                <span className="text-caption-1-regular text-text-tertiary">{branchInfo ? branchInfo.branches.length : "..."}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  iconOnly
                  leadingIcon={Trash2}
                  aria-label="Excluir todas as branches, exceto a atual"
                  title="Excluir todas as branches, exceto a atual"
                  disabled={!branchInfo || branchInfo.branches.length <= 1 || Boolean(branchBusy)}
                  onClick={() => void deleteOtherBranches()}
                />
                <Button
                  variant="ghost"
                  size="xs"
                  iconOnly
                  leadingIcon={Plus}
                  aria-label="Criar nova branch"
                  title="Criar nova branch"
                  disabled={Boolean(branchBusy)}
                  onClick={() => { setNewBranchName(""); setBranchCreateOpen(true); }}
                />
              </div>
            }
          >
            <div className="flex flex-col gap-2">
              <SearchField value={branchFilter} onChange={setBranchFilter} placeholder="Filtrar branches" aria-label="Filtrar branches" shape="rounded" size="small" fieldClassName="h-8" />
              <div className="no-scrollbar flex max-h-[min(280px,calc(100dvh-360px))] flex-col gap-1 overflow-y-auto overflow-x-hidden">
                {branchError ? (
                  <div className="flex flex-col items-center gap-2 px-2 py-4 text-center">
                    <CircleAlert size={20} className="text-rose-500" />
                    <p className="text-caption-1-regular text-text-secondary">{branchError}</p>
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
                        "flex min-h-9 w-full shrink-0 items-center justify-between gap-2.5 overflow-hidden rounded-lg p-2 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        current ? "bg-dropdown-item-hover-background" : "hover:bg-dropdown-item-hover-background",
                      )}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <GitBranch size={14} className="shrink-0 text-foreground-icon-secondary" />
                        <span className="truncate text-body-medium text-text-primary">{name}</span>
                      </span>
                      {current ? <RadioDot selected size="sm" /> : null}
                    </button>
                  );
                }) : <LoadingState label="Carregando branches..." className="px-2 py-3" />}
                {!branchError && branchInfo && visibleBranches.length === 0 && <p className="px-2 py-4 text-center text-caption-1-regular text-text-secondary">Nenhuma branch encontrada.</p>}
              </div>
            </div>
          </AccordionItem>
        </Accordion>
      </div>
    );
  }
  const headerBranch = statusVisible ? (
      <HeaderAccordion
        id="branch"
        isOpen={branchMenuOpen}
        onOpenChange={(next) => { setBranchMenuOpen(next); setProjectsMenuOpen(false); if (next) openBranchMenu(); }}
        icon={GitBranch}
        title={<span className="header-accordion-label min-w-0 truncate text-caption-1-regular leading-none text-text-secondary">{branch || "detached"}</span>}
        triggerClassName="h-6 min-w-0 max-w-[min(320px,32vw)] gap-1 overflow-hidden text-caption-1-regular text-text-secondary hover:bg-background-primary-hover"
        panelClassName="left-0 max-h-[min(600px,calc(100dvh-80px))] w-[min(460px,calc(100vw-32px))] overflow-y-auto"
        contentClassName="p-0"
      >
        {branchPickerBody()}
      </HeaderAccordion>
  ) : null;

  const headerTrailing = statusVisible ? (
      <div className="flex h-7 items-center gap-0.5">
        <HeaderAccordion
          id="projects"
          isOpen={projectsMenuOpen}
          onOpenChange={(next) => { setProjectsMenuOpen(next); setBranchMenuOpen(false); }}
          title={
            <span className="header-accordion-label flex min-w-0 items-center gap-1.5">
              <Avatar size="xs" initials={project.name.slice(0, 1).toUpperCase()} className="bg-background-tertiary-default text-caption-2-semibold" style={{ color: project.color }} />
              <span className="max-w-[110px] truncate text-caption-2-regular leading-none">{project.name}</span>
            </span>
          }
          triggerClassName="h-6 min-w-0 gap-1.5 hover:bg-background-primary-hover"
          panelClassName="left-0 w-80"
          contentClassName="p-2.5"
        >
            <div className="flex flex-col gap-1">
              <div className="px-2 pt-1 text-body-medium text-text-secondary">Projetos abertos · {openProjectIds.length}</div>
              {openProjectIds.map((id) => {
                const item = projects.find((projectItem) => projectItem.id === id);
                if (!item) return null;
                const unread = unreadForProject(item.id);
                return (
                  <div key={item.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { setProjectsMenuOpen(false); switchProject(item.id); }}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-2 text-start text-text-primary transition-colors hover:bg-dropdown-item-hover-background focus-visible:bg-dropdown-item-hover-background"
                    >
                      <Avatar size="sm" initials={item.name.slice(0, 1).toUpperCase()} className="bg-background-tertiary-default text-caption-2-semibold" style={{ color: item.color }} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body-2-medium text-text-primary">{item.name}</span>
                        <span className="truncate text-caption-1-regular text-text-secondary">{item.root}</span>
                      </span>
                      {unread.length > 0 && <Badge color="primary">{unread.length > 9 ? "9+" : unread.length}</Badge>}
                    </button>
                    <Button variant="ghost" size="xs" iconOnly leadingIcon={X} aria-label={`Fechar ${item.name}`} title="Fechar projeto" onClick={(event) => { event.stopPropagation(); setProjectsMenuOpen(false); void closeProject(item.id); }} />
                  </div>
                );
              })}
              {closedProjects.length > 0 && (
                <>
                  <div className="my-1 h-px bg-border-button-default" />
                  <div className="px-2 pt-1 text-body-medium text-text-secondary">Projetos fechados</div>
                  {closedProjects.map((item) => {
                    const unread = unreadForProject(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => { setProjectsMenuOpen(false); switchProject(item.id); }}
                        className="flex min-w-0 items-center gap-2 rounded-lg p-2 text-start text-text-primary transition-colors hover:bg-dropdown-item-hover-background focus-visible:bg-dropdown-item-hover-background"
                      >
                        <FolderGit2 size={14} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-body-2-medium text-text-primary">{item.name}</span>
                          <span className="truncate text-caption-1-regular text-text-secondary">{item.root}</span>
                        </span>
                        {unread.length > 0 && <Badge color="primary">{unread.length > 9 ? "9+" : unread.length}</Badge>}
                      </button>
                    );
                  })}
                </>
              )}
              <div className="my-1 h-px bg-border-button-default" />
              <button type="button" onClick={() => { setProjectsMenuOpen(false); setShowRepoPicker(true); }} className="flex items-center gap-2 rounded-lg p-2 text-start text-text-primary transition-colors hover:bg-dropdown-item-hover-background focus-visible:bg-dropdown-item-hover-background">
                <FolderPlus size={14} /> Abrir repositório
              </button>
            </div>
        </HeaderAccordion>
        <NotificationBell projectId={project.id} projectName={project.name} onOpen={openNotification} />
      </div>
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
        const touch = event.touches[0];
        if (touch) mobileSwipeStart.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchMove={(event) => {
        if (!mobile || !mobileSwipeStart.current) return;
        const touch = event.touches[0];
        if (!touch) return;
        const dx = touch.clientX - mobileSwipeStart.current.x;
        const dy = touch.clientY - mobileSwipeStart.current.y;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        if (dx > 0 && !mobileMenuOpen && mobileSwipeStart.current.x <= 48) {
          setMobileMenuOpen(true);
          mobileSwipeStart.current = null;
        } else if (dx < 0 && mobileMenuOpen) {
          setMobileMenuOpen(false);
          mobileSwipeStart.current = null;
        }
      }}
      onTouchEnd={() => { mobileSwipeStart.current = null; }}
    >
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
          headerLeft={headerBranch}
          headerTrailing={headerTrailing}
          headerRight={headerStatus}
        />
      )}

      <div
        className={cx("flex min-h-0 flex-1", mobile ? "p-0" : "p-1", !mobile && sidebar === "bots" ? "gap-1" : "gap-0")}
        style={mobile ? { paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" } : undefined}
      >
        {!mobile && primaryOnLeft && primarySidebar}
        {!mobile && primaryOnLeft && primaryResize}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-hidden">
          <main
            className={cx(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
              mobile
                ? "bg-background-primary-default"
                : sidebar === "bots" && project
                  ? "bg-transparent"
                  : "rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar",
            )}
          >
            {mobile ? (
              mobileScreen === "bots" && project ? (
                <BotStudioTab project={project} />
              ) : mobileScreen === "files" && project ? (
                <div className="min-h-0 flex-1 overflow-hidden">
                  <ExplorerPanel project={project} onOpenFile={openFile} onStatusChange={setGitStatus} />
                </div>
              ) : mobileScreen === "scm" && project ? (
                <div className="min-h-0 flex-1 overflow-hidden">
                  <SourceControlPanel project={project} view="scm" onOpenDiff={openDiff} onStatusChange={setGitStatus} />
                </div>
              ) : mobileScreen === "db" && project ? (
                <div className="min-h-0 flex-1 overflow-hidden">
                  <DatabasesPanel project={project} onOpenQuery={openQuery} onOpenTable={openTable} />
                </div>
              ) : mobileScreen === "web" ? (
                <div className="min-h-0 flex-1 overflow-hidden">
                  <WebSidebar onOpenWeb={openWeb} />
                </div>
              ) : mobileScreen === "workspace" ? (
                <>
                  <Tabs />
                  <div className="relative flex min-h-0 flex-1 overflow-hidden">
                    {!activeTab && (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
                        <BrandMark size="large" />
                        <strong className="text-title-3-medium text-text-primary">Nenhuma aba aberta</strong>
                        <p className="max-w-sm text-caption-1-regular text-text-secondary">Abra um arquivo, banco ou web app para começar.</p>
                        <Button variant="secondary" className="w-full" onClick={() => selectMobileScreen("bots")}>Voltar para Bots</Button>
                      </div>
                    )}
                    {activeTab?.kind === "editor" && project && <EditorPanel tab={activeTab} project={project} onOpenChanges={(path) => openDiff(path, false)} />}
                    {activeTab?.kind === "db" && <DbPanelTab tab={activeTab} />}
                    {activeTab?.kind === "web" && <WebPanelTab tab={activeTab} />}
                    {activeTab?.kind === "diff" && project && <DiffPanelTab tab={activeTab} project={project} />}
                  </div>
                </>
              ) : null
            ) : sidebar === "bots" && project ? (
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
                </div>
              </>
            )}
          </main>

          {project && !mobile && sidebar !== "bots" && (
            <div className={terminalOpen ? "flex w-full min-w-0 shrink-0 overflow-hidden" : "hidden"}>
              <TerminalPanel key={project.id} project={project} onOpenFile={openFile} />
            </div>
          )}
        </div>

        {!mobile && !primaryOnLeft && primaryResize}
        {!mobile && !primaryOnLeft && primarySidebar}

        {mobile && project && mobileTerminalOpen && (
          <div className="fixed inset-0 z-[120] flex flex-col bg-background-primary-default pt-[var(--safe-top)]">
            <Button variant="ghost" className="m-2 w-[calc(100%-1rem)] shrink-0 justify-start" onClick={() => setMobileTerminalOpen(false)}>
              Fechar terminal
            </Button>
            <div className="min-h-0 flex-1">
              <TerminalPanel key={`mobile:${project.id}`} project={project} onOpenFile={openFile} sheet onClose={() => setMobileTerminalOpen(false)} />
            </div>
          </div>
        )}

      </div>


      <Modal
        isOpen={mobile && branchMenuOpen && Boolean(project)}
        onClose={() => setBranchMenuOpen(false)}
        title="Branches"
        description="Selecione uma branch para trocar."
        size="sm"
        placement="bottom"
        bodyClassName="p-0"
      >
        {branchPickerBody()}
      </Modal>

      <Modal
        isOpen={branchCreateOpen && Boolean(project)}
        onClose={() => setBranchCreateOpen(false)}
        title="Nova branch"
        description="Crie uma branch a partir da branch atual."
        size="sm"
      >
        <form className="flex flex-col gap-2" onSubmit={(event) => void createBranchFromMenu(event)}>
          <div className="relative w-full">
            <Input
              value={newBranchName}
              onChange={setNewBranchName}
              placeholder="nome-da-branch"
              aria-label="Nome da nova branch"
              autoFocus
              fieldClassName="pe-9"
            />
            <IconButton
              icon={Bot}
              size="small"
              aria-label="Gerar nome da branch"
              title="Gerar nome com IA"
              disabled={Boolean(branchBusy)}
              onClick={() => void generateBranchName()}
              className="absolute end-1 top-1/2 size-6 -translate-y-1/2 border-transparent bg-transparent p-0 shadow-none [&_svg]:size-4"
            />
          </div>
          <Button type="submit" size="small" className="w-full justify-center" disabled={!newBranchName.trim() || Boolean(branchBusy)}>{branchBusy === "create" ? "Criando..." : "Criar branch"}</Button>
        </form>
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
          <Button variant="secondary" size="xs" onClick={() => { setProjectsSheetOpen(false); openBranchMenu(); }}>Branch</Button>
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
                </button>
                {unread.length > 0 && <Badge color="primary">{unread.length > 9 ? "9+" : unread.length}</Badge>}
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
          <div className="relative z-10 flex w-full flex-col gap-2">
            <span className="px-1 text-caption-1-semibold uppercase tracking-wide text-text-secondary">Buscar</span>
            <Button variant="ghost" className="w-full justify-start" onClick={() => setMobileSearchOpen(false)}>Fechar busca</Button>
            <QuickOpen
              project={project}
              focusToken={quickOpenToken}
              onOpenFile={(path, line) => { openFile(path, line); setMobileSearchOpen(false); }}
              floating
            />
          </div>
        </div>
      )}

      {mobile && mobileMenuOpen && (
        <MobileMenu
          screen={mobileScreen}
          hasWorkspace={Boolean(activeTab)}
          onSelect={selectMobileScreen}
          onProjects={() => { setMobileMenuOpen(false); setProjectsSheetOpen(true); }}
          onSearch={() => { setMobileMenuOpen(false); setMobileSearchOpen(true); setQuickOpenToken((value) => value + 1); }}
          onTerminal={() => { setMobileMenuOpen(false); setMobileTerminalOpen(true); }}
          onClose={() => setMobileMenuOpen(false)}
        />
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
