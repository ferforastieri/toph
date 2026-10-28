import { create } from "zustand";

export type Theme = "light" | "dark" | "nightwolf";

export interface SettingsState {
  theme: Theme;
  sidebarWidth: number;
  aiPanelWidth: number;
  terminalHeight: number;
  confirmClose: boolean;
  gitBranchPattern: string;
  gitCommitPattern: string;
  update: (patch: Partial<Omit<SettingsState, "update" | "setTheme" | "reset">>) => void;
  setTheme: (theme: Theme) => void;
  reset: () => void;
}

const STORAGE_KEY = "toph_settings";

export const defaultSettings = {
  theme: "nightwolf" as Theme,
  sidebarWidth: 300,
  aiPanelWidth: 390,
  terminalHeight: 280,
  confirmClose: true,
  gitBranchPattern: "feature/{task}-{slug}",
  gitCommitPattern: "{task} {summary}",
};

function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function readSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const value = JSON.parse(raw) as Partial<typeof defaultSettings>;
    return {
      theme:
        value.theme === "light" || value.theme === "dark" || value.theme === "nightwolf"
          ? value.theme
          : defaultSettings.theme,
      sidebarWidth: numberIn(value.sidebarWidth, 220, 460, defaultSettings.sidebarWidth),
      aiPanelWidth: numberIn(value.aiPanelWidth, 300, 620, defaultSettings.aiPanelWidth),
      terminalHeight: numberIn(value.terminalHeight, 180, 640, defaultSettings.terminalHeight),
      confirmClose: value.confirmClose !== false,
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
  root.classList.toggle("theme-nightwolf", theme === "nightwolf");
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
    const next = {
      theme: get().theme,
      sidebarWidth: patch.sidebarWidth ?? get().sidebarWidth,
      aiPanelWidth: patch.aiPanelWidth ?? get().aiPanelWidth,
      terminalHeight: patch.terminalHeight ?? get().terminalHeight,
      confirmClose: patch.confirmClose ?? get().confirmClose,
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
