import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Bot, ChevronDown, ChevronRight, FolderPlus, GitBranch, PanelLeftClose, PanelLeftOpen } from "@toph/icons";
import { api, getApiBase, type Project, type Repository, type SchemaTable, type WebTarget } from "../api";
import { basename, expandGitPattern, quoteIdentifier, sanitizeBranchName } from "../lib";
import { useApp, type AppNotification, type Sidebar, type Tab } from "../store";
import { botThread, useBots, type BotWorkspace, botSessionIds } from "../bots";
import { useAI } from "../ai";
import { PROJECT_EVENT, type ProjectEvent } from "../projectEvents";
import ActivityBar from "./ActivityBar";
import BotStudioTab from "../panels/BotStudioTab";
import { featureEnabled, isDesktopClient, isTophOnly, sidebarFeature, useSettings, type WorkspaceFeature } from "../settings";
import Tabs from "./Tabs";
import Toasts from "./Toasts";
import RepoPicker from "./RepoPicker";
import CloseProjectModal from "./CloseProjectModal";
import BranchPicker from "./BranchPicker";
import ProjectSwitcher from "./ProjectSwitcher";
import QuickOpen from "./QuickOpen";
import ActivityPopover from "./ActivityPopover";
import TophSettings from "./TophSettings";
import SidebarHeader from "./SidebarHeader";
import { IconButton } from "@/boardui/base/buttons/icon-button";
import BrandMark from "@toph/brand";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";
import { Avatar } from "@/boardui/base/avatar/avatar";
import { Checkbox } from "@/boardui/base/checkbox/checkbox";
import { Radio, RadioGroup } from "@/boardui/base/radio/radio";
import { Kbd } from "@/boardui/base/kbd/kbd";
import { Modal } from "@/boardui/base/modal/modal";
import ResizeHandle from "../ui/resize";
import { useIsMobile } from "../ui/useIsMobile";
import { useConfirm } from "../ui/confirm";
import { useTophDrafts } from "../tophDrafts";
import { cx } from "@/boardui/utils/cx";
import { suggestGitChanges } from "../gitAi";
import { parseGitStatus } from "../gitStatus";

const MobileApp = lazy(() => import("../mobile/MobileApp"));
const ExplorerPanel = lazy(() => import("../panels/ExplorerPanel"));
const DatabasesPanel = lazy(() => import("../panels/DatabasesPanel"));
const WebSidebar = lazy(() => import("../panels/WebSidebar"));
const EditorPanel = lazy(() => import("../panels/EditorPanel"));
const DbPanelTab = lazy(() => import("../panels/DbPanelTab"));
const DebugPanel = lazy(() => import("../panels/DebugPanel"));
const BotsSidebar = lazy(() => import("./BotsSidebar"));
const WebPanelTab = lazy(() => import("../panels/WebPanelTab"));
const DiffPanelTab = lazy(() => import("../panels/DiffPanelTab"));
const TerminalPanel = lazy(() => import("../panels/TerminalPanel"));
const SourceControlPanel = lazy(() => import("../panels/SourceControlPanel"));

function tabFeature(tab: Tab): WorkspaceFeature | null {
  switch (tab.kind) {
    case "editor":
    case "diff": return "files";
    case "db": return "databases";
    case "web": return "webApps";
    case "ai": return "bots";
    default: return null;
  }
}

function restoredSidebar(value: unknown): Sidebar {
  switch (value) {
    case "files":
    case "scm":
    case "db":
    case "web":
    case "bots":
    case "debug":
      return value;
    case "search":
    case "settings":
      return "files";
    case "ai":
    default:
      return "bots";
  }
}

export default function Workbench() {
  const projects = useApp((state) => state.projects);
  const user = useApp((state) => state.user);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const setProjects = useApp((state) => state.setProjects);
  const setActiveProject = useApp((state) => state.setActiveProject);
  const closeProjectTab = useApp((state) => state.closeProjectTab);
  const tabs = useApp((state) => state.tabs);
  const activeTabId = useApp((state) => state.activeTabId);
  const setTabs = useApp((state) => state.setTabs);
  const setActiveTab = useApp((state) => state.setActiveTab);
  const openTab = useApp((state) => state.openTab);
  const sidebar = useApp((state) => state.sidebar);
  const setSidebar = useApp((state) => state.setSidebar);
  const terminalOpen = useApp((state) => state.terminalOpen);
  const setTerminalOpen = useApp((state) => state.setTerminalOpen);
  const notify = useApp((state) => state.notify);
  const markNotificationRead = useApp((state) => state.markNotificationRead);
  const botMode = useBots((state) => activeProjectId ? state.byProject[activeProjectId]?.mode : undefined);
  const botWorkspaceHydrated = useBots((state) => activeProjectId ? state.byProject[activeProjectId]?.hydrated === true : false);
  const pendingBotSelection = useRef<{ projectId: string; botId: string } | null>(null);
  const savedMode = useRef<string | null>(null);
  const loadBots = useBots((state) => state.load);
  const snapshotBots = useBots((state) => state.snapshot);
  const loadAI = useAI((state) => state.load);
  const loadModels = useAI((state) => state.loadModels);
  const branchPattern = useSettings((state) => state.gitBranchPattern);
  const aiConfig = useAI((state) => state.config);
  const sidebarWidth = useSettings((state) => state.sidebarWidth);
  const updateSettings = useSettings((state) => state.update);
  const workspaceFeatures = useSettings((state) => state.workspaceFeatures);
  const confirm = useConfirm();

  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [closeTarget, setCloseTarget] = useState<Project | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [gitStatus, setGitStatus] = useState("");
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branchCreateOpen, setBranchCreateOpen] = useState(false);
  const [quickOpenToken, setQuickOpenToken] = useState(0);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const sidebarVisible = workspaceFeatures.primarySidebar;
  const activityVisible = workspaceFeatures.activityBar;
  const tabsVisible = workspaceFeatures.tabs;
  const panelAlignment = useSettings((state) => state.panelAlignment);
  const [projectsMenuOpen, setProjectsMenuOpen] = useState(false);
  const [branchInfo, setBranchInfo] = useState<{ current: string; branches: string[] } | null>(null);
  const [branchBusy, setBranchBusy] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [branchError, setBranchError] = useState("");
  const loadedProject = useRef<string | null>(null);
  const [projectEpoch, setProjectEpoch] = useState(0);
  const forceTophsOnLoad = useRef(false);
  const mobile = useIsMobile();

  const project = projects.find((item) => item.id === activeProjectId) ?? null;
  const branch = gitStatus.split("\n")[0]?.replace(/^##\s*/, "").split("...")[0] ?? "";
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const botsView = sidebar === "bots";
  const effectiveSidebarVisible = sidebarVisible;
  const desktopClient = isDesktopClient();
  const filesEnabled = featureEnabled(workspaceFeatures, "files");
  const sourceControlEnabled = featureEnabled(workspaceFeatures, "sourceControl");
  const databasesEnabled = featureEnabled(workspaceFeatures, "databases");
  const terminalEnabled = featureEnabled(workspaceFeatures, "terminal");
  const debugEnabled = featureEnabled(workspaceFeatures, "debug");
  const projectEventsEnabled = filesEnabled || sourceControlEnabled || databasesEnabled;
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

  function featureIsEnabled(feature: WorkspaceFeature): boolean {
    return featureEnabled(workspaceFeatures, feature);
  }

  function selectSidebar(next: Sidebar): void {
    const feature = sidebarFeature(next);
    if (feature && !featureIsEnabled(feature)) return;
    setSidebar(next);
  }

  function setWorkspaceFeature(feature: WorkspaceFeature, enabled: boolean): void {
    if (feature === "bots") return;
    updateSettings({ workspaceFeatures: { [feature]: enabled } });
    const activeTabFeature = activeTab ? tabFeature(activeTab) : null;
    if (!enabled && (feature === "tabs" || activeTabFeature === feature)) {
      setActiveTab(null);
      setSidebar("bots");
    }
    if (!enabled && feature === "terminal") {
      setTerminalOpen(false);
    }
    if (!enabled && feature === "sourceControl") {
      setBranchMenuOpen(false);
      setBranchInfo(null);
      setBranchError("");
    }
    if (!enabled && sidebarFeature(sidebar) === feature) {
      setSidebar("bots");
    }
  }

  function openLayoutSettings(): void {
    setLayoutOpen(true);
  }

  useEffect(() => {
    const selectedFeature = sidebarFeature(sidebar);
    if ((!selectedFeature && sidebar !== "bots") || (selectedFeature && !featureIsEnabled(selectedFeature))) {
      setSidebar("bots");
    }
    if (!terminalEnabled && terminalOpen) {
      setTerminalOpen(false);
    }
  }, [workspaceFeatures, sidebar, terminalOpen, terminalEnabled, setSidebar, setTerminalOpen]);

  useEffect(() => {
    if (!activeProjectId) return;
    if (!terminalEnabled) void api.closeProjectTerminals(activeProjectId).catch(() => undefined);
    if (!debugEnabled) void api.debugStop(activeProjectId).catch(() => undefined);
  }, [activeProjectId, terminalEnabled, debugEnabled]);

  useEffect(() => {
    const openLayout = () => openLayoutSettings();
    window.addEventListener("toph:layout-settings", openLayout);
    return () => window.removeEventListener("toph:layout-settings", openLayout);
  }, []);

  useEffect(() => {
    if (!activeProjectId) return;
    void loadAI().then(() => loadModels());
  }, [activeProjectId, loadAI, loadModels]);

  // Warm the branch list for the active project so opening the selector is instant.
  useEffect(() => {
    if (!activeProjectId || !sourceControlEnabled) return;
    setBranchInfo(null);
    setBranchError("");
    void loadBranches();
  }, [activeProjectId, sourceControlEnabled]);

  useEffect(() => {
    const openQuick = () => setQuickOpenToken((current) => current + 1);
    window.addEventListener("toph:quick-open", openQuick);
    return () => window.removeEventListener("toph:quick-open", openQuick);
  }, []);

  useEffect(() => {
    const openTerminal = () => {
      if (!terminalEnabled) return;
      setTerminalOpen(!useApp.getState().terminalOpen);
    };
    window.addEventListener("toph:open-terminal", openTerminal);
    return () => window.removeEventListener("toph:open-terminal", openTerminal);
  }, [setTerminalOpen, terminalEnabled]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("toph:editor-command", { detail: { command: "editor.action.quickCommand" } }));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setQuickOpenToken((current) => current + 1);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b" && !event.altKey) {
        event.preventDefault();
        setWorkspaceFeature("primarySidebar", !useSettings.getState().workspaceFeatures.primarySidebar);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        if (!terminalEnabled) return;
        setTerminalOpen(!useApp.getState().terminalOpen);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setLayoutOpen(true);
        return;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [setSidebar, setTerminalOpen, terminalEnabled]);

  useEffect(() => {
    if (!projectEventsEnabled) return;
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
  }, [activeProjectId, projectEventsEnabled]);

  useEffect(() => {
    if (!projectEventsEnabled) return;
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
  }, [projectEventsEnabled]);

  useEffect(() => {
    if (!activeProjectId || !filesEnabled && !sourceControlEnabled) {
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
  }, [activeProjectId, filesEnabled, sourceControlEnabled]);

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
      const switchingProject = state.activeProjectId !== payload.projectId;
      state.setActiveProject(payload.projectId);
      forceTophsOnLoad.current = true;
      if (payload.botId) {
        if (switchingProject) pendingBotSelection.current = { projectId: payload.projectId, botId: payload.botId };
        else selectBot(payload.projectId, payload.botId);
      }
      state.setSidebar("bots");
    };
    window.addEventListener("toph:open-bot", onOpenBot as EventListener);
    return () => window.removeEventListener("toph:open-bot", onOpenBot as EventListener);
  }, []);

  useEffect(() => {
    const pending = pendingBotSelection.current;
    if (!pending || pending.projectId !== activeProjectId || !botMode) return;
    const state = useBots.getState();
    const workspace = state.byProject[activeProjectId];
    if (!workspace?.hydrated) return;
    const targetMode = botThread(workspace, "solo").bots.some((bot) => bot.id === pending.botId)
      ? "solo"
      : botThread(workspace, "team").bots.some((bot) => bot.id === pending.botId)
        ? "team"
        : null;
    if (!targetMode) {
      pendingBotSelection.current = null;
      return;
    }
    if ((workspace.mode ?? "solo") !== targetMode) state.setMode(pending.projectId, targetMode);
    state.setActiveBot(pending.projectId, pending.botId);
    pendingBotSelection.current = null;
  }, [activeProjectId, botMode, botWorkspaceHydrated]);


  useEffect(() => {
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
    useBots.getState().unload(activeProjectId);
    loadedProject.current = null;
    savedMode.current = null;
    setTabs([]);
    const initialFeatures = useSettings.getState().workspaceFeatures;
    const initialEnabled = (feature: WorkspaceFeature) => featureEnabled(initialFeatures, feature);
    const initialTopOnly = isTophOnly(initialFeatures);
    setTerminalOpen(initialEnabled("terminal") && !initialTopOnly && !desktopClient);
    setSidebar(desktopClient || initialTopOnly || !initialEnabled("files") ? "bots" : "files");
    api
      .layout(activeProjectId)
      .then((layout) => {
        if (cancelled) return;
        const features = useSettings.getState().workspaceFeatures;
        const enabled = (feature: WorkspaceFeature) => featureEnabled(features, feature);
        const currentTopOnly = isTophOnly(features);
        const restored = (Array.isArray(layout.tabs) ? (layout.tabs as Tab[]) : []).filter(
          (tab) =>
            tab &&
            typeof tab.id === "string" &&
            enabled("tabs") &&
            ["editor", "db", "web", "diff"].includes(tab.kind) &&
            (!tabFeature(tab) || enabled(tabFeature(tab)!)),
        );
        setTabs(
          restored.map((tab) => ({ ...tab, projectId: activeProjectId })),
          enabled("tabs") && typeof layout.activeTabId === "string" ? layout.activeTabId : null,
        );
        loadBots(activeProjectId, layout.bots as BotWorkspace | null | undefined);
        if (desktopClient && currentTopOnly) {
          useBots.getState().createSolo(activeProjectId);
        }
        if (currentTopOnly || forceTophsOnLoad.current) {
          forceTophsOnLoad.current = false;
          setSidebar("bots");
        } else if (layout.sidebar) {
          const savedSidebar = restoredSidebar(layout.sidebar);
          const savedFeature = sidebarFeature(savedSidebar);
          setSidebar(
            savedFeature && !enabled(savedFeature)
              ? "bots"
              : savedSidebar,
          );
        }
        setTerminalOpen(
          enabled("terminal") && !currentTopOnly && (
            typeof layout.terminalOpen === "boolean" ? layout.terminalOpen : !desktopClient
          ),
        );
        loadedProject.current = activeProjectId;
        setProjectEpoch((value) => value + 1);
      })
      .catch((error) => {
        if (!cancelled) {
          if (forceTophsOnLoad.current) {
            forceTophsOnLoad.current = false;
            setSidebar("bots");
          }
          notify("error", error instanceof Error ? error.message : "Could not restore workspace.");
        }
      });
    return () => {
      cancelled = true;
      useBots.getState().unload(activeProjectId);
    };
  }, [activeProjectId, desktopClient, loadBots, notify, setSidebar, setTabs, setTerminalOpen]);

  useEffect(() => {
    if (!activeProjectId || (!filesEnabled && !sourceControlEnabled)) {
      setGitStatus("");
      return;
    }
    api
      .gitStatus(activeProjectId)
      .then(setGitStatus)
      .catch(() => setGitStatus(""));
  }, [activeProjectId, tabs.length, filesEnabled, sourceControlEnabled]);


  const layoutTabs = useMemo(
    () =>
      tabs.map(({ content: _content, hash: _hash, dirty: _dirty, autoRun: _autoRun, ...rest }) => rest),
    [tabs],
  );

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
  }, [activeProjectId, layoutTabs, terminalOpen, sidebar, activeTabId, projectEpoch, snapshotBots]);

  // Subscribe outside the render tree so message/tool updates do not re-render
  // the whole workbench. The debounce still persists the latest bot history.
  useEffect(() => {
    if (!activeProjectId) return;
    let timer: number | undefined;
    const unsubscribe = useBots.subscribe((state, previous) => {
      if (state.byProject[activeProjectId] === previous.byProject[activeProjectId]) return;
      if (loadedProject.current !== activeProjectId) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        api
          .saveLayout(activeProjectId, {
            tabs: layoutTabs,
            activeTabId,
            sidebar,
            terminalOpen,
            bots: useBots.getState().snapshot(activeProjectId),
          })
          .catch(() => undefined);
      }, 500);
    });
    return () => {
      unsubscribe();
      if (timer) window.clearTimeout(timer);
    };
  }, [activeProjectId, layoutTabs, activeTabId, sidebar, terminalOpen, projectEpoch]);

  // Message history is persisted independently from the lightweight workspace
  // layout. Only new or changed messages are sent; pages loaded from the
  // backend are never written back.
  useEffect(() => {
    const timers = new Map<string, number>();
    const inFlight = new Set<string>();

    const schedule = (projectId: string, delay = 350) => {
      if (timers.has(projectId) || inFlight.has(projectId)) return;
      timers.set(projectId, window.setTimeout(() => {
        timers.delete(projectId);
        void flush(projectId);
      }, delay));
    };

    const flush = async (projectId: string) => {
      const messages = useBots.getState().pendingMessageWrites(projectId);
      if (messages.length === 0 || inFlight.has(projectId)) return;
      inFlight.add(projectId);
      let retry = false;
      try {
        await api.saveWorkspaceMessages(projectId, messages);
        useBots.getState().acknowledgeMessageWrites(projectId, messages);
      } catch {
        retry = true;
      } finally {
        inFlight.delete(projectId);
        if (useBots.getState().pendingMessageWrites(projectId).length > 0) schedule(projectId, retry ? 2_000 : 350);
      }
    };

    const schedulePending = (writes: Record<string, Record<string, unknown>>) => {
      for (const [projectId, messages] of Object.entries(writes)) {
        if (Object.keys(messages).length > 0) schedule(projectId);
      }
    };
    schedulePending(useBots.getState().messageWrites);
    const unsubscribe = useBots.subscribe((state, previous) => {
      if (state.messageWrites !== previous.messageWrites) schedulePending(state.messageWrites);
    });
    return () => {
      unsubscribe();
      for (const timer of timers.values()) window.clearTimeout(timer);
    };
  }, []);

  // Mode is a deliberate choice: persist it immediately so leaving and
  // returning to Tophs does not fall back to the other thread.
  useEffect(() => {
    if (!activeProjectId || loadedProject.current !== activeProjectId) return;
    const mode = botMode;
    if (!mode || savedMode.current === mode) return;
    savedMode.current = mode;
    void api
      .saveLayout(activeProjectId, {
        tabs: layoutTabs,
        activeTabId,
        sidebar,
        terminalOpen,
        bots: snapshotBots(activeProjectId),
      })
      .catch(() => undefined);
  }, [activeProjectId, botMode, layoutTabs, terminalOpen, sidebar, activeTabId, projectEpoch, snapshotBots]);

  function switchProject(next: string) {
    if (next === activeProjectId) return;
    if (project && loadedProject.current === project.id) {
      void api.saveLayout(project.id, {
        tabs: layoutTabs,
        activeTabId,
        sidebar,
        terminalOpen,
        bots: snapshotBots(project.id),
      });
    }
    forceTophsOnLoad.current = true;
    loadedProject.current = null;
    setActiveProject(next);
  }







  async function loadBranches() {
    if (!project || !featureIsEnabled("sourceControl")) return;
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
    if (!project || !featureIsEnabled("sourceControl")) return;
    setBranchMenuOpen(true);
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
    if (!project || !featureIsEnabled("files")) return;
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
    if (!project || !featureIsEnabled("databases")) return;
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
    if (!project || !featureIsEnabled("files")) return;
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
    if (!project || !featureIsEnabled("databases")) return;
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
    const state = useBots.getState();
    const workspace = state.byProject[projectId];
    const targetMode = workspace
      ? botThread(workspace, "solo").bots.some((bot) => bot.id === botId)
        ? "solo"
        : botThread(workspace, "team").bots.some((bot) => bot.id === botId)
          ? "team"
          : null
      : null;
    if (!workspace?.hydrated) {
      pendingBotSelection.current = { projectId, botId };
      return;
    }
    if (!targetMode) {
      pendingBotSelection.current = null;
      return;
    }
    if ((workspace.mode ?? "solo") !== targetMode) state.setMode(projectId, targetMode);
    state.setActiveBot(projectId, botId);
    pendingBotSelection.current = null;
  }

  function openNotification(notification: AppNotification) {
    if (!notification.projectId) return;
    setBranchMenuOpen(false);
    markNotificationRead(notification.id);
    const switchingProject = notification.projectId !== activeProjectId;
    if (switchingProject) {
      forceTophsOnLoad.current = true;
      setActiveProject(notification.projectId);
    }
    if (notification.botId) {
      if (switchingProject) pendingBotSelection.current = { projectId: notification.projectId, botId: notification.botId };
      else selectBot(notification.projectId, notification.botId);
    }
    setSidebar("bots");
    setTerminalOpen(false);
  }


  function openWeb(target: WebTarget) {
    if (!project || !featureIsEnabled("webApps")) return;
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
    const next = await api.createProject(repo.name, repo.path, "#FFB547");
    forceTophsOnLoad.current = true;
    setActiveProject(next.id);
    setProjects([...projects, next]);
    setShowRepoPicker(false);
    notify("success", `Opened ${next.name}.`);
  }

  function requestCloseProject(id: string) {
    const target = projects.find((item) => item.id === id);
    if (!target) return;
    setCloseError("");
    setCloseTarget(target);
  }

  async function confirmCloseProject() {
    if (!closeTarget || closeBusy) return;
    const id = closeTarget.id;
    const target = closeTarget;
    setCloseBusy(true);
    setCloseError("");
    try {
      const sessions = botSessionIds(useBots.getState().byProject[id]);
      await Promise.all(sessions.map((sessionId) => api.interruptOpencodeSession(sessionId).catch(() => undefined)));
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
      const result = await api.closeProject(id);
      useBots.getState().forget(id);
      useTophDrafts.getState().clearProject(id);
      if (activeProjectId === id) {
        forceTophsOnLoad.current = true;
        loadedProject.current = null;
      }
      closeProjectTab(id);
      setCloseTarget(null);
      const count = result.processes.length;
      notify("info", `Projeto ${target.name} fechado. ${count} processo${count === 1 ? "" : "s"} encerrado${count === 1 ? "" : "s"}.`);
      if (result.failed.length > 0) {
        notify("error", `${result.failed.length} processo${result.failed.length === 1 ? "" : "s"} não puderam ser encerrados.`);
      }
    } catch (error) {
      setCloseError(error instanceof Error ? error.message : "Não foi possível fechar o projeto.");
    } finally {
      setCloseBusy(false);
    }
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
                      <Avatar size="sm" initials={item.name.slice(0, 1).toUpperCase()} className="bg-accent-500/15 text-caption-2-semibold text-accent-500" />
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


  const activityHeaderControl = (
    <IconButton
      icon={activityVisible ? PanelLeftClose : PanelLeftOpen}
      size="xs"
      className="border-transparent bg-transparent shadow-none"
      aria-label={activityVisible ? "Ocultar barra vertical" : "Mostrar barra vertical"}
      title={activityVisible ? "Ocultar barra vertical" : "Mostrar barra vertical"}
      onClick={() => setWorkspaceFeature("activityBar", !activityVisible)}
    />
  );

  const SidebarContent = () => (
    <>
      {project && sidebar === "files" && featureIsEnabled("files") && <ExplorerPanel project={project} headerControl={activityHeaderControl} onOpenFile={openFile} onStatusChange={setGitStatus} />}
      {project && sidebar === "db" && featureIsEnabled("databases") && <DatabasesPanel project={project} headerControl={activityHeaderControl} onOpenQuery={openQuery} onOpenTable={openTable} />}
      {project && sidebar === "scm" && featureIsEnabled("sourceControl") && <SourceControlPanel project={project} view="scm" headerControl={activityHeaderControl} branchControl={activityBranchControl} onOpenDiff={openDiff} onStatusChange={setGitStatus} />}
      {project && sidebar === "web" && featureIsEnabled("webApps") && <WebSidebar headerControl={activityHeaderControl} onOpenWeb={openWeb} />}
      {project && sidebar === "bots" && <BotsSidebar project={project} headerControl={activityHeaderControl} />}
      {project && sidebar === "debug" && featureIsEnabled("debug") && (
        <div className="flex h-full min-h-0 flex-col">
          <SidebarHeader control={activityHeaderControl} title="Debug" />
          <p className="p-3 text-caption-1-regular leading-relaxed text-text-tertiary">A execução e as ferramentas de depuração aparecem no painel principal.</p>
        </div>
      )}
    </>
  );

  function branchPickerBody() {
    return (
      <BranchPicker
        current={branchInfo?.current || branch || "detached"}
        branches={visibleBranches}
        filter={branchFilter}
        onFilterChange={setBranchFilter}
        onCheckout={(name) => void checkoutBranch(name)}
        onCreate={() => { setNewBranchName(""); setBranchCreateOpen(true); }}
        onDeleteOthers={() => void deleteOtherBranches()}
        onRetry={() => void loadBranches()}
        error={branchError}
        loading={!branchInfo && !branchError}
        busy={branchBusy}
        count={branchInfo?.branches.length}
        deleteDisabled={!branchInfo || branchInfo.branches.length <= 1}
      />
    );
  }
  const activityProjectControl = (
    <ActivityPopover
      open={projectsMenuOpen}
      onOpenChange={(next) => { setProjectsMenuOpen(next); setBranchMenuOpen(false); }}
      panelClassName="w-[min(320px,calc(100vw-64px))] p-2.5"
      trigger={
        <button type="button" className="relative flex size-10 items-center justify-center rounded-full hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring" aria-label={`Trocar projeto. Projeto atual: ${project.name}`} title={`${project.name} · trocar projeto`} onClick={() => setProjectsMenuOpen((open) => !open)}>
          <BrandMark size="small" className="size-6" />
          <span className="absolute -bottom-0.5 -end-0.5 flex size-3.5 items-center justify-center rounded-full border border-background-primary-default bg-background-tertiary-default text-text-secondary"><ChevronDown size={9} /></span>
        </button>
      }
    >
      <ProjectSwitcher
        onSelect={(id) => { setProjectsMenuOpen(false); switchProject(id); }}
        onCloseProject={(id) => { setProjectsMenuOpen(false); requestCloseProject(id); }}
        onOpenRepo={() => { setProjectsMenuOpen(false); setShowRepoPicker(true); }}
      />
    </ActivityPopover>
  );
  const activityBranchControl = sourceControlEnabled ? (
    <ActivityPopover
      open={branchMenuOpen}
      onOpenChange={(next) => { setBranchMenuOpen(next); setProjectsMenuOpen(false); if (next) openBranchMenu(); }}
      panelClassName="w-[min(460px,calc(100vw-64px))]"
      trigger={
        <Button variant={branchMenuOpen ? "secondary" : "ghost"} size="small" leadingIcon={GitBranch} className="w-full justify-start" aria-label={`Branch ${branch || "detached"}`} title={branch || "detached"} onClick={() => { const next = !branchMenuOpen; setBranchMenuOpen(next); setProjectsMenuOpen(false); if (next) openBranchMenu(); }}>
          <span className="min-w-0 flex-1 truncate text-start">{branch || "detached"}</span>
          <ChevronDown size={12} className="shrink-0" />
        </Button>
      }
    >
      <div className="max-h-[min(600px,calc(100dvh-24px))] overflow-y-auto">{branchPickerBody()}</div>
    </ActivityPopover>
  ) : null;

  const primarySidebar = (
    <Suspense fallback={null}>
      <div className="relative z-40 flex min-h-0 shrink-0 overflow-visible rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar">
        {activityVisible ? <div className="overflow-visible rounded-s-3xl">
          <ActivityBar
            projectControl={activityProjectControl}
            settingsControl={<TophSettings user={user} projectRoot={project.root} onOpenNotification={openNotification} />}
            onQuickOpen={() => setQuickOpenToken((current) => current + 1)}
          />
        </div> : null}
        {effectiveSidebarVisible ? (
          <aside className={cx("relative flex min-h-0 shrink-0 flex-col overflow-hidden bg-background-primary-default", activityVisible ? "rounded-e-[22px]" : "rounded-[22px]", botsView ? "w-[clamp(220px,22vw,var(--sidebar-width))]" : "w-[var(--sidebar-width)]")}>
            <SidebarContent />
          </aside>
        ) : null}
      </div>
    </Suspense>
  );
  const primaryResize = effectiveSidebarVisible ? (
    <ResizeHandle className="sidebar-resize" orientation="vertical" value={sidebarWidth} min={220} max={320} label="Redimensionar barra lateral" onChange={(width) => document.documentElement.style.setProperty("--sidebar-width", `${width}px`)} onCommit={(width) => updateSettings({ sidebarWidth: width })} />
  ) : null;

  if (mobile) return <Suspense fallback={null}><MobileApp /></Suspense>;

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-background-full">
      <div className="pointer-events-none absolute inset-x-0 top-2 z-[100] flex justify-center px-12">
        <div className="pointer-events-auto w-full max-w-xl"><QuickOpen project={project} focusToken={quickOpenToken} onOpenFile={openFile} floating /></div>
      </div>
      <div className="flex min-h-0 flex-1 gap-0 p-1">
        {primarySidebar}
        {primaryResize}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-hidden">
          <main className={cx(
            "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
            sidebar === "bots" && project ? "bg-transparent" : "rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar",
          )}>
            {sidebar === "bots" && project ? (
              <BotStudioTab key={project.id} project={project} />
            ) : sidebar === "debug" && project && featureIsEnabled("debug") ? (
              <DebugPanel project={project} />
            ) : (
              <>
                {tabsVisible ? <Tabs /> : null}
                <div className="relative flex min-h-0 flex-1 overflow-hidden">
                  {!activeTab && project && (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
                      <BrandMark size="large" />
                      <h2 className="text-title-2-medium text-text-primary">{project.name}</h2>
                      <p className="max-w-lg text-body-regular text-text-secondary">{project.root}</p>
                       <div className="flex flex-wrap items-center justify-center gap-2">
                         {featureIsEnabled("files") && <Button variant="secondary" size="small" onClick={() => selectSidebar("files")}>Explorer</Button>}
                         {featureIsEnabled("databases") && <Button variant="secondary" size="small" onClick={() => selectSidebar("db")}>Database</Button>}
                         <Button variant="secondary" size="small" onClick={() => setSidebar("bots")}>Tophs</Button>
                       </div>
                    </div>
                  )}
                  <Suspense fallback={null}>
                    {tabsVisible && activeTab?.kind === "editor" && project && featureIsEnabled("files") && <EditorPanel debugEnabled={debugEnabled} tab={activeTab} project={project} onOpenChanges={(path) => openDiff(path, false)} />}
                    {tabsVisible && activeTab?.kind === "db" && featureIsEnabled("databases") && <DbPanelTab tab={activeTab} />}
                    {tabsVisible && activeTab?.kind === "web" && featureIsEnabled("webApps") && <WebPanelTab tab={activeTab} />}
                    {tabsVisible && activeTab?.kind === "diff" && project && featureIsEnabled("files") && <DiffPanelTab tab={activeTab} project={project} />}
                  </Suspense>
                </div>
              </>
            )}
          </main>

          {project && sidebar !== "bots" && featureIsEnabled("terminal") && terminalOpen ? (
            <Suspense fallback={null}>
              <div className="flex w-full min-w-0 shrink-0 overflow-hidden">
                <TerminalPanel key={project.id} project={project} onOpenFile={openFile} />
              </div>
            </Suspense>
          ) : null}
        </div>
      </div>

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
        isOpen={layoutOpen}
        onClose={() => setLayoutOpen(false)}
        title="Recursos do workspace"
        description="O Toph fica sempre ativo. Os demais recursos só são inicializados quando você os ativa."
        size="md"
        footer={<Button variant="secondary" onClick={() => setLayoutOpen(false)}>Concluir</Button>}
      >
        <div className="flex flex-col gap-0.5">
          <div className="mb-1 px-2 text-caption-1-regular text-text-tertiary">Interface</div>
          <LayoutRow label="Barra lateral" shortcut="Ctrl+B" checked={workspaceFeatures.primarySidebar} onChange={(value) => setWorkspaceFeature("primarySidebar", value)} />
          <LayoutRow label="Abas e conteúdo" checked={workspaceFeatures.tabs} onChange={(value) => setWorkspaceFeature("tabs", value)} />
          <LayoutRow
            label="Terminal e painel"
            shortcut="Ctrl+J"
            checked={workspaceFeatures.terminal}
            onChange={(value) => {
              setWorkspaceFeature("terminal", value);
              if (value) setTerminalOpen(true);
            }}
          />
        </div>

        <LayoutSection label="Ferramentas">
          <LayoutRow label="Explorer e editor" checked={workspaceFeatures.files} onChange={(value) => setWorkspaceFeature("files", value)} />
          <LayoutRow label="Controle de código-fonte" checked={workspaceFeatures.sourceControl} onChange={(value) => setWorkspaceFeature("sourceControl", value)} />
          <LayoutRow label="Bancos de dados" checked={workspaceFeatures.databases} onChange={(value) => setWorkspaceFeature("databases", value)} />
          <LayoutRow label="Aplicativos web" checked={workspaceFeatures.webApps} onChange={(value) => setWorkspaceFeature("webApps", value)} />
          <LayoutRow label="Debug" checked={workspaceFeatures.debug} onChange={(value) => setWorkspaceFeature("debug", value)} />
          <LayoutRow label="Tophs" checked disabled onChange={() => undefined} />
          <p className="px-2 pt-1 text-caption-2-regular text-text-tertiary">O Toph é o único recurso obrigatório e sempre começa ativo.</p>
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

      {showRepoPicker && <RepoPicker onClose={() => setShowRepoPicker(false)} onOpen={openRepo} />}
      <CloseProjectModal
        open={Boolean(closeTarget)}
        project={closeTarget}
        busy={closeBusy}
        error={closeError}
        mobile={mobile}
        onClose={() => { if (!closeBusy) setCloseTarget(null); }}
        onConfirm={() => void confirmCloseProject()}
      />
      <Toasts />
    </div>
  );
}

function LayoutRow({ label, shortcut, checked, disabled = false, onChange }: { label: string; shortcut?: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className={cx("flex h-9 items-center justify-between rounded-lg px-2", disabled ? "opacity-70" : "hover:bg-background-primary-hover")}>
      <Checkbox isSelected={checked} isDisabled={disabled} onChange={onChange}>{label}</Checkbox>
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
