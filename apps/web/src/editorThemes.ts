import type { Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

import { accentPalette, type Accent, type ResolvedTheme } from "./settings";

// Toph's editor monospace stack.
export const CODE_FONT_FAMILY = "'Droid Sans Mono', monospace";

export function codeLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.35);
}

const darkTheme: editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "77806F", fontStyle: "italic" },
    { token: "keyword", foreground: "D4A24C" },
    { token: "string", foreground: "A8C66C" },
    { token: "number", foreground: "E0A33A" },
    { token: "type", foreground: "7FA7A0" },
    { token: "function", foreground: "B9D77E" },
    { token: "variable", foreground: "EEF1E8" },
  ],
  colors: {
    "editor.background": "#0F120D",
    "editor.foreground": "#EEF1E8",
    "editorLineNumber.foreground": "#566050",
    "editorLineNumber.activeForeground": "#A3AA99",
    "editorCursor.foreground": "#A8C66C",
    "editor.selectionBackground": "#33421F",
    "editor.inactiveSelectionBackground": "#26311A",
    "editor.lineHighlightBackground": "#171B14",
    "editorIndentGuide.background1": "#252C20",
    "editorIndentGuide.activeBackground1": "#3C4733",
    "editorWidget.background": "#20261C",
    "editorWidget.border": "#31392B",
    "input.background": "#0F120D",
    "input.border": "#31392B",
    "list.hoverBackground": "#20261C",
    "list.activeSelectionBackground": "#2B3520",
    "scrollbarSlider.background": "#31392B88",
    "scrollbarSlider.hoverBackground": "#3C4733AA",
    "minimap.background": "#0F120D",
  },
};

const lightTheme: editor.IStandaloneThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "7A8177", fontStyle: "italic" },
    { token: "keyword", foreground: "9A5B12" },
    { token: "string", foreground: "3E7A45" },
    { token: "number", foreground: "A05A18" },
    { token: "type", foreground: "2F6E76" },
    { token: "function", foreground: "2E6A3A" },
    { token: "variable", foreground: "22251F" },
  ],
  colors: {
    "editor.background": "#F7F8F5",
    "editor.foreground": "#22251F",
    "editorLineNumber.foreground": "#A2A79D",
    "editorLineNumber.activeForeground": "#555C52",
    "editorCursor.foreground": "#4F7A2E",
    "editor.selectionBackground": "#CFE3B8",
    "editor.inactiveSelectionBackground": "#E1ECD5",
    "editor.lineHighlightBackground": "#EEF1EA",
    "editorIndentGuide.background1": "#DDE2D8",
    "editorIndentGuide.activeBackground1": "#B8C1B0",
    "editorWidget.background": "#FFFFFF",
    "editorWidget.border": "#D7DDD2",
    "input.background": "#FFFFFF",
    "input.border": "#CDD5C7",
    "list.hoverBackground": "#F0F3EC",
    "list.activeSelectionBackground": "#E4ECD9",
    "scrollbarSlider.background": "#B8C1B088",
    "scrollbarSlider.hoverBackground": "#9AA58FAA",
    "minimap.background": "#F7F8F5",
  },
};

const brandTheme: editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: false,
  rules: [
    { token: "comment", foreground: "67748F", fontStyle: "italic" },
    { token: "keyword", foreground: "7C9BFF" },
    { token: "string", foreground: "7BD88F" },
    { token: "number", foreground: "FFC857" },
    { token: "constant", foreground: "FFC857" },
    { token: "type", foreground: "58C4FF" },
    { token: "function", foreground: "98B0FF" },
    { token: "variable", foreground: "DCE4F7" },
    { token: "variable.parameter", foreground: "B7C4E2" },
    { token: "entity.other.attribute-name", foreground: "A9B8FF" },
  ],
  colors: {
    "editor.background": "#080B12",
    "editor.foreground": "#DCE4F7",
    "editorLineNumber.foreground": "#4D5870",
    "editorLineNumber.activeForeground": "#8D9BB8",
    "editorCursor.foreground": "#7C9BFF",
    "editor.selectionBackground": "#2B3B70",
    "editor.inactiveSelectionBackground": "#202A4A",
    "editor.lineHighlightBackground": "#111625",
    "editorIndentGuide.background1": "#1E2639",
    "editorIndentGuide.activeBackground1": "#2A3147",
    "editorWidget.background": "#1A1F2E",
    "editorWidget.border": "#2A3147",
    "input.background": "#080B12",
    "input.border": "#2A3147",
    "list.hoverBackground": "#1A1F2E",
    "list.activeSelectionBackground": "#202A4A",
    "scrollbarSlider.background": "#2A314788",
    "scrollbarSlider.hoverBackground": "#4F46E5AA",
    "minimap.background": "#080B12",
  },
};

const emeraldTheme: editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: false,
  rules: [
    { token: "comment", foreground: "5C8B7E", fontStyle: "italic" },
    { token: "keyword", foreground: "43E6A0" },
    { token: "string", foreground: "A7F3D0" },
    { token: "number", foreground: "F6C96B" },
    { token: "constant", foreground: "F6C96B" },
    { token: "type", foreground: "67E8F9" },
    { token: "function", foreground: "6CF2B7" },
    { token: "variable", foreground: "E7FFF7" },
    { token: "variable.parameter", foreground: "B6E3D5" },
    { token: "entity.other.attribute-name", foreground: "5EEAD4" },
  ],
  colors: {
    "editor.background": "#041310",
    "editor.foreground": "#E7FFF7",
    "editorLineNumber.foreground": "#426B60",
    "editorLineNumber.activeForeground": "#7FB3A3",
    "editorCursor.foreground": "#43E6A0",
    "editor.selectionBackground": "#174035",
    "editor.inactiveSelectionBackground": "#0F2F27",
    "editor.lineHighlightBackground": "#0A201B",
    "editorIndentGuide.background1": "#0F2F27",
    "editorIndentGuide.activeBackground1": "#2A5B4E",
    "editorWidget.background": "#0F2B25",
    "editorWidget.border": "#174035",
    "input.background": "#041310",
    "input.border": "#174035",
    "list.hoverBackground": "#0F2B25",
    "list.activeSelectionBackground": "#14382F",
    "scrollbarSlider.background": "#17403588",
    "scrollbarSlider.hoverBackground": "#2A5B4EAA",
    "minimap.background": "#041310",
  },
};

// Night Wolf color scheme, bundled with Toph.
const nightwolfTheme: editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: false,
  rules: [
    { token: "", foreground: "C8C8C8" },
    { token: "comment", foreground: "647882", fontStyle: "italic" },
    { token: "comment.doc", foreground: "647882", fontStyle: "italic" },
    { token: "keyword", foreground: "00B1FF", fontStyle: "italic" },
    { token: "keyword.control", foreground: "9696FF", fontStyle: "italic" },
    { token: "keyword.control.conditional", foreground: "DC8CFF" },
    { token: "keyword.control.switch", foreground: "DC8CFF" },
    { token: "keyword.control.loop", foreground: "DC8CFF", fontStyle: "italic" },
    { token: "keyword.operator", foreground: "FF7878" },
    { token: "keyword.operator.logical", foreground: "DC8CFF" },
    { token: "keyword.operator.comparison", foreground: "DC8CFF" },
    { token: "keyword.operator.relational", foreground: "DC8CFF" },
    { token: "keyword.other.new", foreground: "FF7878" },
    { token: "storage", foreground: "00B1FF", fontStyle: "italic" },
    { token: "storage.modifier", foreground: "9696FF", fontStyle: "italic" },
    { token: "string", foreground: "AAE682" },
    { token: "string.invalid", foreground: "F05050" },
    { token: "string.regexp", foreground: "DBD4BA" },
    { token: "regexp", foreground: "DBD4BA" },
    { token: "number", foreground: "FFB482" },
    { token: "number.hex", foreground: "FFB482" },
    { token: "constant", foreground: "FFDC96" },
    { token: "constant.numeric", foreground: "FFB482" },
    { token: "constant.language", foreground: "FF7878" },
    { token: "type", foreground: "00DCDC" },
    { token: "type.identifier", foreground: "86E0F4" },
    { token: "identifier", foreground: "C8C8C8" },
    { token: "function", foreground: "00DCDC" },
    { token: "variable", foreground: "FFDC96" },
    { token: "variable.parameter", foreground: "FFDC96" },
    { token: "parameter", foreground: "FFDC96" },
    { token: "variable.predefined", foreground: "FFDC96" },
    { token: "delimiter", foreground: "C8C8C8" },
    { token: "delimiter.bracket", foreground: "C8C8C8" },
    { token: "operator", foreground: "FF7878" },
    { token: "tag", foreground: "FF7878" },
    { token: "attribute.name", foreground: "9696FF", fontStyle: "italic" },
    { token: "attribute.value", foreground: "AAE682" },
    { token: "metatag", foreground: "C8C8C8" },
    { token: "annotation", foreground: "9696FF" },
    { token: "invalid", foreground: "F05050" },
  ],
  colors: {
    "editor.background": "#000000",
    "editor.foreground": "#C8C8C8",
    "editorLineNumber.foreground": "#3C3C3C",
    "editorLineNumber.activeForeground": "#969696",
    "editorCursor.foreground": "#FF50FF",
    "editor.selectionBackground": "#96969659",
    "editor.selectionForeground": "#C8C8C8",
    "editor.inactiveSelectionBackground": "#96969633",
    "editor.lineHighlightBackground": "#9696961A",
    "editorIndentGuide.background1": "#282828",
    "editorIndentGuide.activeBackground1": "#505050",
    "editorWhitespace.foreground": "#282828",
    "editorWidget.background": "#141414",
    "editorWidget.border": "#3C3C3C",
    "editorWidget.foreground": "#C8C8C8",
    "editorSuggestWidget.background": "#141414",
    "editorSuggestWidget.border": "#282828",
    "editorSuggestWidget.foreground": "#969696",
    "editorSuggestWidget.highlightForeground": "#FFDC96",
    "editorSuggestWidget.selectedBackground": "#282828",
    "editorHoverWidget.background": "#141414",
    "editorHoverWidget.border": "#282828",
    "editorHoverWidget.foreground": "#C8C8C8",
    "editorBracketMatch.border": "#787878",
    "editorBracketHighlight.foreground1": "#FFDC96",
    "editorBracketHighlight.foreground2": "#FF7878",
    "editorBracketHighlight.foreground3": "#00B1FF",
    "editorBracketHighlight.foreground4": "#FFB482",
    "editorBracketHighlight.foreground5": "#DC8CFF",
    "editorBracketHighlight.foreground6": "#AAE682",
    "editorGutter.background": "#000000",
    "editor.findMatchBackground": "#3C3C3C",
    "editor.findMatchBorder": "#969696",
    "editor.findMatchHighlightBackground": "#96969633",
    "editor.findMatchHighlightBorder": "#96969666",
    "editor.rangeHighlightBackground": "#9696961A",
    "editor.selectionHighlightBackground": "#9696961A",
    "editor.selectionHighlightBorder": "#9696964D",
    "editor.wordHighlightBackground": "#96969633",
    "editor.wordHighlightBorder": "#96969666",
    "editor.wordHighlightStrongBackground": "#96969633",
    "editorError.foreground": "#F05050",
    "editorWarning.foreground": "#FFC828",
    "editorLightBulb.foreground": "#FFC828",
    "editorLightBulbAutoFix.foreground": "#FFBEFF",
    "scrollbarSlider.background": "#50505050",
    "scrollbarSlider.hoverBackground": "#50505080",
    "scrollbarSlider.activeBackground": "#50505050",
    "minimap.background": "#000000",
    "minimap.selectionHighlight": "#FF50FF",
    "list.hoverBackground": "#141414",
    "list.activeSelectionBackground": "#3C3C3C",
    "list.inactiveSelectionBackground": "#282828",
    "input.background": "#000000",
    "input.foreground": "#C8C8C8",
    "input.border": "#282828",
    "focusBorder": "#505050",
  },
};

function withAccent(
  base: editor.IStandaloneThemeData,
  dark: boolean,
  accent: Accent,
): editor.IStandaloneThemeData {
  return {
    ...base,
    colors: {
      ...base.colors,
      "editorCursor.foreground": accentPalette[accent].cursor,
      "editor.selectionBackground": dark
        ? accentPalette[accent].selectionDark
        : accentPalette[accent].selectionLight,
    },
  };
}

export function monacoThemeName(resolved: ResolvedTheme): string {
  if (resolved === "light") return "toph-light";
  if (resolved === "brand") return "toph-brand";
  if (resolved === "emerald") return "toph-emerald";
  if (resolved === "nightwolf") return "toph-nightwolf";
  return "toph-dark";
}

export function registerEditorThemes(monaco: Monaco, accent: Accent): void {
  monaco.editor.defineTheme("toph-dark", withAccent(darkTheme, true, accent));
  monaco.editor.defineTheme("toph-light", withAccent(lightTheme, false, accent));
  monaco.editor.defineTheme("toph-brand", brandTheme);
  monaco.editor.defineTheme("toph-emerald", emeraldTheme);
  monaco.editor.defineTheme("toph-nightwolf", nightwolfTheme);
}
