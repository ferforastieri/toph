import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import type { CancellationToken, IPosition, editor, languages } from "monaco-editor";
import { useResolvedTheme, useSettings } from "../settings";
import { CODE_FONT_FAMILY, codeLineHeight, monacoThemeName, registerEditorThemes } from "../editorThemes";
import { registerEditorTextMate } from "../editorTextMate";
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
  onCursorPosition?: (line: number, column: number) => void;
  onChange: (value: string) => void;
  onSave?: () => void;
  onRun?: () => void;
}

export default function CodeEditor({
  path,
  value,
  language,
  readOnly = false,
  line,
  blame,
  onCursorLine,
  onCursorPosition,
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
  const themeName = monacoThemeName(resolved);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const runRef = useRef(onRun);
  runRef.current = onRun;

  const onMount: OnMount = (instance, monaco) => {
    editorRef.current = instance;
    monacoRef.current = monaco;
    setMonacoReady(true);
    const initialLine = instance.getPosition()?.lineNumber ?? 1;
    setCursorLine(initialLine);
    onCursorLine?.(initialLine);
    const initialPosition = instance.getPosition();
    if (initialPosition) onCursorPosition?.(initialPosition.lineNumber, initialPosition.column);
    instance.onDidChangeCursorPosition((event) => {
      setCursorLine(event.position.lineNumber);
      onCursorLine?.(event.position.lineNumber);
      onCursorPosition?.(event.position.lineNumber, event.position.column);
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
    registerEditorThemes(monaco, accent);
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
      beforeMount={(monaco) => {
        registerEditorThemes(monaco, accent);
        registerEditorTextMate(monaco);
      }}
      onMount={onMount}
      onChange={(next) => onChange(next ?? "")}
      loading={<div className="editor-loading">Loading editor...</div>}
      options={{
        readOnly,
        fontFamily: CODE_FONT_FAMILY,
        fontSize: settings.editorFontSize,
        lineHeight: codeLineHeight(settings.editorFontSize),
        minimap: { enabled: settings.minimap },
        automaticLayout: true,
        scrollBeyondLastLine: true,
        smoothScrolling: false,
        cursorBlinking: "blink",
        renderWhitespace: "none",
        lineNumbersMinChars: 3,
        glyphMargin: false,
        padding: { top: 0, bottom: 0 },
        tabSize: 2,
        wordWrap: settings.wordWrap ? "on" : "off",
        fixedOverflowWidgets: true,
      }}
    />
  );
}
