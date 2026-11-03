import { create } from "zustand";

export type Theme = "light" | "dark";

export type SideBarPosition = "left" | "right";
export type PanelAlignment = "left" | "right" | "center" | "justify";
export type QuickInputPosition = "top" | "center";

export const WORKSPACE_FEATURES = [
  "topBar",
  "menuBar",
  "activityBar",
  "primarySidebar",
  "tabs",
  "terminal",
  "statusBar",
  "files",
  "sourceControl",
  "databases",
  "webApps",
  "debug",
  "bots",
] as const;

export type WorkspaceFeature = (typeof WORKSPACE_FEATURES)[number];
export type WorkspaceFeatures = Record<WorkspaceFeature, boolean>;

export const defaultWorkspaceFeatures: WorkspaceFeatures = {
  topBar: true,
  menuBar: true,
  activityBar: true,
  primarySidebar: true,
  tabs: true,
  terminal: true,
  statusBar: true,
  files: true,
  sourceControl: true,
  databases: true,
  webApps: true,
  debug: true,
  bots: true,
};

export const desktopWorkspaceFeatures: WorkspaceFeatures = {
  ...defaultWorkspaceFeatures,
  topBar: false,
  menuBar: false,
  activityBar: true,
  primarySidebar: true,
  tabs: false,
  terminal: false,
  statusBar: false,
  files: false,
  sourceControl: false,
  databases: false,
  webApps: false,
  debug: false,
  bots: true,
};

export function isDesktopClient(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("desktop") === "1";
}

export function featureEnabled(features: WorkspaceFeatures, feature: WorkspaceFeature): boolean {
  return feature === "bots" || features[feature] === true;
}

export function sidebarFeature(sidebar: string): WorkspaceFeature | null {
  switch (sidebar) {
    case "files": return "files";
    case "scm": return "sourceControl";
    case "db": return "databases";
    case "web": return "webApps";
    case "debug": return "debug";
    case "bots": return "bots";
    default: return null;
  }
}

export function isTophOnly(features: WorkspaceFeatures): boolean {
  return WORKSPACE_FEATURES.every((feature) => feature === "bots" || !features[feature]);
}

export interface SettingsState {
  theme: Theme;
  sidebarWidth: number;
  aiPanelWidth: number;
  terminalHeight: number;
  confirmClose: boolean;
  workspaceFeatures: WorkspaceFeatures;
  topBarVisible: boolean;
  menuVisible: boolean;
  activityVisible: boolean;
  sidebarVisible: boolean;
  tabsVisible: boolean;
  statusVisible: boolean;
  primarySideBarPosition: SideBarPosition;
  panelAlignment: PanelAlignment;
  quickInputPosition: QuickInputPosition;
  gitBranchPattern: string;
  gitCommitPattern: string;
  update: (patch: SettingsPatch) => void;
  setTheme: (theme: Theme) => void;
  reset: () => void;
}

type StoredSettings = Partial<Omit<SettingsState, "update" | "setTheme" | "reset">> & {
  workspaceFeatures?: Partial<WorkspaceFeatures>;
};

export type SettingsPatch = Partial<Omit<SettingsState, "update" | "setTheme" | "reset" | "workspaceFeatures">> & {
  workspaceFeatures?: Partial<WorkspaceFeatures>;
};

const STORAGE_KEY = "toph_settings";
const DESKTOP_INITIALIZED_KEY = "toph_desktop_workspace_initialized_v1";
const DESKTOP_SIDEBAR_MIGRATED_KEY = "toph_desktop_sidebar_migrated_v1";
const ACTIVITY_BAR_CONTROL_MIGRATED_KEY = "toph_activity_bar_control_migrated_v1";

export const defaultSettings = {
  theme: "dark" as Theme,
  sidebarWidth: 300,
  aiPanelWidth: 390,
  terminalHeight: 280,
  confirmClose: true,
  workspaceFeatures: defaultWorkspaceFeatures,
  topBarVisible: true,
  menuVisible: true,
  activityVisible: true,
  sidebarVisible: true,
  tabsVisible: true,
  statusVisible: true,
  primarySideBarPosition: "left" as SideBarPosition,
  panelAlignment: "justify" as PanelAlignment,
  quickInputPosition: "top" as QuickInputPosition,
  gitBranchPattern: "feature/{task}-{slug}",
  gitCommitPattern: "{task} {summary}",
};

export const desktopDefaultSettings = {
  ...defaultSettings,
  workspaceFeatures: desktopWorkspaceFeatures,
  topBarVisible: false,
  menuVisible: false,
  activityVisible: true,
  sidebarVisible: true,
  tabsVisible: false,
  statusVisible: false,
};

function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function normalizeFeatures(value: unknown, fallback: WorkspaceFeatures): WorkspaceFeatures {
  const raw = value && typeof value === "object" ? value as Partial<WorkspaceFeatures> : {};
  return WORKSPACE_FEATURES.reduce((result, feature) => {
    result[feature] = feature === "bots"
      ? true
      : typeof raw[feature] === "boolean" ? raw[feature] : fallback[feature];
    return result;
  }, {} as WorkspaceFeatures);
}

function legacyFeatures(value: StoredSettings, fallback: WorkspaceFeatures): WorkspaceFeatures {
  return {
    ...fallback,
    topBar: true,
    menuBar: value.menuVisible !== false,
    activityBar: value.activityVisible !== false,
    primarySidebar: value.sidebarVisible !== false,
    tabs: true,
    statusBar: value.statusVisible !== false,
  };
}

function readSettings(): Omit<SettingsState, "update" | "setTheme" | "reset"> {
  const desktop = isDesktopClient();
  const fallback = desktop ? desktopDefaultSettings : defaultSettings;
  let desktopFirstRun = false;
  let migrateDesktopSidebar = false;
  let migrateActivityBar = false;
  try {
    migrateActivityBar = localStorage.getItem(ACTIVITY_BAR_CONTROL_MIGRATED_KEY) !== "1";
    if (migrateActivityBar) localStorage.setItem(ACTIVITY_BAR_CONTROL_MIGRATED_KEY, "1");
  } catch {
    migrateActivityBar = true;
  }
  if (desktop) {
    try {
      desktopFirstRun = localStorage.getItem(DESKTOP_INITIALIZED_KEY) !== "1";
      if (desktopFirstRun) localStorage.setItem(DESKTOP_INITIALIZED_KEY, "1");
      migrateDesktopSidebar = localStorage.getItem(DESKTOP_SIDEBAR_MIGRATED_KEY) !== "1";
      if (migrateDesktopSidebar) localStorage.setItem(DESKTOP_SIDEBAR_MIGRATED_KEY, "1");
    } catch {
      desktopFirstRun = true;
      migrateDesktopSidebar = true;
    }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw) as StoredSettings;
    const hasWorkspaceFeatures = value.workspaceFeatures && typeof value.workspaceFeatures === "object";
    const workspaceFeatures = desktopFirstRun
      ? { ...desktopWorkspaceFeatures }
      : hasWorkspaceFeatures
      ? normalizeFeatures(value.workspaceFeatures, fallback.workspaceFeatures)
      : desktop
        ? { ...desktopWorkspaceFeatures }
        : legacyFeatures(value, fallback.workspaceFeatures);
    if (migrateDesktopSidebar) workspaceFeatures.primarySidebar = true;
    if (migrateActivityBar) workspaceFeatures.activityBar = true;
    return {
      theme:
        value.theme === "light" || value.theme === "dark"
          ? value.theme
          : fallback.theme,
      sidebarWidth: numberIn(value.sidebarWidth, 220, 320, fallback.sidebarWidth),
      aiPanelWidth: numberIn(value.aiPanelWidth, 300, 620, fallback.aiPanelWidth),
      terminalHeight: numberIn(value.terminalHeight, 180, 640, fallback.terminalHeight),
      confirmClose: value.confirmClose !== false,
      workspaceFeatures,
      topBarVisible: workspaceFeatures.topBar,
      menuVisible: workspaceFeatures.menuBar,
      activityVisible: workspaceFeatures.activityBar,
      sidebarVisible: workspaceFeatures.primarySidebar,
      tabsVisible: workspaceFeatures.tabs,
      statusVisible: workspaceFeatures.statusBar,
      primarySideBarPosition: value.primarySideBarPosition === "right" ? "right" : "left",
      panelAlignment:
        value.panelAlignment === "left" || value.panelAlignment === "right" || value.panelAlignment === "center"
          ? value.panelAlignment
          : "justify",
      quickInputPosition: value.quickInputPosition === "center" ? "center" : "top",
      gitBranchPattern:
        typeof value.gitBranchPattern === "string" && value.gitBranchPattern.trim()
          ? value.gitBranchPattern
          : fallback.gitBranchPattern,
      gitCommitPattern:
        typeof value.gitCommitPattern === "string" && value.gitCommitPattern.trim()
          ? value.gitCommitPattern
          : fallback.gitCommitPattern,
    };
  } catch {
    return fallback;
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme !== "light");
  root.style.colorScheme = theme === "light" ? "light" : "dark";
  root.dataset.theme = theme;
  const nativeTheme = (window as unknown as { TophTheme?: { setDarkTheme?: (dark: boolean) => void } }).TophTheme;
  nativeTheme?.setDarkTheme?.(theme !== "light");
}

export function applyLayout(settings: Pick<typeof defaultSettings, "sidebarWidth" | "aiPanelWidth" | "terminalHeight">): void {
  const root = document.documentElement;
  root.style.setProperty("--sidebar-width", `${settings.sidebarWidth}px`);
  root.style.setProperty("--ai-panel-width", `${settings.aiPanelWidth}px`);
  root.style.setProperty("--terminal-height", `${settings.terminalHeight}px`);
}

type PersistedSettings = Omit<SettingsState, "update" | "setTheme" | "reset">;

function persistSettings(settings: PersistedSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...readSettings(),
  update: (patch) => {
    const current = get();
    const workspaceFeatures = normalizeFeatures(
      {
        ...current.workspaceFeatures,
        ...(patch.workspaceFeatures ?? {}),
        ...(patch.topBarVisible === undefined ? {} : { topBar: patch.topBarVisible }),
        ...(patch.menuVisible === undefined ? {} : { menuBar: patch.menuVisible }),
        ...(patch.activityVisible === undefined ? {} : { activityBar: patch.activityVisible }),
        ...(patch.sidebarVisible === undefined ? {} : { primarySidebar: patch.sidebarVisible }),
        ...(patch.tabsVisible === undefined ? {} : { tabs: patch.tabsVisible }),
        ...(patch.statusVisible === undefined ? {} : { statusBar: patch.statusVisible }),
      },
      current.workspaceFeatures,
    );
    const next: PersistedSettings = {
      theme: patch.theme ?? current.theme,
      sidebarWidth: patch.sidebarWidth ?? current.sidebarWidth,
      aiPanelWidth: patch.aiPanelWidth ?? current.aiPanelWidth,
      terminalHeight: patch.terminalHeight ?? current.terminalHeight,
      confirmClose: patch.confirmClose ?? current.confirmClose,
      workspaceFeatures,
      topBarVisible: workspaceFeatures.topBar,
      menuVisible: workspaceFeatures.menuBar,
      activityVisible: workspaceFeatures.activityBar,
      sidebarVisible: workspaceFeatures.primarySidebar,
      tabsVisible: workspaceFeatures.tabs,
      statusVisible: workspaceFeatures.statusBar,
      primarySideBarPosition: patch.primarySideBarPosition ?? current.primarySideBarPosition,
      panelAlignment: patch.panelAlignment ?? current.panelAlignment,
      quickInputPosition: patch.quickInputPosition ?? current.quickInputPosition,
      gitBranchPattern: patch.gitBranchPattern ?? current.gitBranchPattern,
      gitCommitPattern: patch.gitCommitPattern ?? current.gitCommitPattern,
    };
    persistSettings(next);
    applyTheme(next.theme);
    applyLayout(next);
    set(next);
  },
  setTheme: (theme) => get().update({ theme }),
  reset: () => {
    localStorage.removeItem(STORAGE_KEY);
    const next = isDesktopClient() ? desktopDefaultSettings : defaultSettings;
    applyTheme(next.theme);
    applyLayout(next);
    set(next);
  },
}));

let initialized = false;

export function initAppearance(): void {
  if (initialized) return;
  initialized = true;
  const settings = readSettings();
  applyTheme(settings.theme);
  applyLayout(settings);
  localStorage.removeItem("toph_appearance");
}
