import { create } from "zustand";
import { api, type DebugBreakpoint, type DebugProjectConfig } from "./api";

const STORAGE_KEY = "toph-debug-configs-v1";
const SAVE_DELAY = 500;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultDebugConfig(): DebugProjectConfig {
  return {
    language: "node",
    mode: "launch",
    command: "",
    address: "127.0.0.1:9229",
    cwd: "",
    bug: "",
    reproduction: "",
    breakpoints: [],
    watches: [],
    pauseOnExceptions: "uncaught",
  };
}

function readStored(): Record<string, DebugProjectConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DebugProjectConfig>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalize(input: Partial<DebugProjectConfig> | null | undefined): DebugProjectConfig {
  const fallback = defaultDebugConfig();
  const raw = input ?? {};
  const breakpoints = Array.isArray(raw.breakpoints)
    ? raw.breakpoints
        .filter((item) => item && typeof item.path === "string" && Number.isFinite(item.line))
        .map((item) => ({
          id: item.id || newId(),
          path: item.path,
          line: Math.max(1, Math.round(item.line)),
          condition: item.condition || "",
          logMessage: item.logMessage || "",
          enabled: item.enabled !== false,
        }))
    : [];
  return {
    language: raw.language === "python" ? "python" : "node",
    mode: raw.mode === "attach" ? "attach" : "launch",
    command: typeof raw.command === "string" ? raw.command : fallback.command,
    address: typeof raw.address === "string" && raw.address ? raw.address : fallback.address,
    cwd: typeof raw.cwd === "string" ? raw.cwd : fallback.cwd,
    bug: typeof raw.bug === "string" ? raw.bug : "",
    reproduction: typeof raw.reproduction === "string" ? raw.reproduction : "",
    breakpoints,
    watches: Array.isArray(raw.watches) ? raw.watches.filter((item) => typeof item === "string").slice(0, 40) : [],
    pauseOnExceptions: raw.pauseOnExceptions === "none" || raw.pauseOnExceptions === "all" ? raw.pauseOnExceptions : "uncaught",
  };
}

function persistLocal(configs: Record<string, DebugProjectConfig>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  } catch {
    // Local cache is best effort.
  }
}

interface DebugStore {
  byProject: Record<string, DebugProjectConfig>;
  loading: Record<string, boolean>;
  loaded: Record<string, boolean>;
  locations: Record<string, { path: string; line: number } | null>;
  ensure: (projectId: string) => DebugProjectConfig;
  load: (projectId: string) => Promise<void>;
  setConfig: (projectId: string, patch: Partial<DebugProjectConfig>) => void;
  addBreakpoint: (projectId: string, path: string, line: number, patch?: Partial<DebugBreakpoint>) => DebugBreakpoint;
  updateBreakpoint: (projectId: string, id: string, patch: Partial<DebugBreakpoint>) => void;
  removeBreakpoint: (projectId: string, id: string) => void;
  toggleBreakpoint: (projectId: string, path: string, line: number) => void;
  breakpointsFor: (projectId: string, path?: string) => DebugBreakpoint[];
  addWatch: (projectId: string, expression: string) => void;
  removeWatch: (projectId: string, index: number) => void;
  setLocation: (projectId: string, location: { path: string; line: number } | null) => void;
}

const saveTimers: Record<string, number> = {};

function scheduleSave(projectId: string, get: () => DebugStore["byProject"]) {
  window.clearTimeout(saveTimers[projectId]);
  saveTimers[projectId] = window.setTimeout(() => {
    const config = get()[projectId];
    if (config) void api.saveDebugConfig(projectId, config).catch(() => undefined);
  }, SAVE_DELAY);
}

export const useDebug = create<DebugStore>((set, get) => ({
  byProject: readStored(),
  loading: {},
  loaded: {},
  locations: {},

  ensure: (projectId) => {
    const existing = get().byProject[projectId];
    if (existing) return existing;
    const next = defaultDebugConfig();
    set((state) => {
      const byProject = { ...state.byProject, [projectId]: next };
      persistLocal(byProject);
      return { byProject };
    });
    return next;
  },

  load: async (projectId) => {
    if (get().loaded[projectId] || get().loading[projectId]) return;
    set((state) => ({ loading: { ...state.loading, [projectId]: true } }));
    try {
      const remote = await api.debugConfig(projectId);
      const current = get().byProject[projectId] ?? defaultDebugConfig();
      const merged = normalize({ ...current, ...remote });
      set((state) => {
        const byProject = { ...state.byProject, [projectId]: merged };
        persistLocal(byProject);
        return {
          byProject,
          loading: { ...state.loading, [projectId]: false },
          loaded: { ...state.loaded, [projectId]: true },
        };
      });
    } catch {
      get().ensure(projectId);
      set((state) => ({
        loading: { ...state.loading, [projectId]: false },
        loaded: { ...state.loaded, [projectId]: true },
      }));
    }
  },

  setConfig: (projectId, patch) => {
    set((state) => {
      const current = state.byProject[projectId] ?? defaultDebugConfig();
      const next = normalize({ ...current, ...patch });
      const byProject = { ...state.byProject, [projectId]: next };
      persistLocal(byProject);
      return { byProject };
    });
    scheduleSave(projectId, () => get().byProject);
  },

  addBreakpoint: (projectId, path, line, patch = {}) => {
    const existing = get().byProject[projectId]?.breakpoints.find((item) => item.path === path && item.line === line);
    if (existing) return existing;
    const breakpoint: DebugBreakpoint = {
      id: newId(),
      path,
      line: Math.max(1, Math.round(line)),
      condition: "",
      logMessage: "",
      enabled: true,
      ...patch,
    };
    get().setConfig(projectId, {
      breakpoints: [...(get().byProject[projectId]?.breakpoints ?? []), breakpoint],
    });
    return breakpoint;
  },

  updateBreakpoint: (projectId, id, patch) => {
    const current = get().byProject[projectId];
    if (!current) return;
    get().setConfig(projectId, {
      breakpoints: current.breakpoints.map((item) => item.id === id ? { ...item, ...patch } : item),
    });
  },

  removeBreakpoint: (projectId, id) => {
    const current = get().byProject[projectId];
    if (!current) return;
    get().setConfig(projectId, {
      breakpoints: current.breakpoints.filter((item) => item.id !== id),
    });
  },

  toggleBreakpoint: (projectId, path, line) => {
    const existing = get().byProject[projectId]?.breakpoints.find((item) => item.path === path && item.line === line);
    if (existing) get().removeBreakpoint(projectId, existing.id);
    else get().addBreakpoint(projectId, path, line);
  },

  breakpointsFor: (projectId, path) => {
    const breakpoints = get().byProject[projectId]?.breakpoints ?? [];
    return path ? breakpoints.filter((item) => item.path === path) : breakpoints;
  },

  addWatch: (projectId, expression) => {
    const value = expression.trim();
    if (!value) return;
    const current = get().byProject[projectId] ?? defaultDebugConfig();
    if (current.watches.includes(value)) return;
    get().setConfig(projectId, { watches: [...current.watches, value].slice(0, 40) });
  },

  removeWatch: (projectId, index) => {
    const current = get().byProject[projectId];
    if (!current) return;
    get().setConfig(projectId, { watches: current.watches.filter((_, itemIndex) => itemIndex !== index) });
  },

  setLocation: (projectId, location) => {
    set((state) => ({ locations: { ...state.locations, [projectId]: location } }));
  },
}));
