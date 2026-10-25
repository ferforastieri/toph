import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import type { CancellationToken, IPosition, editor, languages } from "monaco-editor";
import { accentPalette, useResolvedTheme, useSettings } from "../settings";
import { relativeTime } from "../lib";
import { useAI } from "../ai";
import { api, type GitBlameLine } from "../api";

interface Props {
  path: string;
  value: string;
  language: string;
  readOnly?: boolean;
  line?: number;
  blame?: GitBlameLine[];
  onCursorLine?: (line: number) => void;
  onChange: (value: string) => void;
  onSave?: () => void;
  onRun?: () => void;
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

const nightwolfTheme: editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: false,
  rules: [
    { token: "comment", foreground: "787878", fontStyle: "italic" },
    { token: "keyword", foreground: "00B1FF", fontStyle: "italic" },
    { token: "keyword.control", foreground: "DC8CFF" },
    { token: "string", foreground: "AAE682" },
    { token: "number", foreground: "FFDC96" },
    { token: "constant", foreground: "FFDC96" },
    { token: "type", foreground: "00DCDC" },
    { token: "function", foreground: "00DCDC" },
    { token: "variable", foreground: "FFDC96" },
    { token: "variable.parameter", foreground: "FFDC96" },
    { token: "entity.other.attribute-name", foreground: "9696FF", fontStyle: "italic" },
  ],
  colors: {
    "editor.background": "#000000",
    "editor.foreground": "#C8C8C8",
    "editorLineNumber.foreground": "#3C3C3C",
    "editorLineNumber.activeForeground": "#969696",
    "editorCursor.foreground": "#FF50FF",
    "editor.selectionBackground": "#96969659",
    "editor.inactiveSelectionBackground": "#96969633",
    "editor.lineHighlightBackground": "#9696961A",
    "editorIndentGuide.background1": "#282828",
    "editorIndentGuide.activeBackground1": "#505050",
    "editorWidget.background": "#141414",
    "editorWidget.border": "#282828",
    "input.background": "#000000",
    "input.border": "#282828",
    "list.hoverBackground": "#141414",
    "list.activeSelectionBackground": "#3C3C3C",
    "scrollbarSlider.background": "#50505050",
    "scrollbarSlider.hoverBackground": "#50505080",
    "minimap.background": "#000000",
  },
};

export default function CodeEditor({
  path,
  value,
  language,
  readOnly = false,
  line,
  blame,
  onCursorLine,
  onChange,
  onSave,
  onRun,
}: Props) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const blameWidget = useRef<{ editor: editor.IStandaloneCodeEditor; widget: editor.IContentWidget } | null>(null);
  const [monacoReady, setMonacoReady] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);
  const settings = useSettings();
  const accent = settings.accent;
  const resolved = useResolvedTheme();
  const aiConfig = useAI((state) => state.config);
  const loadAI = useAI((state) => state.load);
  const themeName = resolved === "light"
    ? "toph-light"
    : resolved === "brand"
      ? "toph-brand"
      : resolved === "emerald"
        ? "toph-emerald"
        : resolved === "nightwolf"
          ? "toph-nightwolf"
          : "toph-dark";
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const runRef = useRef(onRun);
  runRef.current = onRun;

  const themed = (base: editor.IStandaloneThemeData, dark: boolean) => ({
    ...base,
    colors: {
      ...base.colors,
      "editorCursor.foreground": accentPalette[accent].cursor,
      "editor.selectionBackground": dark
        ? accentPalette[accent].selectionDark
        : accentPalette[accent].selectionLight,
    },
  });

  const beforeMount = (monaco: Monaco) => {
    monaco.editor.defineTheme("toph-dark", themed(darkTheme, true));
    monaco.editor.defineTheme("toph-light", themed(lightTheme, false));
    monaco.editor.defineTheme("toph-brand", brandTheme);
    monaco.editor.defineTheme("toph-emerald", emeraldTheme);
    monaco.editor.defineTheme("toph-nightwolf", nightwolfTheme);
  };

  const onMount: OnMount = (instance, monaco) => {
    editorRef.current = instance;
    monacoRef.current = monaco;
    setMonacoReady(true);
    const initialLine = instance.getPosition()?.lineNumber ?? 1;
    setCursorLine(initialLine);
    onCursorLine?.(initialLine);
    instance.onDidChangeCursorPosition((event) => {
      setCursorLine(event.position.lineNumber);
      onCursorLine?.(event.position.lineNumber);
    });
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current?.();
    });
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      runRef.current?.();
    });
    if (line && line > 0) {
      instance.revealLineInCenter(line);
      instance.setPosition({ lineNumber: line, column: 1 });
      instance.focus();
    }
  };

  useEffect(() => {
    if (line && line > 0 && editorRef.current) {
      editorRef.current.revealLineInCenter(line);
      editorRef.current.setPosition({ lineNumber: line, column: 1 });
    }
  }, [line]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    monaco.editor.defineTheme("toph-dark", themed(darkTheme, true));
    monaco.editor.defineTheme("toph-light", themed(lightTheme, false));
    monaco.editor.defineTheme("toph-brand", brandTheme);
    monaco.editor.defineTheme("toph-emerald", emeraldTheme);
    monaco.editor.defineTheme("toph-nightwolf", nightwolfTheme);
    monaco.editor.setTheme(themeName);
  }, [accent, resolved, themeName]);

  useEffect(() => {
    const monaco = monacoRef.current;
    const instance = editorRef.current;
    if (!monaco || !instance || !monacoReady) return;
    if (blameWidget.current) {
      blameWidget.current.editor.removeContentWidget(blameWidget.current.widget);
      blameWidget.current = null;
    }
    const current = blame?.find((item) => item.line === cursorLine);
    const model = instance.getModel();
    if (!current || !model) return;
    const dom = document.createElement("span");
    dom.className = "blame-inline-widget";
    dom.textContent = `${current.author} · ${relativeTime(current.authorTime)} · ${current.summary}`;
    dom.title = `${current.commit.slice(0, 8)} · ${current.summary}`;
    const widget: editor.IContentWidget = {
      getId: () => "toph-blame-widget",
      getDomNode: () => dom,
      getPosition: () => ({
        position: {
          lineNumber: cursorLine,
          column: Math.max(1, model.getLineMaxColumn(cursorLine)),
        },
        preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
      }),
    };
    instance.addContentWidget(widget);
    instance.layoutContentWidget(widget);
    blameWidget.current = { editor: instance, widget };
  }, [blame, cursorLine, monacoReady]);

  useEffect(() => () => {
    if (blameWidget.current) {
      blameWidget.current.editor.removeContentWidget(blameWidget.current.widget);
      blameWidget.current = null;
    }
  }, []);

  useEffect(() => {
    if (!aiConfig) void loadAI();
  }, [aiConfig, loadAI]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !monacoReady || !aiConfig?.autocomplete) return;
    const provider = monaco.languages.registerInlineCompletionsProvider("*", {
      async provideInlineCompletions(
        model: editor.ITextModel,
        position: IPosition,
        _context: languages.InlineCompletionContext,
        token: CancellationToken,
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 280));
        if (token.isCancellationRequested) return { items: [] };
        const text = model.getValue();
        const offset = model.getOffsetAt(position);
        const prefix = text.slice(Math.max(0, offset - 6000), offset);
        const suffix = text.slice(offset, offset + 1500);
        if (prefix.trim().length < 12) return { items: [] };
        const controller = new AbortController();
        const cancel = () => controller.abort();
        token.onCancellationRequested(cancel);
        try {
          const result = await api.aiComplete(
            { path: path ?? "", language, prefix, suffix },
            controller.signal,
          );
          const completion = result.completion.trimEnd();
          if (!completion || token.isCancellationRequested) return { items: [] };
          return {
            items: [{
              insertText: completion,
              range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column,
              ),
            }],
          };
        } catch {
          return { items: [] };
        }
      },
      disposeInlineCompletions() {
        // No resources are held between requests.
      },
    });
    return () => provider.dispose();
  }, [aiConfig?.autocomplete, language, monacoReady, path]);

  return (
    <Editor
      path={path}
      language={language}
      value={value}
      theme={themeName}
      beforeMount={beforeMount}
      onMount={onMount}
      onChange={(next) => onChange(next ?? "")}
      loading={<div className="editor-loading">Loading editor...</div>}
      options={{
        readOnly,
        fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
        fontSize: settings.editorFontSize,
        lineHeight: Math.round(settings.editorFontSize * 1.55),
        minimap: { enabled: settings.minimap },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: "smooth",
        renderWhitespace: "selection",
        padding: { top: 10, bottom: 20 },
        tabSize: 2,
        wordWrap: settings.wordWrap ? "on" : "off",
        fixedOverflowWidgets: true,
      }}
    />
  );
}
