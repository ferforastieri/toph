import { useProjectStream } from "../../features/projects/hooks/useProjectStream";
import { useLayoutTabs, useWorkspacePersistence } from "../../features/projects/hooks/useWorkspacePersistence";
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Bot, ChevronDown, ChevronRight, GitBranch, PanelLeftClose, PanelLeftOpen, X } from "@toph/icons";
import { api, getApiBase, type Project, type SchemaTable, type WebTarget } from "../../shared/api";
import { basename, expandGitPattern, quoteIdentifier, sanitizeBranchName } from "../../shared/lib";
import { useApp, type Sidebar, type Tab } from "../store";
import { chatDisplayName, latestChatForToph, useChats, type ProjectChats, type TophChat } from "../../features/conversations/store";
import { ensureChatSubjects } from "../../features/conversations/subjects";
import { chatTabId } from "../../features/conversations/navigation";
import { useAI } from "../../features/providers/store";
import { PROJECT_EVENT, type ProjectEvent } from "../../features/projects/events";
import BotStudioTab from "../../features/conversations/components/BotStudioTab";
import { featureEnabled, isDesktopClient, isTophOnly, sidebarFeature, useSettings, type WorkspaceFeature } from "../../features/settings/store";
import Tabs from "./Tabs";
import Toasts from "../../features/notifications/components/Toasts";
import GlobalSearch from "../../features/search/components/GlobalSearch";
import CloseProjectModal from "../../features/projects/components/CloseProjectModal";
import BranchPicker from "../../features/git/components/BranchPicker";
import TopBar, { ProjectRail } from "./TopBar";
import QuickOpen from "../../features/explorer/components/QuickOpen";
import ActivityPopover from "../../features/notifications/components/ActivityPopover";
import { handleAiCompletion, type AiCompletionPayload } from "../../features/notifications/completion";
import { unlockBotSound } from "../../features/conversations/sound";
import SidebarHeader from "./SidebarHeader";
import { IconButton } from "@toph/ui/app";
import BrandMark from "@toph/brand";
import { Button } from "@toph/ui/app";
import { Input } from "@toph/ui/app";
import { Avatar } from "@toph/ui/app";
import { Checkbox } from "@toph/ui/app";
import { Radio, RadioGroup } from "@toph/ui/app";
import { Kbd } from "@toph/ui/app";
import { Modal } from "@toph/ui/app";
import ResizeHandle from "../../shared/ui/resize";
import { isMobileViewport, useIsMobile } from "../../shared/ui/useIsMobile";
import { useConfirm } from "../../shared/ui/confirm";
import { agentApi } from "../../features/agents/api";
import { useAgentActivityBridge } from "../../features/agents/activity";
import { useTophDrafts } from "../../features/agents/drafts";
import { ensureSingleToph, ensureToph } from "../../features/agents/default-toph";
import { cx } from "@toph/ui/app/utils/cx";
import { suggestGitChanges } from "../../features/git/ai";
import { parseGitStatus } from "../../features/git/status";
import TophSettings from "../../features/settings/components/TophSettings";

const MobileApp = lazy(() => import("../layouts/mobile/MobileApp"));
const ExplorerPanel = lazy(() => import("../../features/explorer/components/ExplorerPanel"));
const DatabasesPanel = lazy(() => import("../../features/databases/components/DatabasesPanel"));
const WebSidebar = lazy(() => import("../../features/previews/components/WebSidebar"));
const EditorPanel = lazy(() => import("../../features/editor/components/EditorPanel"));
const DbPanelTab = lazy(() => import("../../features/databases/components/DbPanelTab"));
const DebugPanel = lazy(() => import("../../features/debug/components/DebugPanel"));
const BotsSidebar = lazy(() => import("../../features/agents/components/BotsSidebar"));
const WebPanelTab = lazy(() => import("../../features/previews/components/WebPanelTab"));
const DiffPanelTab = lazy(() => import("../../features/editor/components/DiffPanelTab"));
const TerminalPanel = lazy(() => import("../../features/terminal/components/TerminalPanel"));
const SourceControlPanel = lazy(() => import("../../features/git/components/SourceControlPanel"));

type RightPanel = "files" | "scm" | "db" | "web" | "debug" | "bots";
const rightPanelFeatures: Record<RightPanel, WorkspaceFeature | null> = {
  files: "files",
  scm: "sourceControl",
  db: "databases",
  web: "webApps",
  debug: "debug",
  bots: null,
};

function rightPanelForSidebar(sidebar: Sidebar): RightPanel | null {
  switch (sidebar) {
    case "files":
    case "scm":
    case "db":
    case "web":
    case "debug":
    case "bots":
      return sidebar;
    default:
      return null;
  }
}

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
    default:
      return "bots";
  }
}

export default function Workbench() {
  const projects = useApp((state) => state.projects);
  const user = useApp((state) => state.user);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const openProjectIds = useApp((state) => state.openProjectIds);
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
  const chatsHydrated = useChats((state) => activeProjectId ? state.byProject[activeProjectId]?.hydrated === true : false);
  const pendingTophSelection = useRef<{ projectId: string; tophId: string; chatId?: string } | null>(null);
  const pendingChatOpen = useRef<{ projectId: string; chatId: string; title?: string } | null>(null);
  const loadChats = useChats((state) => state.load);
  const snapshotChats = useChats((state) => state.snapshot);
  const loadAI = useAI((state) => state.load);
  const loadModels = useAI((state) => state.loadModels);
  const branchPattern = useSettings((state) => state.gitBranchPattern);
  const aiConfig = useAI((state) => state.config);
  const sidebarWidth = useSettings((state) => state.sidebarWidth);
  const rightPanelWidth = useSettings((state) => state.aiPanelWidth);
  const updateSettings = useSettings((state) => state.update);
  const workspaceFeatures = useSettings((state) => state.workspaceFeatures);
  const confirm = useConfirm();

  const [closeTarget, setCloseTarget] = useState<Project | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [gitStatus, setGitStatus] = useState("");
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branchCreateOpen, setBranchCreateOpen] = useState(false);
  const [quickOpenToken, setQuickOpenToken] = useState(0);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>("files");
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const tabsVisible = workspaceFeatures.tabs;
  const effectiveSidebarVisible = true;
  const panelAlignment = useSettings((state) => state.panelAlignment);
  const projectBar = useSettings((state) => state.projectBar);
  const [projectRailCollapsed, setProjectRailCollapsed] = useState(false);
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
  const rightPanelFeature = rightPanelFeatures[rightPanel];
  const rightPanelAvailable = !rightPanelFeature || featureEnabled(workspaceFeatures, rightPanelFeature);

  function featureIsEnabled(feature: WorkspaceFeature): boolean {
    return featureEnabled(workspaceFeatures, feature);
  }

  function selectSidebar(next: Sidebar): void {
    const feature = sidebarFeature(next);
    if (feature && !featureIsEnabled(feature)) return;
    setSidebar(next);
  }

  function openAuxiliary(panel: Sidebar): void {
    const target = rightPanelForSidebar(panel);
    if (!target) return;
    const feature = rightPanelFeatures[target];
    if (feature && !featureIsEnabled(feature)) return;
    setRightPanel(target);
    setRightPanelOpen(true);
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
    if (rightPanelOpen && rightPanelFeature && !featureEnabled(workspaceFeatures, rightPanelFeature)) {
      setRightPanelOpen(false);
    }
  }, [workspaceFeatures, sidebar, terminalOpen, terminalEnabled, rightPanel, rightPanelOpen, rightPanelFeature, setSidebar, setTerminalOpen]);

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
    void loadAI().then(() => loadModels());
  }, [loadAI, loadModels]);

  // WebViews block audio until the user interacts, so warm the audio context on
  // the first gesture and revive it if the system suspended it later.
  useEffect(() => {
    window.addEventListener("pointerdown", unlockBotSound, true);
    window.addEventListener("keydown", unlockBotSound, true);
    return () => {
      window.removeEventListener("pointerdown", unlockBotSound, true);
      window.removeEventListener("keydown", unlockBotSound, true);
    };
  }, []);

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

  useProjectStream(projectEventsEnabled);

  // The open project list is shared across devices: pull it once, then push
  // every change. Notifications come from the same server store.
  const openProjectsReady = useRef(false);
  const syncedOpenProjects = useRef("");
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const ids = await api.openProjects();
        if (cancelled) return;
        if (ids.length > 0) {
          syncedOpenProjects.current = ids.join("|");
          useApp.getState().setOpenProjectIds(ids);
        } else {
          // Nothing saved yet (first run on this account). The desktop is the
          // reference workspace, so a phone must not replace its open projects
          // with whatever list it happened to keep locally. A phone still
          // publishes when the user opens or closes a project on purpose.
          const local = useApp.getState().openProjectIds;
          const phoneShell =
            isMobileViewport() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
          if (local.length > 0 && !phoneShell) {
            syncedOpenProjects.current = local.join("|");
            await api.saveOpenProjects(local);
          }
        }
      } catch {
        // Offline: keep the local list and try again on the next change.
      } finally {
        if (!cancelled) openProjectsReady.current = true;
      }
    };
    const pullNotifications = () => {
      void api.notifications()
        .then((items) => { if (!cancelled) useApp.getState().hydrateNotifications(items); })
        .catch(() => undefined);
    };
    void pull();
    pullNotifications();

    // Coming back to this device must show what happened on the other ones.
    const resync = () => {
      if (document.visibilityState === "hidden") return;
      pullNotifications();
      if (!openProjectsReady.current) return;
      const current = useApp.getState().openProjectIds.join("|");
      if (current === syncedOpenProjects.current) {
        void pull();
      } else {
        // A local change is still on its way to the server; do not clobber it.
        syncedOpenProjects.current = current;
        void api.saveOpenProjects(useApp.getState().openProjectIds).catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
    };
  }, []);

  useEffect(() => {
    if (!openProjectsReady.current) return;
    const snapshot = openProjectIds.join("|");
    const timer = window.setTimeout(() => {
      void api.saveOpenProjects(openProjectIds)
        .then(() => { syncedOpenProjects.current = snapshot; })
        .catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [openProjectIds]);

  // Old sessions only know their Toph names; read their first message once so
  // the tab labels can show what each conversation is about.
  useEffect(() => {
    if (!activeProjectId || !chatsHydrated) return;
    const projectChats = useChats.getState().byProject[activeProjectId];
    if (!projectChats) return;
    const openChats = tabs
      .filter((tab) => tab.kind === "ai" && tab.chatId)
      .map((tab) => projectChats.chats.find((chat) => chat.id === tab.chatId))
      .filter((chat): chat is TophChat => Boolean(chat));
    void ensureChatSubjects(activeProjectId, openChats);
  }, [activeProjectId, chatsHydrated, tabs]);

  // Reading a conversation clears its unread answers, but only while it is on
  // screen: background completions keep their badge until the tab is opened.
  useEffect(() => {
    const mark = () => {
      const state = useApp.getState();
      const tab = state.tabs.find((item) => item.id === state.activeTabId);
      if (!tab || tab.kind !== "ai" || !tab.chatId) return;
      if (document.visibilityState !== "visible") return;
      if (isMobileViewport() && state.mobileScreen !== "bots") return;
      state.markChatNotificationsRead(tab.chatId);
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    window.addEventListener("focus", mark);
    return () => {
      document.removeEventListener("visibilitychange", mark);
      window.removeEventListener("focus", mark);
    };
  }, [activeTabId]);

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
    type PushPayload = AiCompletionPayload & { opened?: string };
    const handler = (payload: PushPayload) => {
      if (payload.opened === "true" && payload.projectId) {
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("toph:open-bot", { detail: payload })), 0);
        return;
      }
      handleAiCompletion(payload);
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
      const chatId = (payload as { chatId?: string }).chatId;
      state.setActiveProject(payload.projectId);
      forceTophsOnLoad.current = true;
      if (payload.botId) {
        if (switchingProject) pendingTophSelection.current = { projectId: payload.projectId, tophId: payload.botId, chatId };
        else openTophConversation(payload.projectId, payload.botId, chatId);
      } else if (chatId) {
        const chats = useChats.getState().byProject[payload.projectId];
        if (switchingProject || !chats?.hydrated) pendingChatOpen.current = { projectId: payload.projectId, chatId };
        else openConversation(payload.projectId, chatId);
      }
      state.setSidebar("bots");
    };
    window.addEventListener("toph:open-bot", onOpenBot as EventListener);
    return () => window.removeEventListener("toph:open-bot", onOpenBot as EventListener);
  }, []);

  useEffect(() => {
    const onOpenChat = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string; chatId?: string; title?: string }>).detail;
      if (!detail?.projectId || !detail.chatId) return;
      const state = useApp.getState();
      if (state.activeProjectId !== detail.projectId) {
        pendingChatOpen.current = { projectId: detail.projectId, chatId: detail.chatId, title: detail.title };
        state.setActiveProject(detail.projectId);
        state.setSidebar("bots");
        return;
      }
      const chats = useChats.getState().byProject[detail.projectId];
      if (!chats?.hydrated) {
        pendingChatOpen.current = { projectId: detail.projectId, chatId: detail.chatId, title: detail.title };
        return;
      }
      openConversation(detail.projectId, detail.chatId, detail.title);
      state.setSidebar("bots");
    };
    window.addEventListener("toph:open-chat", onOpenChat);
    return () => window.removeEventListener("toph:open-chat", onOpenChat);
  }, []);

  useEffect(() => {
    const pending = pendingChatOpen.current;
    if (!pending || pending.projectId !== activeProjectId || !chatsHydrated) return;
    pendingChatOpen.current = null;
    openConversation(pending.projectId, pending.chatId, pending.title);
  }, [activeProjectId, chatsHydrated]);

  useEffect(() => {
    const pending = pendingTophSelection.current;
    if (!pending || pending.projectId !== activeProjectId || !chatsHydrated) return;
    openTophConversation(pending.projectId, pending.tophId, pending.chatId);
  }, [activeProjectId, chatsHydrated]);

  // A deleted conversation (or a deleted participant) must not leave a dead tab.
  useEffect(() => {
    if (!activeProjectId || !chatsHydrated) return;
    const chats = useChats.getState().byProject[activeProjectId];
    const ids = new Set((chats?.chats ?? []).map((chat) => chat.id));
    const kept = tabs.filter((tab) => tab.kind !== "ai" || (tab.chatId && ids.has(tab.chatId)));
    if (kept.length === tabs.length) return;
    const nextActive = kept.some((tab) => tab.id === activeTabId) ? activeTabId : kept[0]?.id ?? null;
    setTabs(kept, nextActive);
  }, [activeProjectId, chatsHydrated, tabs, activeTabId, setTabs]);


  useEffect(() => {
    api
      .projects()
      .then((items) => {
        setProjects(items);
      })
      .catch((error) => {
        notify("error", error instanceof Error ? error.message : "Could not load projects.");
      });
  }, [notify, setProjects]);

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    useChats.getState().unload(activeProjectId);
    loadedProject.current = null;
    setTabs([]);
    const initialFeatures = useSettings.getState().workspaceFeatures;
    const initialEnabled = (feature: WorkspaceFeature) => featureEnabled(initialFeatures, feature);
    const initialTopOnly = isTophOnly(initialFeatures);
    setTerminalOpen(initialEnabled("terminal") && !initialTopOnly && !desktopClient);
    setSidebar("bots");
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
            (tab.kind === "ai" ? typeof tab.chatId === "string" : enabled("tabs")) &&
            ["editor", "db", "web", "diff", "ai"].includes(tab.kind) &&
            (!tabFeature(tab) || enabled(tabFeature(tab)!)),
        );
        const restoredActive = typeof layout.activeTabId === "string" && restored.some((tab) => tab.id === layout.activeTabId)
          ? layout.activeTabId
          : null;
        setTabs(restored.map((tab) => ({ ...tab, projectId: activeProjectId })), restoredActive);
        const storedChats = layout.chats as ProjectChats | null | undefined;
        const migratingTophs = !storedChats || storedChats.version !== 5;
        loadChats(activeProjectId, storedChats);
        const { removedIds } = ensureSingleToph(activeProjectId);
        for (const id of removedIds) void agentApi.deleteToph(activeProjectId, id).catch(() => undefined);
        if (currentTopOnly || forceTophsOnLoad.current || migratingTophs) {
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
      useChats.getState().unload(activeProjectId);
    };
  }, [activeProjectId, desktopClient, loadChats, notify, setSidebar, setTabs, setTerminalOpen]);

  useEffect(() => {
    if (!activeProjectId || (!filesEnabled && !sourceControlEnabled)) {
      setGitStatus("");
      return;
    }
    api
      .gitStatus(activeProjectId)
      .then(setGitStatus)
      .catch(() => setGitStatus(""));
  }, [activeProjectId, filesEnabled, sourceControlEnabled]);


  const layoutTabs = useLayoutTabs(tabs);
  useWorkspacePersistence(activeProjectId, loadedProject.current === activeProjectId, {
    tabs: layoutTabs, activeTabId, sidebar, terminalOpen,
  }, projectEpoch);
  useAgentActivityBridge(openProjectIds);

  function switchProject(next: string) {
    if (next === activeProjectId) return;
    if (project && loadedProject.current === project.id) {
      void api.saveLayout(project.id, {
        tabs: layoutTabs,
        activeTabId,
        sidebar,
        terminalOpen,
        chats: snapshotChats(project.id),
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

  function openConversation(projectId: string, chatId: string, title?: string) {
    const chats = useChats.getState().byProject[projectId];
    const chat = chats?.chats.find((item) => item.id === chatId);
    if (!chat) return;
    openTab({
      id: chatTabId(projectId, chatId),
      kind: "ai",
      title: title?.trim() || chatDisplayName(chats, chat, 2) || "Toph",
      projectId,
      chatId,
    });
    useChats.getState().setActiveChat(projectId, chatId);
    useChats.getState().touchConversation(projectId, chatId);
  }

  function newConversation() {
    if (!project) return;
    const toph = ensureToph(project.id);
    if (!toph) return;
    const chat = useChats.getState().createConversation(project.id, [toph.id], { name: toph.name });
    if (chat) openConversation(project.id, chat.id, toph.name);
  }

  function openTophConversation(projectId: string, tophId: string, chatId?: string) {
    const chats = useChats.getState().byProject[projectId];
    if (!chats?.hydrated) {
      pendingTophSelection.current = { projectId, tophId, chatId };
      return;
    }
    if (!chats.tophs.some((item) => item.id === tophId)) {
      pendingTophSelection.current = null;
      return;
    }
    const chat = (chatId ? chats.chats.find((item) => item.id === chatId && item.participantIds.includes(tophId)) : null)
      ?? latestChatForToph(chats, tophId)
      ?? useChats.getState().createConversation(projectId, [tophId]);
    pendingTophSelection.current = null;
    if (chat) openConversation(projectId, chat.id);
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
      if (activeProjectId === id && loadedProject.current === id) {
        await api
          .saveLayout(id, {
            tabs: layoutTabs,
            activeTabId,
            sidebar,
            terminalOpen,
            chats: snapshotChats(id),
          })
          .catch(() => undefined);
      }
      const result = await api.closeProject(id);
      useChats.getState().forget(id);
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
            </footer>
          </div>
        </section>
        <Toasts />
      <GlobalSearch />
        <GlobalSearch />
      </main>
    );
  }


  const activityHeaderControl = projectBar === "left" ? (
    <IconButton
      icon={projectRailCollapsed ? PanelLeftOpen : PanelLeftClose}
      size="xs"
      className="border-transparent bg-transparent shadow-none"
      aria-label={projectRailCollapsed ? "Mostrar barra de projetos" : "Ocultar barra de projetos"}
      title={projectRailCollapsed ? "Mostrar barra de projetos" : "Ocultar barra de projetos"}
      onClick={() => setProjectRailCollapsed((collapsed) => !collapsed)}
    />
  ) : undefined;

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
  const activityBranchControl = sourceControlEnabled ? (
    <ActivityPopover
      open={branchMenuOpen}
      onOpenChange={(next) => { setBranchMenuOpen(next); if (next) openBranchMenu(); }}
      panelClassName="w-[min(460px,calc(100vw-64px))]"
      trigger={
        <Button variant={branchMenuOpen ? "secondary" : "ghost"} size="small" leadingIcon={GitBranch} className="w-full justify-start" aria-label={`Branch ${branch || "detached"}`} title={branch || "detached"} onClick={() => { const next = !branchMenuOpen; setBranchMenuOpen(next); if (next) openBranchMenu(); }}>
          <span className="min-w-0 flex-1 truncate text-start">{branch || "detached"}</span>
          <ChevronDown size={12} className="shrink-0" />
        </Button>
      }
    >
      <div className="max-h-[min(600px,calc(100dvh-24px))] overflow-y-auto">{branchPickerBody()}</div>
    </ActivityPopover>
  ) : null;

  const sidebarContent = (
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

  const rightPanelControl = (
    <IconButton
      icon={X}
      size="xs"
      className="border-transparent bg-transparent shadow-none"
      aria-label="Fechar painel direito"
      title="Fechar painel direito"
      onClick={() => setRightPanelOpen(false)}
    />
  );

  const rightPanelContent = project ? (
    <Suspense fallback={null}>
      {rightPanel === "files" && featureIsEnabled("files") && (
        <ExplorerPanel project={project} headerControl={rightPanelControl} onOpenFile={openFile} onStatusChange={setGitStatus} />
      )}
      {rightPanel === "scm" && featureIsEnabled("sourceControl") && (
        <SourceControlPanel project={project} view="scm" headerControl={rightPanelControl} onOpenDiff={openDiff} onStatusChange={setGitStatus} />
      )}
      {rightPanel === "db" && featureIsEnabled("databases") && (
        <DatabasesPanel project={project} headerControl={rightPanelControl} onOpenQuery={openQuery} onOpenTable={openTable} />
      )}
      {rightPanel === "web" && featureIsEnabled("webApps") && (
        <WebSidebar headerControl={rightPanelControl} onOpenWeb={openWeb} />
      )}
      {rightPanel === "debug" && featureIsEnabled("debug") && (
        <DebugPanel project={project} headerControl={rightPanelControl} />
      )}
      {rightPanel === "bots" && <BotsSidebar project={project} headerControl={rightPanelControl} />}
    </Suspense>
  ) : null;

  const primarySidebar = (
    <Suspense fallback={null}>
      <div className="relative z-40 flex min-h-0 shrink-0 overflow-visible rounded-3xl border border-border-button-white bg-background-secondary-default shadow-sidebar">
        {effectiveSidebarVisible ? (
          <aside className={cx("relative flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[22px] bg-background-secondary-default", botsView ? "w-[clamp(220px,22vw,var(--sidebar-width))]" : "w-[var(--sidebar-width)]")}>
            {sidebarContent}
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
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[var(--side)]">
      {projectBar === "header" ? (
        <TopBar
          onOpenProject={switchProject}
          onCloseProject={requestCloseProject}
          onGoHome={() => setSidebar("bots")}
          onQuickOpen={() => setQuickOpenToken((current) => current + 1)}
          onOpenAuxiliary={openAuxiliary}
          project={project}
          onOpenFile={openFile}
          quickOpenToken={quickOpenToken}
          tophControl={<TophSettings user={user} projectRoot={project.root} projectId={project.id} hideTrigger />}
        />
      ) : null}
      {projectBar === "left" ? (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-[100] flex justify-center px-12">
          <div className="pointer-events-auto w-full max-w-xl"><QuickOpen project={project} focusToken={quickOpenToken} onOpenFile={openFile} floating /></div>
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1 gap-0 p-1">
        {projectBar === "left" && !projectRailCollapsed ? (
          <ProjectRail
            onOpenProject={switchProject}
            onCloseProject={requestCloseProject}
            onGoHome={() => setSidebar("bots")}
            onQuickOpen={() => setQuickOpenToken((current) => current + 1)}
            onOpenAuxiliary={openAuxiliary}
            tophControl={<TophSettings user={user} projectRoot={project.root} projectId={project.id} hideTrigger />}
          />
        ) : null}
        {primarySidebar}
        {primaryResize}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-hidden">
          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar">
            {sidebar === "debug" && project && featureIsEnabled("debug") ? (
              <DebugPanel project={project} />
            ) : (
              <>
                {tabsVisible ? <Tabs /> : null}
                <div className="relative flex min-h-0 flex-1 overflow-hidden">
                  {!activeTab && project && (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
                      <BrandMark size="large" />
                      <h2 className="text-title-2-medium text-text-primary">{botsView ? "Nenhuma sessão aberta" : project.name}</h2>
                      <p className="max-w-lg text-body-regular text-text-secondary">
                        {botsView ? "Abra uma sessão na barra ao lado ou comece uma nova tarefa." : project.root}
                      </p>
                       <div className="flex flex-wrap items-center justify-center gap-2">
                         {featureIsEnabled("files") && <Button variant="secondary" size="small" onClick={() => selectSidebar("files")}>Explorer</Button>}
                         {featureIsEnabled("databases") && <Button variant="secondary" size="small" onClick={() => selectSidebar("db")}>Database</Button>}
                         <Button variant="secondary" size="small" onClick={newConversation}>Nova tarefa</Button>
                       </div>
                    </div>
                  )}
                  <Suspense fallback={null}>
                    {tabsVisible && activeTab?.kind === "editor" && project && featureIsEnabled("files") && <EditorPanel debugEnabled={debugEnabled} tab={activeTab} project={project} onOpenChanges={(path) => openDiff(path, false)} />}
                    {tabsVisible && activeTab?.kind === "db" && featureIsEnabled("databases") && <DbPanelTab tab={activeTab} />}
                    {tabsVisible && activeTab?.kind === "web" && featureIsEnabled("webApps") && <WebPanelTab tab={activeTab} />}
                    {tabsVisible && activeTab?.kind === "diff" && project && featureIsEnabled("files") && <DiffPanelTab tab={activeTab} project={project} />}
                    {activeTab?.kind === "ai" && project && activeTab.chatId && (
                      <BotStudioTab key={activeTab.chatId} project={project} conversationId={activeTab.chatId} />
                    )}
                  </Suspense>
                </div>
              </>
            )}
          </main>

          {project && terminalEnabled && terminalOpen ? (
            <Suspense fallback={null}>
              <div className="flex w-full min-w-0 shrink-0 overflow-hidden">
                <TerminalPanel key={project.id} project={project} onOpenFile={openFile} />
              </div>
            </Suspense>
          ) : null}
        </div>

        {project && rightPanelOpen && rightPanelAvailable ? (
          <>
            <ResizeHandle
              className="right-panel-resize"
              orientation="vertical"
              value={rightPanelWidth}
              min={300}
              max={620}
              invert
              label="Redimensionar painel direito"
              onChange={(width) => document.documentElement.style.setProperty("--ai-panel-width", `${width}px`)}
              onCommit={(width) => updateSettings({ aiPanelWidth: width })}
            />
            <div
              className="relative z-40 flex min-h-0 w-[var(--ai-panel-width)] shrink-0 flex-col overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar [&>*]:min-h-0 [&>*]:flex-1"
              aria-label="Painel auxiliar"
            >
              {rightPanelContent}
            </div>
          </>
        ) : null}
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
      <GlobalSearch />
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
