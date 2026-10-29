import type { Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import type { Theme } from "./settings";

export const CODE_FONT_FAMILY = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function codeLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.35);
}

const darkTheme: editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "737373", fontStyle: "italic" },
    { token: "keyword", foreground: "60A5FA" },
    { token: "string", foreground: "86EFAC" },
    { token: "number", foreground: "FDBA74" },
    { token: "type", foreground: "67E8F9" },
    { token: "function", foreground: "C4B5FD" },
    { token: "variable", foreground: "FAFAFA" },
  ],
  colors: {
    "editor.background": "#000000",
    "editor.foreground": "#E8E8E8",
    "editorLineNumber.foreground": "#4A4A4A",
    "editorLineNumber.activeForeground": "#969696",
    "editorCursor.foreground": "#FFB547",
    "editor.selectionBackground": "#FFB54740",
    "editor.inactiveSelectionBackground": "#FFB54722",
    "editor.lineHighlightBackground": "#141414",
    "editorIndentGuide.background1": "#282828",
    "editorIndentGuide.activeBackground1": "#3C3C3C",
    "editorWidget.background": "#141414",
    "editorWidget.border": "#282828",
    "input.background": "#000000",
    "input.border": "#282828",
    "list.hoverBackground": "#1E1E1E",
    "list.activeSelectionBackground": "#282828",
    "scrollbarSlider.background": "#3C3C3C88",
    "scrollbarSlider.hoverBackground": "#505050AA",
    "minimap.background": "#000000",
  },
};

const lightTheme: editor.IStandaloneThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "737373", fontStyle: "italic" },
    { token: "keyword", foreground: "2563EB" },
    { token: "string", foreground: "16A34A" },
    { token: "number", foreground: "EA580C" },
    { token: "type", foreground: "0891B2" },
    { token: "function", foreground: "7C3AED" },
    { token: "variable", foreground: "0A0A0A" },
  ],
  colors: {
    "editor.background": "#FFFFFF",
    "editor.foreground": "#0A0A0A",
    "editorLineNumber.foreground": "#A3A3A3",
    "editorLineNumber.activeForeground": "#525252",
    "editorCursor.foreground": "#C96A00",
    "editor.selectionBackground": "#FFE2A880",
    "editor.inactiveSelectionBackground": "#FFF8EB",
    "editor.lineHighlightBackground": "#FAFAFA",
    "editorIndentGuide.background1": "#EBEBEB",
    "editorIndentGuide.activeBackground1": "#D4D4D4",
    "editorWidget.background": "#FFFFFF",
    "editorWidget.border": "#E5E5E5",
    "input.background": "#FFFFFF",
    "input.border": "#E5E5E5",
    "list.hoverBackground": "#FAFAFA",
    "list.activeSelectionBackground": "#FFE2A880",
    "scrollbarSlider.background": "#D4D4D488",
    "scrollbarSlider.hoverBackground": "#A3A3A3AA",
    "minimap.background": "#FFFFFF",
  },
};

export function monacoThemeName(theme: Theme): "toph-dark" | "toph-light" {
  return theme === "light" ? "toph-light" : "toph-dark";
}

export function registerEditorThemes(monaco: Monaco): void {
  monaco.editor.defineTheme("toph-dark", darkTheme);
  monaco.editor.defineTheme("toph-light", lightTheme);
}
