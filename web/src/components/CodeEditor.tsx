import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import type { CancellationToken, IPosition, editor, languages } from "monaco-editor";
import { accentPalette, useResolvedTheme, useSettings } from "../settings";
import { useAI } from "../ai";
import { api } from "../api";

interface Props {
  path: string;
  value: string;
  language: string;
  readOnly?: boolean;
  line?: number;
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

export default function CodeEditor({
  path,
  value,
  language,
  readOnly = false,
  line,
  onChange,
  onSave,
  onRun,
}: Props) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [monacoReady, setMonacoReady] = useState(false);
  const settings = useSettings();
  const accent = settings.accent;
  const resolved = useResolvedTheme();
  const aiConfig = useAI((state) => state.config);
  const loadAI = useAI((state) => state.load);
  const themeName = resolved === "light" ? "toph-light" : "toph-dark";
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
  };

  const onMount: OnMount = (instance, monaco) => {
    editorRef.current = instance;
    monacoRef.current = monaco;
    setMonacoReady(true);
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
    monaco.editor.setTheme(themeName);
  }, [accent, resolved, themeName]);

  useEffect(() => {
    if (!aiConfig) void loadAI();
  }, [aiConfig, loadAI]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !monacoReady || !aiConfig?.autocomplete || aiConfig.provider === "opencode") return;
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
  }, [aiConfig?.autocomplete, aiConfig?.provider, language, monacoReady, path]);

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
