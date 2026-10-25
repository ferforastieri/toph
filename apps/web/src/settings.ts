import { useEffect, useState } from "react";
import { create } from "zustand";

export type ThemePreference = "auto" | "dark" | "light" | "brand" | "emerald" | "nightwolf";
export type ResolvedTheme = "dark" | "light" | "brand" | "emerald" | "nightwolf";
export type IconTheme = "toph" | "material" | "outline" | "vivid";
export type Accent = "jade" | "ocean" | "violet" | "amber" | "rose" | "graphite";
export type GlassLevel = "off" | "subtle" | "regular" | "strong";
export type BackgroundStyle = "aurora" | "mesh" | "grid" | "solid";
export type Density = "compact" | "comfortable" | "spacious";
export type TabStyle = "glass" | "underline" | "compact";

export interface AppearanceSettings {
  theme: ThemePreference;
  accent: Accent;
  glass: GlassLevel;
  background: BackgroundStyle;
  density: Density;
  tabs: TabStyle;
  radius: number;
  sidebarWidth: number;
  editorFontSize: number;
  terminalFontSize: number;
  terminalHeight: number;
  motion: boolean;
  confirmClose: boolean;
  wordWrap: boolean;
  minimap: boolean;
  respectReducedTransparency: boolean;
  aiPanelWidth: number;
  iconTheme: IconTheme;
  gitBranchPattern: string;
  gitCommitPattern: string;
}

export interface SettingsState extends AppearanceSettings {
  update: (patch: Partial<AppearanceSettings>) => void;
  reset: () => void;
}

const STORAGE_KEY = "toph_appearance";

export const defaultSettings: AppearanceSettings = {
  theme: "emerald",
  accent: "jade",
  glass: "regular",
  background: "aurora",
  density: "comfortable",
  tabs: "glass",
  radius: 20,
  sidebarWidth: 310,
  editorFontSize: 13,
  terminalFontSize: 12.5,
  terminalHeight: 280,
  motion: true,
  confirmClose: true,
  wordWrap: false,
  minimap: false,
  respectReducedTransparency: false,
  aiPanelWidth: 390,
  iconTheme: "toph",
  gitBranchPattern: "feature/{task}-{slug}",
  gitCommitPattern: "{task} {summary}",
};

const themes: ThemePreference[] = ["auto", "dark", "light", "brand", "emerald", "nightwolf"];
const iconThemes: IconTheme[] = ["toph", "material", "outline", "vivid"];
const accents: Accent[] = ["jade", "ocean", "violet", "amber", "rose", "graphite"];
const glassLevels: GlassLevel[] = ["off", "subtle", "regular", "strong"];
const backgrounds: BackgroundStyle[] = ["aurora", "mesh", "grid", "solid"];
const densities: Density[] = ["compact", "comfortable", "spacious"];
const tabStyles: TabStyle[] = ["glass", "underline", "compact"];

function choose<T extends string>(value: unknown, options: T[], fallback: T): T {
  return typeof value === "string" && options.includes(value as T) ? (value as T) : fallback;
}

function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function readSettings(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const value = JSON.parse(raw) as Partial<AppearanceSettings>;
    return {
      theme: choose(value.theme, themes, defaultSettings.theme),
      accent: choose(value.accent, accents, defaultSettings.accent),
      glass: choose(value.glass, glassLevels, defaultSettings.glass),
      background: choose(value.background, backgrounds, defaultSettings.background),
      density: choose(value.density, densities, defaultSettings.density),
      tabs: choose(value.tabs, tabStyles, defaultSettings.tabs),
      radius: numberIn(value.radius, 0, 32, defaultSettings.radius),
      sidebarWidth: numberIn(value.sidebarWidth, 220, 460, defaultSettings.sidebarWidth),
      editorFontSize: numberIn(value.editorFontSize, 11, 20, defaultSettings.editorFontSize),
      terminalFontSize: numberIn(value.terminalFontSize, 10, 18, defaultSettings.terminalFontSize),
      terminalHeight: numberIn(value.terminalHeight, 180, 640, defaultSettings.terminalHeight),
      motion: value.motion !== false,
      confirmClose: value.confirmClose !== false,
      wordWrap: value.wordWrap === true,
      minimap: value.minimap === true,
      respectReducedTransparency: value.respectReducedTransparency === true,
      aiPanelWidth: numberIn(value.aiPanelWidth, 300, 620, defaultSettings.aiPanelWidth),
      iconTheme: choose(value.iconTheme, iconThemes, defaultSettings.iconTheme),
      gitBranchPattern: !value.gitBranchPattern || value.gitBranchPattern === "feature/{datetime}" || value.gitBranchPattern === "feature/{date}"
        ? defaultSettings.gitBranchPattern
        : value.gitBranchPattern,
      gitCommitPattern: !value.gitCommitPattern || value.gitCommitPattern === "chore: update {date}"
        ? defaultSettings.gitCommitPattern
        : value.gitCommitPattern,
    };
  } catch {
    return defaultSettings;
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "auto") return preference;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

const glassStyles: Record<GlassLevel, { blur: number; opacity: number; saturate: number }> = {
  off: { blur: 0, opacity: 0.98, saturate: 1 },
  subtle: { blur: 16, opacity: 0.66, saturate: 1.3 },
  regular: { blur: 28, opacity: 0.54, saturate: 1.55 },
  strong: { blur: 42, opacity: 0.38, saturate: 1.8 },
};

export function applyAppearance(settings: AppearanceSettings): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(settings.theme);
  root.dataset.accent = settings.accent;
  root.dataset.glass = settings.glass;
  root.dataset.background = settings.background;
  root.dataset.density = settings.density;
  root.dataset.tabs = settings.tabs;
  root.dataset.motion = settings.motion ? "on" : "off";
  root.dataset.reducedTransparency = settings.respectReducedTransparency ? "on" : "off";
  root.style.setProperty("--radius", `${settings.radius}px`);
  root.style.setProperty("--sidebar-width", `${settings.sidebarWidth}px`);
  root.style.setProperty("--editor-font-size", `${settings.editorFontSize}px`);
  root.style.setProperty("--terminal-font-size", `${settings.terminalFontSize}px`);
  root.style.setProperty("--terminal-height", `${settings.terminalHeight}px`);
  root.style.setProperty("--ai-panel-width", `${settings.aiPanelWidth}px`);
  const glass = glassStyles[settings.glass];
  const lightBoost = root.dataset.theme === "light" ? 0.12 : 0;
  root.style.setProperty("--glass-blur", `${glass.blur}px`);
  root.style.setProperty("--glass-opacity", `${Math.min(1, glass.opacity + lightBoost)}`);
  root.style.setProperty("--glass-saturate", `${glass.saturate}`);
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...readSettings(),
  update: (patch) => {
    const next = { ...get(), ...patch };
    const settings: AppearanceSettings = {
      theme: next.theme,
      accent: next.accent,
      glass: next.glass,
      background: next.background,
      density: next.density,
      tabs: next.tabs,
      radius: next.radius,
      sidebarWidth: next.sidebarWidth,
      editorFontSize: next.editorFontSize,
      terminalFontSize: next.terminalFontSize,
      terminalHeight: next.terminalHeight,
      motion: next.motion,
      confirmClose: next.confirmClose,
      wordWrap: next.wordWrap,
      minimap: next.minimap,
      respectReducedTransparency: next.respectReducedTransparency,
      aiPanelWidth: next.aiPanelWidth,
      iconTheme: next.iconTheme,
      gitBranchPattern: next.gitBranchPattern,
      gitCommitPattern: next.gitCommitPattern,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    applyAppearance(settings);
    set(settings);
  },
  reset: () => {
    localStorage.removeItem(STORAGE_KEY);
    applyAppearance(defaultSettings);
    set(defaultSettings);
  },
}));

let initialized = false;

export function initAppearance(): void {
  if (initialized) return;
  initialized = true;
  applyAppearance(readSettings());
  const media = window.matchMedia?.("(prefers-color-scheme: light)");
  media?.addEventListener?.("change", () => {
    if (useSettings.getState().theme === "auto") {
      applyAppearance(useSettings.getState());
    }
  });
}

export function useResolvedTheme(): ResolvedTheme {
  const preference = useSettings((state) => state.theme);
  const [resolved, setResolved] = useState(() => resolveTheme(preference));
  useEffect(() => {
    setResolved(resolveTheme(preference));
    if (preference !== "auto") return;
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    const onChange = () => setResolved(resolveTheme(preference));
    media?.addEventListener?.("change", onChange);
    return () => media?.removeEventListener?.("change", onChange);
  }, [preference]);
  return resolved;
}

export const accentPalette: Record<Accent, { cursor: string; selectionDark: string; selectionLight: string }> = {
  jade: { cursor: "#A8C66C", selectionDark: "#33421F", selectionLight: "#CFE3B8" },
  ocean: { cursor: "#58B6D3", selectionDark: "#1D4652", selectionLight: "#BEE3EF" },
  violet: { cursor: "#B18DFF", selectionDark: "#3D3056", selectionLight: "#DED2FA" },
  amber: { cursor: "#E1B15C", selectionDark: "#4A3A1C", selectionLight: "#F0DDBB" },
  rose: { cursor: "#EE8FA2", selectionDark: "#4D2834", selectionLight: "#F4CDD5" },
  graphite: { cursor: "#C0C8B9", selectionDark: "#343B30", selectionLight: "#D7DDD3" },
};
