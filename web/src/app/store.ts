import { create } from "zustand";
import type { Project, User } from "../shared/api";
import { isDesktopClient } from "../features/settings/store";
import { api } from "../shared/api";

export type TabKind = "editor" | "db" | "ai" | "web" | "diff";
export type Sidebar = "files" | "scm" | "db" | "ai" | "web" | "bots" | "debug" | "settings";

/** Screen shown by the compact mobile shell. */
export type MobileScreen = "bots" | "files" | "scm" | "db" | "web" | "debug" | "workspace" | "more";

export interface Tab {
  id: string;
  kind: TabKind;
  title: string;
  projectId: string;
  path?: string;
  content?: string;
  hash?: string;
  dirty?: boolean;
  profileId?: string;
  sql?: string;
  autoRun?: boolean;
  url?: string;
  diff?: string;
  staged?: boolean;
  sessionId?: string;
  /** Conversation id for `ai` tabs (one Toph or a group). */
  chatId?: string;
  line?: number;
  table?: {
    schema: string;
    name: string;
    primary: string[];
  };
}

export interface AiMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "error" | "reasoning" | "step" | "subagent";
  text: string;
  detail?: string;
  status?: "running" | "complete" | "error";
  createdAt: number;
  title?: string;
  permissionId?: string;
  permissionAction?: string;
  durationMs?: number;
}

export interface Toast {
  id: number;
  kind: "info" | "success" | "error";
  message: string;
}

export interface AppNotification {
  id: string;
  kind: "ai" | "system";
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  projectId?: string;
  projectName?: string;
  tabId?: string;
  chatId?: string;
  sessionId?: string;
  notificationId?: string;
  botId?: string;
  botName?: string;
  botRole?: string;
}

export type NewNotification = Omit<AppNotification, "id" | "createdAt" | "read">;

const PROJECT_STATE_KEY = "toph_workbench_projects";
const NOTIFICATIONS_KEY = "toph_notifications";
const MAX_NOTIFICATIONS = 100;
const LAYOUT_VISIBILITY_KEY = "toph_layout_visibility";
export const MAX_OPEN_PROJECTS = 5;

interface PersistedProjectState {
  activeProjectId: string | null;
  openProjectIds: string[];
}

function readProjectState(): PersistedProjectState {
  try {
    const raw = localStorage.getItem(PROJECT_STATE_KEY);
    if (!raw) return { activeProjectId: null, openProjectIds: [] };
    const value = JSON.parse(raw) as Partial<PersistedProjectState>;
    return {
      activeProjectId: typeof value.activeProjectId === "string" ? value.activeProjectId : null,
      openProjectIds: Array.isArray(value.openProjectIds)
        ? [...new Set(value.openProjectIds.filter((id): id is string => typeof id === "string"))].slice(0, MAX_OPEN_PROJECTS)
        : [],
    };
  } catch {
    return { activeProjectId: null, openProjectIds: [] };
  }
}

function persistProjectState(activeProjectId: string | null, openProjectIds: string[]): void {
  try {
    localStorage.setItem(PROJECT_STATE_KEY, JSON.stringify({ activeProjectId, openProjectIds }));
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }
}

function readLayoutVisibility(): { terminalOpen: boolean; aiPanelOpen: boolean } {
  try {
    if (isDesktopClient()) return { terminalOpen: false, aiPanelOpen: false };
    const raw = localStorage.getItem(LAYOUT_VISIBILITY_KEY);
    if (!raw) return { terminalOpen: true, aiPanelOpen: false };
    const value = JSON.parse(raw) as Partial<{ terminalOpen: boolean; aiPanelOpen: boolean }>;
    return {
      terminalOpen: value.terminalOpen !== false,
      aiPanelOpen: value.aiPanelOpen === true,
    };
  } catch {
    return { terminalOpen: !isDesktopClient(), aiPanelOpen: false };
  }
}

function persistLayoutVisibility(terminalOpen: boolean, aiPanelOpen: boolean): void {
  try {
    localStorage.setItem(LAYOUT_VISIBILITY_KEY, JSON.stringify({ terminalOpen, aiPanelOpen }));
  } catch {
    // Layout visibility is best effort.
  }
}

function readNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is AppNotification => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<AppNotification>;
      return typeof candidate.id === "string" && typeof candidate.title === "string" && typeof candidate.body === "string";
    }).slice(0, MAX_NOTIFICATIONS);
  } catch {
    return [];
  }
}

function persistNotifications(items: AppNotification[]): void {
  try {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(items.slice(0, MAX_NOTIFICATIONS)));
  } catch {
    // Notifications are best effort.
  }
}

const initialProjectState = readProjectState();
const initialLayoutVisibility = readLayoutVisibility();

interface AppState {
  user: User | null;
  authReady: boolean;
  projects: Project[];
  activeProjectId: string | null;
  openProjectIds: string[];
  tabs: Tab[];
  activeTabId: string | null;
  sidebar: Sidebar;
  mobileScreen: MobileScreen;
  terminalOpen: boolean;
  aiPanelOpen: boolean;
  aiDockTab: Tab | null;
  terminalIds: Record<string, string>;
  aiMessages: Record<string, AiMessage[]>;
  aiStreaming: Record<string, boolean>;
  toasts: Toast[];
  notifications: AppNotification[];
  setUser: (user: User | null) => void;
  setAuthReady: (ready: boolean) => void;
  setProjects: (projects: Project[]) => void;
  setActiveProject: (id: string | null) => void;
  /** Adopt the server's open project list (shared across devices). */
  setOpenProjectIds: (ids: string[]) => void;
  closeProjectTab: (id: string) => void;
  openTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
  updateTab: (id: string, patch: Partial<Tab>) => void;
  setTabs: (tabs: Tab[], activeTabId?: string | null) => void;
  setSidebar: (sidebar: Sidebar) => void;
  setMobileScreen: (screen: MobileScreen) => void;
  setTerminalOpen: (open: boolean) => void;
  setAiPanelOpen: (open: boolean) => void;
  toggleAiPanel: () => void;
  setAiDockTab: (tab: Tab | null) => void;
  toggleTerminal: () => void;
  setTerminalId: (projectId: string, terminalId: string) => void;
  addAiMessage: (tabId: string, message: AiMessage) => void;
  setAiMessages: (tabId: string, messages: AiMessage[]) => void;
  appendAiText: (tabId: string, messageId: string, delta: string) => void;
  updateAiMessage: (tabId: string, messageId: string, patch: Partial<AiMessage>) => void;
  setAiStreaming: (tabId: string, streaming: boolean) => void;
  notify: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: number) => void;
  addNotification: (notification: NewNotification) => boolean;
  /** Merge the notifications persisted on the server. */
  hydrateNotifications: (items: AppNotification[]) => void;
  markNotificationRead: (id: string) => void;
  markProjectNotificationsRead: (projectId: string) => void;
  markChatNotificationsRead: (chatId: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
}

export const useApp = create<AppState>((set, get) => ({
  user: null,
  authReady: false,
  projects: [],
  activeProjectId: initialProjectState.activeProjectId,
  openProjectIds: initialProjectState.openProjectIds,
  tabs: [],
  activeTabId: null,
  sidebar: isDesktopClient() ? "bots" : "files",
  mobileScreen: "bots",
  terminalOpen: initialLayoutVisibility.terminalOpen,
  aiPanelOpen: initialLayoutVisibility.aiPanelOpen,
  aiDockTab: null,
  terminalIds: {},
  aiMessages: {},
  aiStreaming: {},
  toasts: [],
  notifications: readNotifications(),

  setUser: (user) => set({ user }),
  setAuthReady: (authReady) => set({ authReady }),
  setProjects: (projects) =>
    set((state) => {
      const activeProjectId =
        state.activeProjectId && projects.some((p) => p.id === state.activeProjectId)
          ? state.activeProjectId
          : (projects[0]?.id ?? null);
      const openProjectIds = state.openProjectIds.filter((id) =>
        projects.some((project) => project.id === id),
      );
      if (activeProjectId && !openProjectIds.includes(activeProjectId) && openProjectIds.length < MAX_OPEN_PROJECTS) {
        openProjectIds.push(activeProjectId);
      }
      persistProjectState(activeProjectId, openProjectIds);
      return { projects, activeProjectId, openProjectIds };
    }),
  setActiveProject: (activeProjectId) =>
    set((state) => {
      const alreadyOpen = !activeProjectId || state.openProjectIds.includes(activeProjectId);
      const openProjectIds =
        activeProjectId && !alreadyOpen && state.openProjectIds.length < MAX_OPEN_PROJECTS
          ? [...state.openProjectIds, activeProjectId]
          : state.openProjectIds;
      if (activeProjectId && !openProjectIds.includes(activeProjectId)) {
        return state;
      }
      persistProjectState(activeProjectId, openProjectIds);
      return { activeProjectId, openProjectIds };
    }),
  setOpenProjectIds: (ids) =>
    set((state) => {
      // The server already validates the ids; do not filter against the local
      // project list because it may not be loaded yet on a fresh device.
      const openProjectIds = [...new Set(ids)]
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .slice(0, MAX_OPEN_PROJECTS);
      const activeProjectId =
        openProjectIds.length === 0
          ? null
          : state.activeProjectId && openProjectIds.includes(state.activeProjectId)
            ? state.activeProjectId
            : openProjectIds[0];
      persistProjectState(activeProjectId, openProjectIds);
      return { activeProjectId, openProjectIds };
    }),
  closeProjectTab: (id) =>
    set((state) => {
      const index = state.openProjectIds.indexOf(id);
      const openProjectIds = state.openProjectIds.filter((item) => item !== id);
      let activeProjectId = state.activeProjectId;
      if (activeProjectId === id) {
        activeProjectId =
          openProjectIds[Math.min(index, openProjectIds.length - 1)] ?? null;
      }
      const tabs = state.tabs.filter((tab) => tab.projectId !== id);
      let activeTabId = state.activeTabId;
      if (!tabs.some((tab) => tab.id === activeTabId)) {
        activeTabId = tabs[tabs.length - 1]?.id ?? null;
      }
      const aiDockTab = state.aiDockTab?.projectId === id ? null : state.aiDockTab;
      const terminalIds = { ...state.terminalIds };
      delete terminalIds[id];
      const closedTabIds = new Set(state.tabs.filter((tab) => tab.projectId === id).map((tab) => tab.id));
      const aiMessages = Object.fromEntries(
        Object.entries(state.aiMessages).filter(([tabId]) => !closedTabIds.has(tabId)),
      );
      const aiStreaming = Object.fromEntries(
        Object.entries(state.aiStreaming).filter(([tabId]) => !closedTabIds.has(tabId)),
      );
      persistProjectState(activeProjectId, openProjectIds);
      return {
        openProjectIds,
        activeProjectId,
        terminalIds,
        aiMessages,
        aiStreaming,
        tabs,
        activeTabId,
        aiDockTab,
        aiPanelOpen: aiDockTab ? state.aiPanelOpen : false,
      };
    }),
  openTab: (tab) =>
    set((state) => {
      const existing = state.tabs.find((item) => item.id === tab.id);
      if (existing) {
        return { activeTabId: existing.id };
      }
      return { tabs: [...state.tabs, tab], activeTabId: tab.id };
    }),
  closeTab: (id) =>
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.id === id);
      if (index < 0) return state;
      const tabs = state.tabs.filter((tab) => tab.id !== id);
      let activeTabId = state.activeTabId;
      if (activeTabId === id) {
        activeTabId = tabs[Math.min(index, tabs.length - 1)]?.id ?? null;
      }
      return { tabs, activeTabId };
    }),
  setActiveTab: (activeTabId) => set({ activeTabId }),
  updateTab: (id, patch) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
      aiDockTab:
        state.aiDockTab?.id === id ? { ...state.aiDockTab, ...patch } : state.aiDockTab,
    })),
  setTabs: (tabs, activeTabId) =>
    set({
      tabs,
      activeTabId:
        activeTabId && tabs.some((tab) => tab.id === activeTabId)
          ? activeTabId
          : (tabs[0]?.id ?? null),
    }),
  setSidebar: (sidebar) => set({ sidebar }),
  setMobileScreen: (mobileScreen) => set({ mobileScreen }),
  setTerminalOpen: (terminalOpen) => {
    persistLayoutVisibility(terminalOpen, get().aiPanelOpen);
    set({ terminalOpen });
  },
  setAiPanelOpen: (aiPanelOpen) => {
    persistLayoutVisibility(get().terminalOpen, aiPanelOpen);
    set({ aiPanelOpen });
  },
  toggleAiPanel: () => {
    const aiPanelOpen = !get().aiPanelOpen;
    persistLayoutVisibility(get().terminalOpen, aiPanelOpen);
    set({ aiPanelOpen });
  },
  setAiDockTab: (aiDockTab) => set({ aiDockTab }),
  toggleTerminal: () => {
    const terminalOpen = !get().terminalOpen;
    persistLayoutVisibility(terminalOpen, get().aiPanelOpen);
    set({ terminalOpen });
  },
  setTerminalId: (projectId, terminalId) =>
    set((state) => ({ terminalIds: { ...state.terminalIds, [projectId]: terminalId } })),
  addAiMessage: (tabId, message) =>
    set((state) => ({
      aiMessages: {
        ...state.aiMessages,
        [tabId]: [...(state.aiMessages[tabId] ?? []), message],
      },
    })),
  setAiMessages: (tabId, messages) =>
    set((state) => ({
      aiMessages: { ...state.aiMessages, [tabId]: messages },
    })),
  appendAiText: (tabId, messageId, delta) =>
    set((state) => ({
      aiMessages: {
        ...state.aiMessages,
        [tabId]: (state.aiMessages[tabId] ?? []).map((message) =>
          message.id === messageId
            ? { ...message, text: message.text + delta }
            : message,
        ),
      },
    })),
  updateAiMessage: (tabId, messageId, patch) =>
    set((state) => ({
      aiMessages: {
        ...state.aiMessages,
        [tabId]: (state.aiMessages[tabId] ?? []).map((message) =>
          message.id === messageId ? { ...message, ...patch } : message,
        ),
      },
    })),
  setAiStreaming: (tabId, streaming) =>
    set((state) => ({
      aiStreaming: { ...state.aiStreaming, [tabId]: streaming },
    })),
  notify: (kind, message) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    set((state) => ({ toasts: [...state.toasts, { id, kind, message }] }));
    window.setTimeout(() => get().dismissToast(id), 5000);
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  hydrateNotifications: (items) =>
    set((state) => {
      // The server list is authoritative (it is what every other device sees),
      // so notifications removed elsewhere disappear here too. Only entries that
      // were never persisted are kept, and only while they are still fresh.
      const previous = new Map<string, AppNotification>();
      for (const item of state.notifications) {
        if (item.notificationId) previous.set(item.notificationId, item);
      }
      const merged = items.map((item) => {
        const local = item.notificationId ? previous.get(item.notificationId) : undefined;
        return local
          ? { ...item, id: local.id, read: local.read || item.read }
          : item;
      });
      const pending = state.notifications.filter(
        (item) => !item.notificationId && Date.now() - item.createdAt < 60_000,
      );
      const seen = new Set<string>();
      const next = [...merged, ...pending]
        .filter((item) => {
          const key = item.notificationId || item.id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_NOTIFICATIONS);
      persistNotifications(next);
      return { notifications: next };
    }),
  addNotification: (notification) => {
    const state = get();
    const duplicate = notification.notificationId
      ? state.notifications.some((item) => item.notificationId === notification.notificationId)
      : state.notifications.some(
          (item) =>
            item.kind === notification.kind &&
            item.title === notification.title &&
            item.body === notification.body &&
            Date.now() - item.createdAt < 5000,
        );
    if (duplicate) return false;
    const next: AppNotification[] = [
      {
        ...notification,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        read: false,
      },
      ...state.notifications,
    ].slice(0, MAX_NOTIFICATIONS);
    persistNotifications(next);
    set({ notifications: next });
    return true;
  },
  markNotificationRead: (id) => {
    const target = get().notifications.find((notification) => notification.id === id);
    const serverId = target?.notificationId || target?.id || id;
    void api.markNotificationsRead({ ids: [serverId] }).catch(() => undefined);
    set((state) => {
      const next = state.notifications.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification,
      );
      persistNotifications(next);
      return { notifications: next };
    });
  },
  markProjectNotificationsRead: (projectId) => {
    void api.markNotificationsRead({ projectId }).catch(() => undefined);
    set((state) => {
      let changed = false;
      const next = state.notifications.map((notification) => {
        if (!notification.read && notification.projectId === projectId) {
          changed = true;
          return { ...notification, read: true };
        }
        return notification;
      });
      if (!changed) return state;
      persistNotifications(next);
      return { notifications: next };
    });
  },
  markChatNotificationsRead: (chatId) => {
    void api.markNotificationsRead({ chatId }).catch(() => undefined);
    set((state) => {
      let changed = false;
      const next = state.notifications.map((notification) => {
        if (!notification.read && notification.chatId === chatId) {
          changed = true;
          return { ...notification, read: true };
        }
        return notification;
      });
      if (!changed) return state;
      persistNotifications(next);
      return { notifications: next };
    });
  },
  markAllNotificationsRead: () => {
    void api.markNotificationsRead({ all: true }).catch(() => undefined);
    set((state) => {
      const next = state.notifications.map((notification) => ({ ...notification, read: true }));
      persistNotifications(next);
      return { notifications: next };
    });
  },
  clearNotifications: () => {
    void api.clearNotifications().catch(() => undefined);
    set(() => {
      persistNotifications([]);
      return { notifications: [] };
    });
  },
}));
