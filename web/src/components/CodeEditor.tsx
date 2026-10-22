import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import type { editor } from "monaco-editor";

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

const theme: editor.IStandaloneThemeData = {
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
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const runRef = useRef(onRun);
  runRef.current = onRun;

  const beforeMount = (monaco: Monaco) => {
    monaco.editor.defineTheme("toph-dark", theme);
  };

  const onMount: OnMount = (instance, monaco) => {
    editorRef.current = instance;
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

  return (
    <Editor
      path={path}
      language={language}
      value={value}
      theme="toph-dark"
      beforeMount={beforeMount}
      onMount={onMount}
      onChange={(next) => onChange(next ?? "")}
      loading={<div className="editor-loading">Loading editor...</div>}
      options={{
        readOnly,
        fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
        fontSize: 13,
        lineHeight: 21,
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: "smooth",
        renderWhitespace: "selection",
        padding: { top: 10, bottom: 20 },
        tabSize: 2,
        wordWrap: "off",
        fixedOverflowWidgets: true,
      }}
    />
  );
}
