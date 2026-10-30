import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CancellationToken, IPosition, editor, languages } from "monaco-editor";
import { useSettings } from "../settings";
import { Modal } from "@/boardui/base/modal/modal";
import { CODE_FONT_FAMILY, codeLineHeight, monacoThemeName, registerEditorThemes } from "../editorThemes";
import { registerEditorTextMate } from "../editorTextMate";
import { useAI } from "../ai";
import { useApp } from "../store";
import { api, type GitHistoryEntry } from "../api";
import { useIsMobile } from "../ui/useIsMobile";

interface Props {
  path: string;
  value: string;
  language: string;
  projectId?: string;
  projectRoot?: string;
  onOpenChanges?: (path: string) => void;
  readOnly?: boolean;
  line?: number;
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
  onCursorLine,
  onCursorPosition,
  onChange,
  onSave,
  onRun,
}: Props) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [monacoReady, setMonacoReady] = useState(false);
  const [aiDialog, setAiDialog] = useState<{ title: string; text: string; busy: boolean; error: string } | null>(null);
  const [historyDialog, setHistoryDialog] = useState<{ title: string; entries: GitHistoryEntry[] | null; error: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const theme = useSettings((state) => state.theme);
  const mobile = useIsMobile();
  const aiConfig = useAI((state) => state.config);
  const loadAI = useAI((state) => state.load);
  const notify = useApp((state) => state.notify);
  const autocompleteErrorAt = useRef(0);
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

  function openRemote() {
    if (!projectIdRef.current) return;
    window.open(api.rawUrl(projectIdRef.current, pathRef.current), "_blank", "noopener,noreferrer");
  }

  useEffect(() => {
    const handleCommand = (event: Event) => {
      const command = (event as CustomEvent<{ command?: string }>).detail?.command;
      const instance = editorRef.current;
      if (!command || !instance) return;
      if (command === "save") { saveRef.current?.(); return; }
      if (command === "run") { runRef.current?.(); return; }
      if (command === "editor.action.goBack" || command === "editor.action.goForward") return;
      const action = instance.getAction(command);
      if (action) void action.run();
      else if (command === "undo" || command === "redo" || command === "actions.find") instance.trigger("menu", command, null);
    };
    window.addEventListener("toph:editor-command", handleCommand);
    return () => window.removeEventListener("toph:editor-command", handleCommand);
  }, []);

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

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [contextMenu]);

  function runContextAction(id: string) {
    setContextMenu(null);
    void editorRef.current?.getAction(id)?.run();
  }

  function triggerContextAction(id: string) {
    setContextMenu(null);
    editorRef.current?.trigger("contextmenu", id, null);
  }

  function openEditorContextMenu(event: MouseEvent, instance: editor.IStandaloneCodeEditor) {
    event.preventDefault();
    event.stopPropagation();
    const target = instance.getTargetAtClientPoint(event.clientX, event.clientY);
    if (target?.position) instance.setPosition(target.position);
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 320),
      y: Math.min(event.clientY, window.innerHeight - 520),
    });
  }

  const onMount: OnMount = (instance, monaco) => {
    editorRef.current = instance;
    monacoRef.current = monaco;
    setMonacoReady(true);
    const initialLine = instance.getPosition()?.lineNumber ?? 1;
    onCursorLine?.(initialLine);
    const initialPosition = instance.getPosition();
    if (initialPosition) onCursorPosition?.(initialPosition.lineNumber, initialPosition.column);
    instance.onDidChangeCursorPosition((event) => {
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
    const dom = instance.getDomNode();
    const handleContextMenu = (event: MouseEvent) => openEditorContextMenu(event, instance);
    dom?.addEventListener("contextmenu", handleContextMenu, true);
    instance.onDidDispose(() => dom?.removeEventListener("contextmenu", handleContextMenu, true));
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
        await new Promise((resolve) => window.setTimeout(resolve, 80));
        if (token.isCancellationRequested) return { items: [] };
        const text = model.getValue();
        const offset = model.getOffsetAt(position);
        const prefix = text.slice(Math.max(0, offset - 2500), offset);
        const suffix = text.slice(offset, offset + 600);
        if (prefix.trim().length < 4) return { items: [] };
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
        } catch (err) {
          if (!controller.signal.aborted) {
            const message = err instanceof Error ? err.message : "falha ao consultar o modelo";
            const now = Date.now();
            if (now - autocompleteErrorAt.current > 30_000) {
              autocompleteErrorAt.current = now;
              notify("error", `Autocomplete: ${message}`);
            }
          }
          return { items: [] };
        }
      },
      disposeInlineCompletions() {
        // No resources are held between requests.
      },
    });
    return () => provider.dispose();
  }, [aiConfig?.autocomplete, language, monacoReady, notify, path]);

  useEffect(() => {
    const monaco = monacoRef.current;
    const instance = editorRef.current;
    if (!monaco || !instance || !monacoReady) return;
    const publish = () => {
      const model = instance.getModel();
      if (!model) return;
      const markers = monaco.editor.getModelMarkers({ resource: model.uri }).map((marker: editor.IMarker) => ({
        path,
        line: marker.startLineNumber,
        column: marker.startColumn,
        severity: marker.severity,
        message: marker.message,
        source: marker.source ?? "",
      }));
      window.dispatchEvent(new CustomEvent("toph:diagnostics", { detail: { path, items: markers } }));
    };
    const subscription = monaco.editor.onDidChangeMarkers(publish);
    publish();
    return () => {
      subscription.dispose();
      window.dispatchEvent(new CustomEvent("toph:diagnostics", { detail: { path, items: [] } }));
    };
  }, [monacoReady, path]);

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
        fontSize: mobile ? 12 : 14,
        lineHeight: codeLineHeight(mobile ? 12 : 14),
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: !mobile,
        smoothScrolling: false,
        cursorBlinking: "blink",
        renderWhitespace: "none",
        lineNumbersMinChars: 3,
        glyphMargin: false,
        padding: { top: 6, bottom: 14 },
        tabSize: 2,
        wordWrap: mobile ? "on" : "off",
        quickSuggestions: { other: true, comments: false, strings: true },
        suggestOnTriggerCharacters: true,
        inlineSuggest: { enabled: true },
        wordBasedSuggestions: "currentDocument",
        contextmenu: false,
        fixedOverflowWidgets: true,
      }}
    />
    {contextMenu && createPortal(
      <div className="fixed inset-0 z-100" onMouseDown={() => setContextMenu(null)}>
        <div
          className="absolute w-[300px] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-2xl border border-border-button-default bg-background-primary-default p-1.5 shadow-dropdown"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <EditorContextAction label="Go to Type Definition" onClick={() => runContextAction("toph.go-type-definition")} />
          <EditorContextAction label="Go to Source Definition" onClick={() => runContextAction("toph.go-source-definition")} />
          <EditorContextAction label="Find All References" onClick={() => runContextAction("toph.find-all-references")} />
          <EditorContextAction label="Open Changes" onClick={() => runContextAction("toph.open-changes")} />
          <EditorContextAction label="File History" onClick={() => runContextAction("toph.file-history")} />
          <EditorContextSeparator />
          <EditorContextAction label="Change All Occurrences" shortcut="Ctrl+F2" onClick={() => triggerContextAction("editor.action.changeAll")} />
          <EditorContextAction label="Explain" onClick={() => runContextAction("toph.explain")} />
          <EditorContextAction label="Review" onClick={() => runContextAction("toph.review")} />
          <EditorContextSeparator />
          <EditorContextAction label="Cut" shortcut="Ctrl+X" onClick={() => triggerContextAction("editor.action.clipboardCutAction")} />
          <EditorContextAction label="Copy" shortcut="Ctrl+C" onClick={() => triggerContextAction("editor.action.clipboardCopyAction")} />
          <EditorContextAction label="Paste" shortcut="Ctrl+V" onClick={() => triggerContextAction("editor.action.clipboardPasteAction")} />
          <EditorContextAction label="Open Remote (Web)" onClick={() => runContextAction("toph.open-remote")} disabled={!projectId} />
          <EditorContextAction label="Copy As" onClick={() => runContextAction("toph.copy-as")} />
          <EditorContextAction label="Copy Path" onClick={() => runContextAction("toph.copy-path")} />
          <EditorContextAction label="Copy Relative Path" onClick={() => runContextAction("toph.copy-relative-path")} />
          <EditorContextSeparator />
          <EditorContextAction label="Command Palette" shortcut="F1" onClick={() => triggerContextAction("editor.action.quickCommand")} />
        </div>
      </div>,
      document.body,
    )}
    {aiDialog && (
      <Modal isOpen onClose={() => setAiDialog(null)} title={aiDialog.title} description="Resposta da IA." size="lg">
        {aiDialog.busy && <p className="py-6 text-center text-body-regular text-text-secondary">Consultando IA...</p>}
        {aiDialog.error && <p className="rounded-lg bg-status-rose-background px-3 py-2 text-caption-1-regular text-status-rose-text">{aiDialog.error}</p>}
        {aiDialog.text && <pre className="whitespace-pre-wrap break-words text-body-regular text-text-primary">{aiDialog.text}</pre>}
      </Modal>
    )}
    {historyDialog && (
      <Modal isOpen onClose={() => setHistoryDialog(null)} title={historyDialog.title} description="Histórico de commits." size="lg">
          {!historyDialog.entries && !historyDialog.error && <p className="py-6 text-center text-body-regular text-text-secondary">Carregando histórico...</p>}
          {historyDialog.error && <p className="rounded-lg bg-status-rose-background px-3 py-2 text-caption-1-regular text-status-rose-text">{historyDialog.error}</p>}
          {historyDialog.entries?.length === 0 && <p className="py-6 text-center text-body-regular text-text-secondary">Sem commits.</p>}
          <div className="flex flex-col gap-1">
            {historyDialog.entries?.map((entry) => (
              <div className="flex flex-col gap-1 rounded-lg border px-3 py-2" key={entry.hash}>
                <div className="flex items-center gap-2"><code className="rounded bg-muted px-1 text-[11px]">{entry.hash.slice(0, 8)}</code><span className="truncate text-xs font-medium">{entry.subject}</span></div>
                <small className="text-[11px] text-muted-foreground">{entry.author} · {new Date(entry.date).toLocaleString()}</small>
              </div>
            ))}
          </div>
      </Modal>
    )}
    </>
  );
}


function EditorContextAction({ label, shortcut, disabled, onClick }: { label: string; shortcut?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2 rounded-2lg px-2 py-1.5 text-start text-body-2-medium text-text-primary outline-none transition-colors hover:bg-dropdown-item-hover-background focus-visible:bg-dropdown-item-hover-background disabled:cursor-not-allowed disabled:opacity-45"
    >
      {label}
      {shortcut && <span className="ms-auto text-caption-2-regular text-text-tertiary">{shortcut}</span>}
    </button>
  );
}

function EditorContextSeparator() {
  return <div className="my-1 h-px bg-separator-border" />;
}
