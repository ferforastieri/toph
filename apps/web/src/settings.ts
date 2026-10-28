import { create } from "zustand";

export type Theme = "light" | "dark" | "nightwolf";

export interface SettingsState {
  theme: Theme;
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
  confirmClose: true,
  gitBranchPattern: "feature/{task}-{slug}",
  gitCommitPattern: "{task} {summary}",
};


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


export const useSettings = create<SettingsState>((set, get) => ({
  ...readSettings(),
  update: (patch) => {
    const next = {
      theme: get().theme,
      confirmClose: patch.confirmClose ?? get().confirmClose,
      gitBranchPattern: patch.gitBranchPattern ?? get().gitBranchPattern,
      gitCommitPattern: patch.gitCommitPattern ?? get().gitCommitPattern,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    set(next);
  },
  setTheme: (theme) => {
    const next = { ...get(), theme };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        theme,
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
    set(defaultSettings);
  },
}));

let initialized = false;

export function initAppearance(): void {
  if (initialized) return;
  initialized = true;
  const settings = readSettings();
  applyTheme(settings.theme);
  localStorage.removeItem("toph_appearance");
}
