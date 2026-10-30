import { create } from "zustand";

export type Theme = "light" | "dark";

export type SideBarPosition = "left" | "right";
export type PanelAlignment = "left" | "right" | "center" | "justify";
export type QuickInputPosition = "top" | "center";

export interface SettingsState {
  theme: Theme;
  sidebarWidth: number;
  aiPanelWidth: number;
  terminalHeight: number;
  confirmClose: boolean;
  menuVisible: boolean;
  activityVisible: boolean;
  sidebarVisible: boolean;
  statusVisible: boolean;
  primarySideBarPosition: SideBarPosition;
  panelAlignment: PanelAlignment;
  quickInputPosition: QuickInputPosition;
  gitBranchPattern: string;
  gitCommitPattern: string;
  update: (patch: Partial<Omit<SettingsState, "update" | "setTheme" | "reset">>) => void;
  setTheme: (theme: Theme) => void;
  reset: () => void;
}

const STORAGE_KEY = "toph_settings";

export const defaultSettings = {
  theme: "dark" as Theme,
  sidebarWidth: 300,
  aiPanelWidth: 390,
  terminalHeight: 280,
  confirmClose: true,
  menuVisible: true,
  activityVisible: true,
  sidebarVisible: true,
  statusVisible: true,
  primarySideBarPosition: "left" as SideBarPosition,
  panelAlignment: "justify" as PanelAlignment,
  quickInputPosition: "top" as QuickInputPosition,
  gitBranchPattern: "feature/{task}-{slug}",
  gitCommitPattern: "{task} {summary}",
};

function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function readSettings(): Omit<SettingsState, "update" | "setTheme" | "reset"> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const value = JSON.parse(raw) as Partial<typeof defaultSettings>;
    return {
      theme:
        value.theme === "light" || value.theme === "dark"
          ? value.theme
          : defaultSettings.theme,
      sidebarWidth: numberIn(value.sidebarWidth, 220, 320, defaultSettings.sidebarWidth),
      aiPanelWidth: numberIn(value.aiPanelWidth, 300, 620, defaultSettings.aiPanelWidth),
      terminalHeight: numberIn(value.terminalHeight, 180, 640, defaultSettings.terminalHeight),
      confirmClose: value.confirmClose !== false,
      menuVisible: value.menuVisible !== false,
      activityVisible: value.activityVisible !== false,
      sidebarVisible: value.sidebarVisible !== false,
      statusVisible: value.statusVisible !== false,
      primarySideBarPosition: value.primarySideBarPosition === "right" ? "right" : "left",
      panelAlignment:
        value.panelAlignment === "left" || value.panelAlignment === "right" || value.panelAlignment === "center"
          ? value.panelAlignment
          : "justify",
      quickInputPosition: value.quickInputPosition === "center" ? "center" : "top",
      gitBranchPattern:
        typeof value.gitBranchPattern === "string" && value.gitBranchPattern.trim()
          ? value.gitBranchPattern
          : defaultSettings.gitBranchPattern,
      gitCommitPattern:
        typeof value.gitCommitPattern === "string" && value.gitCommitPattern.trim()
          ? value.gitCommitPattern
          : defaultSettings.gitCommitPattern,
    };
  } catch {
    return defaultSettings;
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme !== "light");
  root.style.colorScheme = theme === "light" ? "light" : "dark";
  root.dataset.theme = theme;
}

export function applyLayout(settings: Pick<typeof defaultSettings, "sidebarWidth" | "aiPanelWidth" | "terminalHeight">): void {
  const root = document.documentElement;
  root.style.setProperty("--sidebar-width", `${settings.sidebarWidth}px`);
  root.style.setProperty("--ai-panel-width", `${settings.aiPanelWidth}px`);
  root.style.setProperty("--terminal-height", `${settings.terminalHeight}px`);
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...readSettings(),
  update: (patch) => {
    const next: Omit<SettingsState, "update" | "setTheme" | "reset"> = {
      theme: get().theme,
      sidebarWidth: patch.sidebarWidth ?? get().sidebarWidth,
      aiPanelWidth: patch.aiPanelWidth ?? get().aiPanelWidth,
      terminalHeight: patch.terminalHeight ?? get().terminalHeight,
      confirmClose: patch.confirmClose ?? get().confirmClose,
      menuVisible: patch.menuVisible ?? get().menuVisible,
      activityVisible: patch.activityVisible ?? get().activityVisible,
      sidebarVisible: patch.sidebarVisible ?? get().sidebarVisible,
      statusVisible: patch.statusVisible ?? get().statusVisible,
      primarySideBarPosition: patch.primarySideBarPosition ?? get().primarySideBarPosition,
      panelAlignment: patch.panelAlignment ?? get().panelAlignment,
      quickInputPosition: patch.quickInputPosition ?? get().quickInputPosition,
      gitBranchPattern: patch.gitBranchPattern ?? get().gitBranchPattern,
      gitCommitPattern: patch.gitCommitPattern ?? get().gitCommitPattern,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    applyLayout(next);
    set(next);
  },
  setTheme: (theme) => {
    const next = { ...get(), theme };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        theme,
        sidebarWidth: next.sidebarWidth,
        aiPanelWidth: next.aiPanelWidth,
        terminalHeight: next.terminalHeight,
        confirmClose: next.confirmClose,
        menuVisible: next.menuVisible,
        activityVisible: next.activityVisible,
        sidebarVisible: next.sidebarVisible,
        statusVisible: next.statusVisible,
        primarySideBarPosition: next.primarySideBarPosition,
        panelAlignment: next.panelAlignment,
        quickInputPosition: next.quickInputPosition,
        gitBranchPattern: next.gitBranchPattern,
        gitCommitPattern: next.gitCommitPattern,
      }),
    );
    applyTheme(theme);
    set({ theme });
  },
  reset: () => {
    localStorage.removeItem(STORAGE_KEY);
    applyTheme(defaultSettings.theme);
    applyLayout(defaultSettings);
    set(defaultSettings);
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
