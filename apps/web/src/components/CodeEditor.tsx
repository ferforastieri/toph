import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import type { CancellationToken, IPosition, editor, languages } from "monaco-editor";
import { useSettings } from "../settings";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CODE_FONT_FAMILY, codeLineHeight, monacoThemeName, registerEditorThemes } from "../editorThemes";
import { registerEditorTextMate } from "../editorTextMate";
import { relativeTime } from "../lib";
import { useAI } from "../ai";
import { api, type GitBlameLine, type GitHistoryEntry } from "../api";

interface Props {
  path: string;
  value: string;
  language: string;
  projectId?: string;
  projectRoot?: string;
  onOpenChanges?: (path: string) => void;
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
  projectId,
  projectRoot,
  onOpenChanges,
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
  const [annotations, setAnnotations] = useState(true);
  const [aiDialog, setAiDialog] = useState<{ title: string; text: string; busy: boolean; error: string } | null>(null);
  const [historyDialog, setHistoryDialog] = useState<{ title: string; entries: GitHistoryEntry[] | null; error: string } | null>(null);
  const [cursorLine, setCursorLine] = useState(1);
  const theme = useSettings((state) => state.theme);
  const aiConfig = useAI((state) => state.config);
  const loadAI = useAI((state) => state.load);
  const themeName = monacoThemeName(theme);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const runRef = useRef(onRun);
  runRef.current = onRun;
  const pathRef = useRef(path);
  pathRef.current = path;
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const projectRootRef = useRef(projectRoot);
  projectRootRef.current = projectRoot;
  const openChangesRef = useRef(onOpenChanges);
  openChangesRef.current = onOpenChanges;

  async function askAi(kind: "explain" | "review") {
    const instance = editorRef.current;
    const model = instance?.getModel();
    if (!instance || !model) return;
    const selection = instance.getSelection();
    const selected = selection ? model.getValueInRange(selection) : "";
    const lineNumber = instance.getPosition()?.lineNumber ?? 1;
    const snippet = selected.trim() || model.getLineContent(lineNumber);
    const prompt = kind === "explain"
      ? `Explain the following ${language} code from ${pathRef.current}. Be concise and mention risks or non-obvious behavior.\n\n${snippet}`
      : `Review the following ${language} code from ${pathRef.current}. Focus on bugs, edge cases, security and maintainability. Be concise.\n\n${snippet}`;
    setAiDialog({ title: kind === "explain" ? "Explain" : "Review", text: "", busy: true, error: "" });
    try {
      let config = useAI.getState().config;
      if (!config) {
        await useAI.getState().load();
        config = useAI.getState().config;
      }
      const result = await api.aiChat(
        [
          { role: "system", content: "You are a precise senior software engineer." },
          { role: "user", content: prompt },
        ],
        { model: config?.model, yolo: true },
      );
      setAiDialog((current) => current ? { ...current, text: result.text, busy: false } : current);
    } catch (error) {
      setAiDialog((current) => current
        ? { ...current, busy: false, error: error instanceof Error ? error.message : "AI request failed." }
        : current);
    }
  }

  async function openHistory() {
    if (!projectIdRef.current) return;
    setHistoryDialog({ title: `History · ${pathRef.current}`, entries: null, error: "" });
    try {
      const entries = await api.gitHistory(projectIdRef.current, pathRef.current);
      setHistoryDialog((current) => current ? { ...current, entries } : current);
    } catch (error) {
      setHistoryDialog((current) => current
        ? { ...current, error: error instanceof Error ? error.message : "Could not read history." }
        : current);
    }
  }

  function copy(valueToCopy: string) {
    void navigator.clipboard?.writeText(valueToCopy).catch(() => undefined);
  }

  function toggleAnnotations() {
    setAnnotations((current) => !current);
  }

  function openRemote() {
    if (!projectIdRef.current) return;
    window.open(api.rawUrl(projectIdRef.current, pathRef.current), "_blank", "noopener,noreferrer");
  }

  function addContextActions(instance: editor.IStandaloneCodeEditor) {
    instance.addAction({
      id: "toph.explain",
      label: "Explain",
      contextMenuGroupId: "1_modification",
      contextMenuOrder: 10,
      run: () => void askAi("explain"),
    });
    instance.addAction({
      id: "toph.review",
      label: "Review",
      contextMenuGroupId: "1_modification",
      contextMenuOrder: 11,
      run: () => void askAi("review"),
    });
    instance.addAction({
      id: "toph.go-type-definition",
      label: "Go to Type Definition",
      contextMenuGroupId: "navigation",
      contextMenuOrder: 2,
      run: () => instance.trigger("keyboard", "editor.action.goToTypeDefinition", null),
    });
    instance.addAction({
      id: "toph.go-source-definition",
      label: "Go to Source Definition",
      contextMenuGroupId: "navigation",
      contextMenuOrder: 3,
      run: () => instance.trigger("keyboard", "editor.action.revealDefinition", null),
    });
    instance.addAction({
      id: "toph.find-all-references",
      label: "Find All References",
      contextMenuGroupId: "navigation",
      contextMenuOrder: 4,
      run: () => instance.trigger("keyboard", "editor.action.referenceSearch.trigger", null),
    });
    instance.addAction({
      id: "toph.open-changes",
      label: "Open Changes",
      contextMenuGroupId: "navigation",
      contextMenuOrder: 50,
      run: () => openChangesRef.current?.(pathRef.current),
    });
    instance.addAction({
      id: "toph.open-remote",
      label: "Open on Remote (Web)",
      contextMenuGroupId: "9_cutcopypaste",
      contextMenuOrder: 1,
      run: () => openRemote(),
    });
    instance.addAction({
      id: "toph.file-annotations",
      label: "File Annotations",
      contextMenuGroupId: "navigation",
      contextMenuOrder: 60,
      run: () => toggleAnnotations(),
    });
    instance.addAction({
      id: "toph.file-history",
      label: "File History",
      contextMenuGroupId: "navigation",
      contextMenuOrder: 61,
      run: () => void openHistory(),
    });
    instance.addAction({
      id: "toph.copy-as",
      label: "Copy As",
      contextMenuGroupId: "9_cutcopypaste",
      contextMenuOrder: 19,
      run: () => {
        const model = instance.getModel();
        const selection = instance.getSelection();
        const text = model && selection ? model.getValueInRange(selection) : "";
        copy(text || pathRef.current);
      },
    });
    instance.addAction({
      id: "toph.copy-path",
      label: "Copy Path",
      contextMenuGroupId: "9_cutcopypaste",
      contextMenuOrder: 20,
      run: () => copy(projectRootRef.current ? `${projectRootRef.current}/${pathRef.current}` : pathRef.current),
    });
    instance.addAction({
      id: "toph.copy-relative-path",
      label: "Copy Relative Path",
      contextMenuGroupId: "9_cutcopypaste",
      contextMenuOrder: 21,
      run: () => copy(pathRef.current),
    });
  }

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
    addContextActions(instance);
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
    registerEditorThemes(monaco);
    monaco.editor.setTheme(themeName);
  }, [themeName]);

  useEffect(() => {
    const monaco = monacoRef.current;
    const instance = editorRef.current;
    if (!monaco || !instance || !monacoReady) return;
    if (blameWidget.current) {
      blameWidget.current.editor.removeContentWidget(blameWidget.current.widget);
      blameWidget.current = null;
    }
    if (!annotations) return;
    const current = blame?.find((item) => item.line === cursorLine);
    const model = instance.getModel();
    if (!current || !model) return;
    const dom = document.createElement("span");
    dom.className = "pointer-events-none ml-[18px] flex h-[19px] -translate-y-px items-center whitespace-nowrap font-mono text-[9.5px] italic text-muted-foreground opacity-80";
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
  }, [annotations, blame, cursorLine, monacoReady]);

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
    <>
    <Editor
      path={path}
      language={language}
      value={value}
      theme={themeName}
      beforeMount={(monaco) => {
        registerEditorThemes(monaco);
        registerEditorTextMate(monaco);
      }}
      onMount={onMount}
      onChange={(next) => onChange(next ?? "")}
      loading={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading editor...</div>}
      options={{
        readOnly,
        fontFamily: CODE_FONT_FAMILY,
        fontSize: 14,
        lineHeight: codeLineHeight(14),
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: true,
        smoothScrolling: false,
        cursorBlinking: "blink",
        renderWhitespace: "none",
        lineNumbersMinChars: 3,
        glyphMargin: false,
        padding: { top: 0, bottom: 0 },
        tabSize: 2,
        wordWrap: "off",
        quickSuggestions: { other: true, comments: false, strings: true },
        suggestOnTriggerCharacters: true,
        inlineSuggest: { enabled: true },
        wordBasedSuggestions: "currentDocument",
        fixedOverflowWidgets: true,
      }}
    />
    {aiDialog && (
      <Dialog open onOpenChange={(open) => !open && setAiDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{aiDialog.title}</DialogTitle><DialogDescription>Resposta da IA.</DialogDescription></DialogHeader>
          {aiDialog.busy && <p className="py-6 text-center text-sm text-muted-foreground">Consultando IA...</p>}
          {aiDialog.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{aiDialog.error}</p>}
          {aiDialog.text && <pre className="whitespace-pre-wrap break-words text-sm">{aiDialog.text}</pre>}
        </DialogContent>
      </Dialog>
    )}
    {historyDialog && (
      <Dialog open onOpenChange={(open) => !open && setHistoryDialog(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{historyDialog.title}</DialogTitle><DialogDescription>Histórico de commits.</DialogDescription></DialogHeader>
          {!historyDialog.entries && !historyDialog.error && <p className="py-6 text-center text-sm text-muted-foreground">Carregando histórico...</p>}
          {historyDialog.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{historyDialog.error}</p>}
          {historyDialog.entries?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Sem commits.</p>}
          <div className="flex flex-col gap-1">
            {historyDialog.entries?.map((entry) => (
              <div className="flex flex-col gap-1 rounded-lg border px-3 py-2" key={entry.hash}>
                <div className="flex items-center gap-2"><code className="rounded bg-muted px-1 text-[11px]">{entry.hash.slice(0, 8)}</code><span className="truncate text-xs font-medium">{entry.subject}</span></div>
                <small className="text-[11px] text-muted-foreground">{entry.author} · {new Date(entry.date).toLocaleString()}</small>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}
