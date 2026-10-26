import { create } from "zustand";
import type { Project, User } from "./api";

export type TabKind = "editor" | "db" | "ai" | "web" | "diff";
export type Sidebar = "files" | "scm" | "db" | "ai" | "web" | "settings";

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
  tabId?: string;
  sessionId?: string;
}

export type NewNotification = Omit<AppNotification, "id" | "createdAt" | "read">;

const PROJECT_STATE_KEY = "toph_workbench_projects";
const NOTIFICATIONS_KEY = "toph_notifications";

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
        ? value.openProjectIds.filter((id): id is string => typeof id === "string")
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
    }).slice(0, 30);
  } catch {
    return [];
  }
}

function persistNotifications(items: AppNotification[]): void {
  try {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(items.slice(0, 30)));
  } catch {
    // Notifications are best effort.
  }
}

const initialProjectState = readProjectState();

interface AppState {
  user: User | null;
  authReady: boolean;
  projects: Project[];
  activeProjectId: string | null;
  openProjectIds: string[];
  tabs: Tab[];
  activeTabId: string | null;
  sidebar: Sidebar;
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
  closeProjectTab: (id: string) => void;
  openTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, patch: Partial<Tab>) => void;
  setTabs: (tabs: Tab[], activeTabId?: string | null) => void;
  setSidebar: (sidebar: Sidebar) => void;
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
  addNotification: (notification: NewNotification) => void;
  markNotificationRead: (id: string) => void;
  markProjectNotificationsRead: (projectId: string) => void;
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
  sidebar: "files",
  terminalOpen: false,
  aiPanelOpen: false,
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
      if (activeProjectId && !openProjectIds.includes(activeProjectId)) {
        openProjectIds.push(activeProjectId);
      }
      persistProjectState(activeProjectId, openProjectIds);
      return { projects, activeProjectId, openProjectIds };
    }),
  setActiveProject: (activeProjectId) =>
    set((state) => {
      const openProjectIds =
        activeProjectId && !state.openProjectIds.includes(activeProjectId)
          ? [...state.openProjectIds, activeProjectId]
          : state.openProjectIds;
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
      const terminalIds = { ...state.terminalIds };
      delete terminalIds[id];
      persistProjectState(activeProjectId, openProjectIds);
      return { openProjectIds, activeProjectId, terminalIds };
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
  setTerminalOpen: (terminalOpen) => set({ terminalOpen }),
  setAiPanelOpen: (aiPanelOpen) => set({ aiPanelOpen }),
  toggleAiPanel: () => set((state) => ({ aiPanelOpen: !state.aiPanelOpen })),
  setAiDockTab: (aiDockTab) => set({ aiDockTab }),
  toggleTerminal: () => set((state) => ({ terminalOpen: !state.terminalOpen })),
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
  addNotification: (notification) =>
    set((state) => {
      const duplicate = state.notifications.some(
        (item) =>
          item.kind === notification.kind &&
          item.title === notification.title &&
          item.body === notification.body &&
          Date.now() - item.createdAt < 5000,
      );
      if (duplicate) return state;
      const next: AppNotification[] = [
        {
          ...notification,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: Date.now(),
          read: false,
        },
        ...state.notifications,
      ].slice(0, 30);
      persistNotifications(next);
      return { notifications: next };
    }),
  markNotificationRead: (id) =>
    set((state) => {
      const next = state.notifications.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification,
      );
      persistNotifications(next);
      return { notifications: next };
    }),
  markProjectNotificationsRead: (projectId) =>
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
    }),
  markAllNotificationsRead: () =>
    set((state) => {
      const next = state.notifications.map((notification) => ({ ...notification, read: true }));
      persistNotifications(next);
      return { notifications: next };
    }),
  clearNotifications: () =>
    set(() => {
      persistNotifications([]);
      return { notifications: [] };
    }),
}));
