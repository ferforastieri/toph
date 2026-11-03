import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Braces,
  Bug,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CornerDownRight,
  ListTree,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Square,
  StepForward,
  Trash2,
  Variable,
  X,
} from "@toph/icons";
import { api, getApiBase, type DebugBreakpoint, type DebugSessionInfo, type FileContent, type Project } from "../api";
import { useAI } from "../ai";
import { useDebug } from "../debug";
import { useApp } from "../store";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";
import { Select, SelectItem } from "@/boardui/base/select/select";
import { Textarea, TextareaBase } from "@/boardui/base/textarea/textarea";
import { Modal } from "@/boardui/base/modal/modal";
import { Badge } from "@/boardui/base/badges/badge";
import { cx } from "@/boardui/utils/cx";
import CodeEditor from "../components/CodeEditor";
import { languageFor } from "../lib";

interface Props {
  project: Project;
  mobile?: boolean;
}

interface CdpFrame {
  id: string;
  functionName: string;
  url: string;
  scriptId: string;
  line: number;
  column: number;
  scopeChain: Array<{ type: string; object: { objectId?: string } }>;
}

interface DebugScope {
  name: string;
  variables: Array<{ name: string; value: string; type: string }>;
}

interface WatchResult {
  expression: string;
  value: string;
  error?: string;
}

interface ChatLine {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
}


function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function relativePath(projectRoot: string, url: string): string {
  let path = url;
  try {
    if (path.startsWith("file://")) path = decodeURIComponent(new URL(path).pathname);
  } catch {
    // Keep the raw value.
  }
  const root = projectRoot.replace(/\/+$/, "");
  if (path.startsWith(root + "/")) return path.slice(root.length + 1);
  return path;
}

function fileUrl(projectRoot: string, path: string): string {
  const absolute = path.startsWith("/") ? path : `${projectRoot.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  return `file://${encodeURI(absolute).replace(/#/g, "%23")}`;
}

function valueText(value: unknown): string {
  if (!value || typeof value !== "object") return String(value ?? "undefined");
  const item = value as { value?: unknown; description?: string; type?: string; unserializableValue?: string };
  if (item.unserializableValue) return item.unserializableValue;
  if (item.value !== undefined) return typeof item.value === "string" ? `"${item.value}"` : String(item.value);
  return item.description ?? item.type ?? "undefined";
}

class CdpClient {
  private socket: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private handlers = new Set<(message: Record<string, unknown>) => void>();

  constructor(url: string) {
    this.socket = new WebSocket(url);
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.onopen = () => resolve();
      this.socket.onerror = () => reject(new Error("Falha ao conectar ao inspector."));
    });
  }

  bind() {
    this.socket.onmessage = (event) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      const messageId = typeof message.id === "number" ? message.id : null;
      if (messageId) {
        const request = this.pending.get(messageId);
        if (request) {
          this.pending.delete(messageId);
          if (message.error) request.reject(new Error((message.error as { message?: string }).message ?? "Erro do debugger."));
          else request.resolve(message.result);
        }
        return;
      }
      for (const handler of this.handlers) handler(message);
    };
    this.socket.onclose = () => {
      for (const request of this.pending.values()) request.reject(new Error("Sessão de debug encerrada."));
      this.pending.clear();
    };
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Debugger desconectado."));
    const requestId = this.nextId++;
    this.socket.send(JSON.stringify({ id: requestId, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      window.setTimeout(() => {
        if (this.pending.delete(requestId)) reject(new Error(`Timeout em ${method}.`));
      }, 15_000);
    });
  }

  on(handler: (message: Record<string, unknown>) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close() {
    try {
      this.socket.close();
    } catch {
      // Already closed.
    }
    this.handlers.clear();
    this.pending.clear();
  }
}

export default function DebugPanel({ project, mobile = false }: Props) {
  const notify = useApp((state) => state.notify);
  const config = useDebug((state) => state.byProject[project.id]);
  const loadConfig = useDebug((state) => state.load);
  const setConfig = useDebug((state) => state.setConfig);
  const addBreakpoint = useDebug((state) => state.addBreakpoint);
  const updateBreakpoint = useDebug((state) => state.updateBreakpoint);
  const removeBreakpoint = useDebug((state) => state.removeBreakpoint);
  const toggleBreakpoint = useDebug((state) => state.toggleBreakpoint);
  const addWatch = useDebug((state) => state.addWatch);
  const removeWatch = useDebug((state) => state.removeWatch);
  const setLocation = useDebug((state) => state.setLocation);
  const loadAI = useAI((state) => state.load);

  const [session, setSession] = useState<DebugSessionInfo | null>(null);
  const [starting, setStarting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [callFrames, setCallFrames] = useState<CdpFrame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [scopes, setScopes] = useState<DebugScope[]>([]);
  const [watchResults, setWatchResults] = useState<WatchResult[]>([]);
  const [consoleLines, setConsoleLines] = useState<Array<{ id: string; kind: string; text: string }>>([]);
  const [consoleInput, setConsoleInput] = useState("");
  const [watchesOpen, setWatchesOpen] = useState(false);
  const [newWatch, setNewWatch] = useState("");
  const [statusError, setStatusError] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [filesOpen, setFilesOpen] = useState(false);
  const [fileQuery, setFileQuery] = useState("");
  const [currentPath, setCurrentPath] = useState("");
  const [file, setFile] = useState<FileContent | null>(null);
  const [fileDirty, setFileDirty] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const [breakpointEditing, setBreakpointEditing] = useState<DebugBreakpoint | null>(null);
  const [breakpointDraft, setBreakpointDraft] = useState({ condition: "", logMessage: "" });
  const [intakeOpen, setIntakeOpen] = useState(false);
  const cdpRef = useRef<CdpClient | null>(null);
  const pySocketRef = useRef<WebSocket | null>(null);
  const selectedFrameRef = useRef(0);
  const currentPathRef = useRef("");
  const projectRootRef = useRef(project.root);
  const cdpHandlerRef = useRef<(() => void) | null>(null);
  const breakpointsSentRef = useRef<Map<string, string>>(new Map());
  const scriptUrlsRef = useRef<Map<string, string>>(new Map());
  const pythonWhereSentRef = useRef(false);
  const fileRef = useRef<FileContent | null>(null);
  const dirtyRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<DebugSessionInfo | null>(null);
  const mountedRef = useRef(true);

  const bug = config?.bug ?? "";
  const reproduction = config?.reproduction ?? "";
  const agentReady = Boolean(bug.trim() && reproduction.trim());
  const breakpoints = config?.breakpoints ?? [];
  const language = config?.language ?? "node";
  const mode = config?.mode ?? "launch";

  useEffect(() => {
    void loadConfig(project.id);
    void loadAI();
    void api.files(project.id).then((items) => setFiles(items.sort((a, b) => a.localeCompare(b)))).catch(() => undefined);
  }, [project.id, loadConfig, loadAI]);

  useEffect(() => {
    projectRootRef.current = project.root;
  }, [project.root]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    fileRef.current = file;
  }, [file]);

  useEffect(() => {
    dirtyRef.current = fileDirty;
  }, [fileDirty]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatLines.length, chatBusy]);

  const appendConsole = useCallback((kind: string, text: string) => {
    setConsoleLines((current) => [...current.slice(-499), { id: id("log"), kind, text }]);
  }, []);

  const showStatus = useCallback((message: string) => {
    setStatusError(message);
    if (message) notify("error", message);
  }, [notify]);

  const openFile = useCallback(async (path: string, line?: number) => {
    if (!path) return;
    if (dirtyRef.current && currentPathRef.current && currentPathRef.current !== path) {
      const content = fileRef.current?.content;
      if (content !== undefined) {
        await api.saveFile(project.id, currentPathRef.current, content, fileRef.current?.hash ?? "").catch(() => undefined);
      }
    }
    try {
      const value = await api.file(project.id, path);
      setFile(value);
      setCurrentPath(path);
      currentPathRef.current = path;
      setFileDirty(false);
      if (line && line > 0) setCursorLine(line);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Não foi possível abrir o arquivo.");
    }
  }, [project.id, showStatus]);

  const saveFile = useCallback(async () => {
    const current = fileRef.current;
    if (!currentPathRef.current || !current) return;
    try {
      const saved = await api.saveFile(project.id, currentPathRef.current, current.content, current.hash);
      setFile((value) => value ? { ...value, hash: saved.hash, modTime: saved.modTime } : value);
      setFileDirty(false);
      notify("success", "Arquivo salvo.");
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  }, [notify, project.id, showStatus]);

  const syncNodeBreakpoints = useCallback(async () => {
    const cdp = cdpRef.current;
    if (!cdp) return;
    const sent = breakpointsSentRef.current;
    for (const breakpointId of sent.values()) {
      await cdp.send("Debugger.removeBreakpoint", { breakpointId }).catch(() => undefined);
    }
    sent.clear();
    const currentBreakpoints = (useDebug.getState().byProject[project.id]?.breakpoints ?? [])
      .filter((item) => !item.path.toLowerCase().endsWith(".py"));
    for (const breakpoint of currentBreakpoints) {
      if (breakpoint.enabled === false) continue;
      const condition = breakpoint.logMessage
        ? `console.log(${JSON.stringify(breakpoint.logMessage)}), false`
        : breakpoint.condition || undefined;
      try {
        const result = await cdp.send("Debugger.setBreakpointByUrl", {
          lineNumber: Math.max(0, breakpoint.line - 1),
          url: fileUrl(project.root, breakpoint.path),
          condition,
        }) as { breakpointId?: string };
        if (result?.breakpointId) sent.set(breakpoint.id, result.breakpointId);
      } catch {
        // The editor may contain a file that has not been loaded by the runtime yet.
      }
    }
  }, [project.id, project.root]);

  const pythonBreakpoints = useCallback(() => {
    const socket = pySocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const sent = breakpointsSentRef.current;
    const currentBreakpoints = (useDebug.getState().byProject[project.id]?.breakpoints ?? [])
      .filter((item) => item.path.toLowerCase().endsWith(".py"));
    for (const [breakpointId, command] of sent.entries()) {
      if (!currentBreakpoints.some((item) => item.id === breakpointId && item.enabled !== false)) {
        const match = command.match(/^break (.+?):(\d+)/);
        socket.send(JSON.stringify({ command: match ? `clear ${match[1]}:${match[2]}` : command }));
        sent.delete(breakpointId);
      }
    }
    for (const breakpoint of currentBreakpoints) {
      if (breakpoint.enabled === false || sent.has(breakpoint.id)) continue;
      const path = breakpoint.path.startsWith("/") ? breakpoint.path : `${project.root.replace(/\/+$/, "")}/${breakpoint.path}`;
      const suffix = breakpoint.condition ? `, ${breakpoint.condition}` : "";
      const command = `break ${path}:${breakpoint.line}${suffix}`;
      socket.send(JSON.stringify({ command }));
      sent.set(breakpoint.id, command);
      if (breakpoint.logMessage) {
        socket.send(JSON.stringify({ command: "commands" }));
        socket.send(JSON.stringify({ command: "silent" }));
        socket.send(JSON.stringify({ command: `print(${JSON.stringify(breakpoint.logMessage)})` }));
        socket.send(JSON.stringify({ command: "continue" }));
        socket.send(JSON.stringify({ command: "end" }));
      }
    }
  }, [project.id, project.root]);

  const fetchFrame = useCallback(async (frame: CdpFrame) => {
    const cdp = cdpRef.current;
    if (!cdp) return;
    const values = await Promise.all(frame.scopeChain.map(async (scope) => {
      if (!scope.object.objectId) return { name: scope.type, variables: [] };
      try {
        const result = await cdp.send("Runtime.getProperties", {
          objectId: scope.object.objectId,
          ownProperties: true,
          generatePreview: false,
        }) as { result?: Array<{ name: string; value?: unknown }> };
        return {
          name: scope.type,
          variables: (result.result ?? [])
            .filter((item) => item.name !== "this" || scope.type === "local")
            .slice(0, 120)
            .map((item) => {
              const value = item.value as { type?: string } | undefined;
              return { name: item.name, value: valueText(item.value), type: value?.type ?? "" };
            }),
        };
      } catch {
        return { name: scope.type, variables: [] };
      }
    }));
    setScopes(values);
    const current = useDebug.getState().byProject[project.id];
    if (current?.watches.length) {
      const results = await Promise.all(current.watches.map(async (expression) => {
        try {
          const result = await cdp.send("Debugger.evaluateOnCallFrame", {
            callFrameId: frame.id,
            expression,
            returnByValue: false,
          }) as { result?: unknown; exceptionDetails?: { text?: string } };
          return { expression, value: result.exceptionDetails ? "Erro" : valueText(result.result) };
        } catch (error) {
          return { expression, value: "", error: error instanceof Error ? error.message : "Erro" };
        }
      }));
      setWatchResults(results);
    } else {
      setWatchResults([]);
    }
  }, [project.id]);

  const handlePaused = useCallback(async (params: Record<string, unknown>) => {
    const rawFrames = Array.isArray(params.callFrames) ? params.callFrames as Array<Record<string, unknown>> : [];
    const frames: CdpFrame[] = rawFrames.map((frame) => ({
      id: String(frame.callFrameId ?? ""),
      functionName: String(frame.functionName ?? "(anonymous)"),
      url: String((frame.url as string | undefined) || scriptUrlsRef.current.get(String((frame.location as { scriptId?: string } | undefined)?.scriptId ?? "")) || ""),
      scriptId: String((frame.location as { scriptId?: string } | undefined)?.scriptId ?? ""),
      line: Number((frame.location as { lineNumber?: number } | undefined)?.lineNumber ?? 0) + 1,
      column: Number((frame.location as { columnNumber?: number } | undefined)?.columnNumber ?? 0) + 1,
      scopeChain: Array.isArray(frame.scopeChain) ? frame.scopeChain as CdpFrame["scopeChain"] : [],
    }));
    const hitBreakpoints = Array.isArray(params.hitBreakpoints) ? params.hitBreakpoints.length : 0;
    if (String(params.reason ?? "") === "Break on start" && hitBreakpoints === 0 && cdpRef.current) {
      await cdpRef.current.send("Debugger.resume").catch(() => undefined);
      return;
    }
    setPaused(true);
    setCallFrames(frames);
    setSelectedFrame(0);
    selectedFrameRef.current = 0;
    if (frames[0]) {
      const path = relativePath(projectRootRef.current, frames[0].url);
      setLocation(project.id, { path, line: frames[0].line });
      if (path && path !== currentPathRef.current) void openFile(path, frames[0].line);
      else setCursorLine(frames[0].line);
      void fetchFrame(frames[0]);
    }
    appendConsole("paused", `Pausado em ${frames[0]?.functionName || "código"} (${frames[0]?.line || "?"}).`);
    if (params.reason) appendConsole("muted", `Motivo: ${String(params.reason)}`);
  }, [appendConsole, fetchFrame, openFile, project.id, setLocation]);

  useEffect(() => {
    if (session?.language === "node" && cdpRef.current && connected) {
      void syncNodeBreakpoints();
    }
  }, [session?.language, connected, syncNodeBreakpoints]);

  useEffect(() => {
    if (session?.language === "python") pythonBreakpoints();
  }, [session?.language, pythonBreakpoints]);

  const connectNode = useCallback(async (active: DebugSessionInfo) => {
    sessionRef.current = active;
    cdpRef.current?.close();
    const cdp = new CdpClient(api.debugSocketUrl(project.id));
    cdpRef.current = cdp;
    await cdp.open();
    if (!mountedRef.current) {
      cdp.close();
      return;
    }
    cdp.bind();
    const unbind = cdp.on((message) => {
      const method = message.method;
      if (method === "Debugger.scriptParsed") {
        const params = (message.params ?? {}) as { scriptId?: string; url?: string };
        if (params.scriptId && params.url) scriptUrlsRef.current.set(params.scriptId, params.url);
      }
      if (method === "Debugger.paused") void handlePaused((message.params ?? {}) as Record<string, unknown>);
      if (method === "Debugger.resumed") {
        setPaused(false);
        setCallFrames([]);
        setScopes([]);
        setLocation(project.id, null);
      }
      if (method === "Runtime.consoleAPICalled") {
        const params = (message.params ?? {}) as { type?: string; args?: unknown[] };
        appendConsole(params.type ?? "log", (params.args ?? []).map(valueText).join(" "));
      }
      if (method === "Runtime.exceptionThrown") {
        const details = ((message.params ?? {}) as { exceptionDetails?: { text?: string; exception?: unknown } }).exceptionDetails;
        appendConsole("error", `${details?.text ?? "Exceção"} ${details?.exception ? valueText(details.exception) : ""}`.trim());
      }
      if (method === "Debugger.breakpointResolved") {
        const params = (message.params ?? {}) as { breakpointId?: string };
        appendConsole("muted", `Breakpoint resolvido: ${params.breakpointId ?? ""}`);
      }
    });
    cdpHandlerRef.current = unbind;
    await cdp.send("Runtime.enable");
    await cdp.send("Debugger.enable");
    await cdp.send("Debugger.setPauseOnExceptions", { state: config?.pauseOnExceptions ?? "uncaught" });
    setConnected(true);
    setSession(active);
    breakpointsSentRef.current.clear();
    await syncNodeBreakpoints();
    if (active.mode === "launch") await cdp.send("Runtime.runIfWaitingForDebugger").catch(() => undefined);
    appendConsole("muted", active.mode === "attach" ? `Anexado em ${active.address}.` : "Sessão Node iniciada.");
  }, [appendConsole, config?.pauseOnExceptions, handlePaused, project.id, setLocation, syncNodeBreakpoints]);

  const connectPython = useCallback((active: DebugSessionInfo) => {
    if (!mountedRef.current) return;
    sessionRef.current = active;
    breakpointsSentRef.current.clear();
    const socket = new WebSocket(api.debugSocketUrl(project.id));
    pySocketRef.current = socket;
    socket.onopen = () => {
      setConnected(true);
      setSession(active);
      setPaused(true);
      pythonWhereSentRef.current = false;
      appendConsole("muted", "pdb iniciado. Use os controles ou o console.");
      pythonBreakpoints();
    };
    socket.onmessage = (event) => {
      const text = typeof event.data === "string" ? event.data : "";
      if (!text) return;
      setConsoleLines((current) => [
        ...current.slice(-499),
        ...text.split(/\r?\n/).filter(Boolean).map((line) => ({ id: id("py"), kind: "log", text: line })),
      ]);
      if (text.includes("(Pdb)")) {
        setPaused(true);
        if (!pythonWhereSentRef.current) {
          pythonWhereSentRef.current = true;
          socket.send(JSON.stringify({ command: "where" }));
          socket.send(JSON.stringify({ command: "p locals()" }));
        }
      }
      const frames = [...text.matchAll(/^> (.+?)\((\d+)\)/gm)].map((match) => {
        const path = relativePath(projectRootRef.current, match[1]);
        return { path, line: Number(match[2]) };
      });
      if (frames[0]) {
        setLocation(project.id, frames[0]);
        setPaused(true);
        if (frames[0].path !== currentPathRef.current) void openFile(frames[0].path, frames[0].line);
      }
    };
    socket.onclose = () => {
      setConnected(false);
      setPaused(false);
      appendConsole("muted", "Sessão Python encerrada.");
    };
    socket.onerror = () => appendConsole("error", "Erro no websocket do debugger Python.");
  }, [appendConsole, openFile, project.id, pythonBreakpoints, setLocation]);

  const start = useCallback(async () => {
    setStatusError("");
    if (!bug.trim() || !reproduction.trim()) {
      setIntakeOpen(true);
      appendConsole("muted", "Debug Toph: informe o bug e a reprodução antes de iniciar.");
      return;
    }
    if (!currentPathRef.current) {
      setFilesOpen(true);
      showStatus("Abra um arquivo e clique na gutter para definir o primeiro breakpoint.");
      return;
    }
    if (!breakpoints.length) {
      addBreakpoint(project.id, currentPathRef.current, cursorLine);
      appendConsole("muted", `Breakpoint automático em ${currentPathRef.current}:${cursorLine}.`);
    }
    if (fileDirty) await saveFile();
    setStarting(true);
    try {
      const next = await api.debugStart(project.id, {
        language,
        mode,
        command: config?.command ?? "",
        address: config?.address ?? "",
        cwd: config?.cwd ?? "",
      });
      if (!mountedRef.current) {
        await api.debugStop(project.id).catch(() => undefined);
        return;
      }
      sessionRef.current = next;
      setSession(next);
      if (next.language === "node") await connectNode(next);
      else connectPython(next);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Não foi possível iniciar o debugger.");
    } finally {
      setStarting(false);
    }
  }, [addBreakpoint, appendConsole, breakpoints.length, bug, config?.address, config?.command, config?.cwd, connectNode, connectPython, cursorLine, fileDirty, language, mode, project.id, reproduction, saveFile, showStatus]);

  const stop = useCallback(async () => {
    cdpHandlerRef.current?.();
    cdpHandlerRef.current = null;
    cdpRef.current?.close();
    cdpRef.current = null;
    pySocketRef.current?.close();
    pySocketRef.current = null;
    setConnected(false);
    setPaused(false);
    setCallFrames([]);
    setScopes([]);
    setWatchResults([]);
    setLocation(project.id, null);
    await api.debugStop(project.id).catch(() => undefined);
    sessionRef.current = null;
    setSession(null);
    setConsoleLines((current) => [...current, { id: id("log"), kind: "muted", text: "Sessão encerrada." }]);
  }, [project.id, setLocation]);

  const togglePause = useCallback(async () => {
    if (session?.language === "python") {
      const socket = pySocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        pythonWhereSentRef.current = false;
        socket.send(JSON.stringify({ command: "continue" }));
        setPaused(false);
      }
      return;
    }
    if (session?.language !== "node" || !cdpRef.current) return;
    if (paused) await cdpRef.current.send("Debugger.resume");
    else await cdpRef.current.send("Debugger.pause");
  }, [paused, session?.language]);

  const step = useCallback(async (method: "Debugger.stepOver" | "Debugger.stepInto" | "Debugger.stepOut") => {
    if (session?.language === "python") {
      const socket = pySocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        pythonWhereSentRef.current = false;
        socket.send(JSON.stringify({ command: method === "Debugger.stepOver" ? "next" : method === "Debugger.stepInto" ? "step" : "return" }));
        setPaused(false);
      }
      return;
    }
    if (!cdpRef.current) return;
    await cdpRef.current.send(method);
  }, [session?.language]);

  const selectFrame = useCallback(async (index: number) => {
    const frame = callFrames[index];
    if (!frame) return;
    setSelectedFrame(index);
    selectedFrameRef.current = index;
    await fetchFrame(frame);
  }, [callFrames, fetchFrame]);

  const evaluate = useCallback(async (expression: string) => {
    if (!expression.trim()) return;
    appendConsole("input", `> ${expression}`);
    setConsoleInput("");
    if (session?.language === "python") {
      const socket = pySocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ command: `p ${expression}` }));
      return;
    }
    const cdp = cdpRef.current;
    if (!cdp) return;
    try {
      const frame = callFrames[selectedFrameRef.current];
      const result = paused && frame
        ? await cdp.send("Debugger.evaluateOnCallFrame", { callFrameId: frame.id, expression, returnByValue: false })
        : await cdp.send("Runtime.evaluate", { expression, returnByValue: false, awaitPromise: true });
      const parsed = result as { result?: unknown; exceptionDetails?: { text?: string } };
      if (parsed.exceptionDetails) appendConsole("error", parsed.exceptionDetails.text ?? "Exceção");
      else appendConsole("result", valueText(parsed.result));
    } catch (error) {
      appendConsole("error", error instanceof Error ? error.message : "Falha ao avaliar.");
    }
  }, [appendConsole, callFrames, paused, session?.language]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const active = await api.debugSession(project.id);
        if (cancelled || !mountedRef.current || !active) return;
        setSession(active);
        if (active.language === "node") await connectNode(active);
        else connectPython(active);
      } catch {
        // No active session.
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  useEffect(() => {
    mountedRef.current = true;
    const release = () => {
      if (!sessionRef.current) return;
      try {
        const csrf = document.cookie.match(/(?:^|;\s*)toph_csrf=([^;]+)/)?.[1] ?? "";
        const base = (getApiBase() || window.location.origin).replace(/\/+$/, "");
        void fetch(`${base}/api/projects/${encodeURIComponent(project.id)}/debug/release`, {
          method: "POST",
          keepalive: true,
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Toph-CSRF": decodeURIComponent(csrf) },
          body: "{}",
        });
      } catch {
        // Best effort.
      }
    };
    window.addEventListener("pagehide", release);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", release);
      release();
      cdpHandlerRef.current?.();
      cdpRef.current?.close();
      pySocketRef.current?.close();
      if (sessionRef.current) void api.debugStop(project.id).catch(() => undefined);
    };
  }, [project.id]);

  useEffect(() => {
    if (config && session?.language === "node" && cdpRef.current && connected) {
      void cdpRef.current.send("Debugger.setPauseOnExceptions", { state: config.pauseOnExceptions }).catch(() => undefined);
    }
  }, [config?.pauseOnExceptions, connected, session?.language]);

  useEffect(() => {
    if (paused && callFrames[selectedFrame] && session?.language === "node" && cdpRef.current) {
      void fetchFrame(callFrames[selectedFrame]);
    }
  }, [callFrames, fetchFrame, paused, selectedFrame, session?.language]);

  useEffect(() => {
    if (paused && callFrames[selectedFrame] && session?.language === "node" && cdpRef.current) {
      void fetchFrame(callFrames[selectedFrame]);
    }
  }, [config?.watches.length]);

  const filteredFiles = useMemo(() => {
    const query = fileQuery.trim().toLowerCase();
    const source = query ? files.filter((path) => path.toLowerCase().includes(query)) : files;
    return source.slice(0, 300);
  }, [fileQuery, files]);

  const currentBreakpoints = breakpoints.filter((item) => item.path === currentPath);
  const debugLine = useDebug((state) => state.locations[project.id]?.path === currentPath ? state.locations[project.id]?.line : undefined);

  function openBreakpointEditor(breakpoint: DebugBreakpoint) {
    setBreakpointEditing(breakpoint);
    setBreakpointDraft({ condition: breakpoint.condition ?? "", logMessage: breakpoint.logMessage ?? "" });
  }

  function saveBreakpointEditor() {
    if (!breakpointEditing) return;
    updateBreakpoint(project.id, breakpointEditing.id, {
      condition: breakpointDraft.condition.trim(),
      logMessage: breakpointDraft.logMessage.trim(),
    });
    setBreakpointEditing(null);
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatInput("");
    setChatLines((current) => [...current, { id: id("u"), role: "user", text }]);
    if (!bug.trim() || !reproduction.trim()) {
      setIntakeOpen(true);
      setChatLines((current) => [...current, {
        id: id("a"),
        role: "assistant",
        text: "Antes de mexer no código: qual é o bug e como eu reproduzo ele? Preencha os dois campos acima e eu continuo.",
      }]);
      return;
    }
    if (!breakpoints.length) {
      const path = currentPathRef.current;
      if (path) addBreakpoint(project.id, path, cursorLine);
    }
    setChatBusy(true);
    try {
      const active = useAI.getState().config;
      const code = file?.content ?? "";
      const context = [
        `Projeto: ${project.name} (${project.root})`,
        `Arquivo aberto: ${currentPath || "(nenhum)"}`,
        `Linha: ${cursorLine}`,
        `Bug: ${bug}`,
        `Reprodução: ${reproduction}`,
        `Breakpoints: ${breakpoints.map((item) => `${item.path}:${item.line}${item.condition ? ` [${item.condition}]` : ""}`).join(", ") || "nenhum ainda"}`,
        `Pausado: ${paused ? `sim, em ${callFrames[selectedFrame]?.functionName ?? "?"} linha ${callFrames[selectedFrame]?.line ?? "?"}` : "não"}`,
        code ? `Código atual (${currentPath}):\n\`\`\`\n${code.slice(0, 12_000)}\n\`\`\`` : "",
      ].filter(Boolean).join("\n\n");
      const messages = [
        {
          role: "system" as const,
          content: "Você é Debug Toph, um engenheiro de software direto e curioso. Sempre exija uma descrição do bug e passos de reprodução antes de propor uma correção. Sempre garanta pelo menos um breakpoint para investigar. Use o debugger e o console. YOLO não autoriza escrita no banco: peça aprovação antes de qualquer INSERT, UPDATE, DELETE ou migração. Responda no idioma do usuário, em português quando ele escrever em português, de forma curta e prática.",
        },
        {
          role: "user" as const,
          content: `Contexto da sessão de debug:\n\n${context}\n\nMensagem do usuário: ${text}`,
        },
      ];
      const result = await api.aiChat(messages, { model: active?.model, yolo: true });
      setChatLines((current) => [...current, { id: id("a"), role: "assistant", text: result.text || "(sem resposta)" }]);
    } catch (error) {
      setChatLines((current) => [...current, {
        id: id("a"),
        role: "assistant",
        text: error instanceof Error ? `Não consegui falar com o modelo: ${error.message}` : "Não consegui falar com o modelo.",
      }]);
    } finally {
      setChatBusy(false);
    }
  }

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center text-caption-1-regular text-text-secondary">
        Carregando debug...
      </div>
    );
  }

  const debugSide = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-separator-border px-2 py-1.5">
        <span className="flex items-center gap-1.5 text-caption-1-medium text-text-primary"><Bug className="size-3.5 text-accent-500" /> Debug Toph</span>
        <span className="ms-auto flex items-center gap-1.5">
          <span className={cx("size-2 rounded-full", connected ? (paused ? "bg-status-yellow-text" : "bg-status-lime-text") : "bg-text-tertiary")} />
          <span className="text-caption-2-regular text-text-tertiary">{connected ? (paused ? "pausado" : "rodando") : "parado"}</span>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-separator-border">
          <div className="px-2 pt-2 text-caption-2-semibold uppercase tracking-[0.14em] text-text-tertiary">Agente</div>
                  <div className="flex min-h-0 flex-col">
          <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-separator-border p-2">
            <div className="mb-1.5 flex items-center justify-between gap-1">
              <span className="text-caption-2-semibold uppercase tracking-[0.12em] text-text-tertiary">Debug Toph</span>
              <Badge color="neutral" className={bug && reproduction ? "text-status-lime-text" : "text-status-yellow-text"}>{bug && reproduction ? "contexto ok" : "bug + reprodução"}</Badge>
            </div>
            <label className="mb-1 block text-caption-2-regular text-text-tertiary">Qual é o bug?</label>
            <Textarea
              value={bug}
              onChange={(value) => setConfig(project.id, { bug: value })}
              placeholder="Descreva o comportamento errado..."
              rows={2}
              resize="none"
              fieldClassName="mb-1.5 min-h-14"
            />
            <label className="mb-1 block text-caption-2-regular text-text-tertiary">Como reproduzir?</label>
            <Textarea
              value={reproduction}
              onChange={(value) => setConfig(project.id, { reproduction: value })}
              placeholder="Passos, comando, URL, entrada..."
              rows={2}
              resize="none"
              fieldClassName="min-h-14"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {chatLines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border-button-default p-3 text-caption-1-regular text-text-secondary">
                <p className="mb-1 font-medium text-text-primary">Debug Toph</p>
                <p>Eu sempre começo pelo bug e pela reprodução. Depois olho o código, garanto um breakpoint e conduzo a investigação com você.</p>
              </div>
            ) : chatLines.map((line) => (
              <div key={line.id} className={cx("mb-2 rounded-xl px-2.5 py-2 text-caption-1-regular whitespace-pre-wrap break-words", line.role === "user" ? "ms-5 bg-accent-500/10 text-text-primary" : "me-2 bg-background-secondary-default text-text-secondary")}>{line.text}</div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex shrink-0 items-end gap-1.5 border-t border-separator-border p-2">
            <TextareaBase
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Pergunte ao Debug Toph..."
              rows={2}
              autoResize
              maxRows={5}
              resize="none"
              fieldClassName="min-h-9 min-w-0 flex-1"
              className="text-caption-1-regular"
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendChat(); } }}
            />
            <Button variant="primary" size="small" iconOnly leadingIcon={chatBusy ? RefreshCw : Send} aria-label="Enviar" disabled={chatBusy || !chatInput.trim()} onClick={() => void sendChat()} className="size-9" />
          </div>
        </div>

        </div>
        <details className="group border-b border-separator-border">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-caption-2-semibold uppercase tracking-[0.14em] text-text-tertiary hover:bg-background-primary-hover">
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" /> Ferramentas de debug
          </summary>
                  <div className="min-h-0">
          <section className="border-b border-separator-border p-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Button variant="secondary" size="xs" iconOnly leadingIcon={paused ? Play : Pause} aria-label={paused ? "Continuar" : "Pausar"} onClick={() => void togglePause()} disabled={!agentReady || !connected || (session?.language === "python" && !paused)} className="size-7" />
              <Button variant="ghost" size="xs" iconOnly leadingIcon={StepOverIcon} aria-label="Step over" onClick={() => void step("Debugger.stepOver")} disabled={!agentReady || !paused} className="size-7" />
              <Button variant="ghost" size="xs" iconOnly leadingIcon={StepIntoIcon} aria-label="Step into" onClick={() => void step("Debugger.stepInto")} disabled={!agentReady || !paused} className="size-7" />
              <Button variant="ghost" size="xs" iconOnly leadingIcon={StepOutIcon} aria-label="Step out" onClick={() => void step("Debugger.stepOut")} disabled={!agentReady || !paused} className="size-7" />
              <Button variant="ghost" size="xs" iconOnly leadingIcon={Square} aria-label="Parar debug" onClick={() => void stop()} disabled={!agentReady || !session} className="ms-auto size-7 text-status-rose-text" />
            </div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-caption-2-regular text-text-tertiary">Exceções</span>
              <Select
                size="sm"
                aria-label="Pausar em exceções"
                selectedKey={config.pauseOnExceptions}
                onSelectionChange={(key) => setConfig(project.id, { pauseOnExceptions: String(key) as "none" | "uncaught" | "all" })}
                className="min-w-0 flex-1"
                triggerClassName="h-6 px-1.5 text-caption-2-regular"
              >
                <SelectItem id="none">não pausar</SelectItem>
                <SelectItem id="uncaught">não tratadas</SelectItem>
                <SelectItem id="all">todas</SelectItem>
              </Select>
            </div>
            <div className="flex items-center gap-2 text-caption-2-regular text-text-tertiary">
              <Badge color="neutral" className={paused ? "text-status-yellow-text" : connected ? "text-status-lime-text" : ""}>{paused ? "Pausado" : connected ? "Executando" : "Parado"}</Badge>
              {session?.address ? <span className="truncate">{session.address}</span> : null}
            </div>
          </section>
          <section className="border-b border-separator-border p-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-caption-2-semibold uppercase tracking-[0.12em] text-text-tertiary"><ListTree className="size-3.5" /> Call stack</div>
            {callFrames.length ? callFrames.slice(0, 30).map((frame, index) => (
              <button key={`${frame.id}-${index}`} type="button" className={cx("flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-start text-caption-1-regular", index === selectedFrame ? "bg-accent-500/10 text-text-primary" : "text-text-secondary hover:bg-background-primary-hover")} onClick={() => void selectFrame(index)}>
                <CornerDownRight className="size-3 shrink-0 text-text-tertiary" />
                <span className="min-w-0 flex-1 truncate">{frame.functionName || "(anonymous)"}</span>
                <span className="shrink-0 text-caption-2-regular text-text-tertiary">{relativePath(project.root, frame.url).split("/").pop()}:{frame.line}</span>
              </button>
            )) : <p className="text-caption-2-regular text-text-tertiary">{session?.language === "python" ? "pdb: use `where` no console para ver a stack." : "Nenhuma stack ativa."}</p>}
          </section>
          <section className="border-b border-separator-border p-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-caption-2-semibold uppercase tracking-[0.12em] text-text-tertiary"><Variable className="size-3.5" /> Variáveis</div>
            {scopes.length ? scopes.map((scope) => (
              <div key={scope.name} className="mb-2">
                <div className="mb-1 text-caption-2-medium text-text-secondary">{scope.name}</div>
                {scope.variables.length ? scope.variables.map((variable) => (
                  <div key={`${scope.name}-${variable.name}`} className="flex gap-2 rounded px-1 py-0.5 text-caption-2-regular">
                    <span className="shrink-0 text-accent-500">{variable.name}</span>
                    <span className="min-w-0 flex-1 truncate text-text-secondary" title={variable.value}>{variable.value}</span>
                  </div>
                )) : <p className="text-caption-2-regular text-text-tertiary">vazio</p>}
              </div>
            )) : <p className="text-caption-2-regular text-text-tertiary">{session?.language === "python" ? "pdb: `p locals()` no console." : "Pause em um breakpoint para ver variáveis."}</p>}
          </section>
          <section className="border-b border-separator-border p-2">
            <button type="button" className="mb-1.5 flex w-full items-center gap-1.5 text-caption-2-semibold uppercase tracking-[0.12em] text-text-tertiary" onClick={() => setWatchesOpen((value) => !value)}>
              {watchesOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              <CircleDot className="size-3.5" /> Watches
            </button>
            {watchesOpen ? (
              <div className="flex flex-col gap-1">
                {config.watches.map((watch, index) => (
                  <div key={`${watch}-${index}`} className="flex items-center gap-1.5 text-caption-2-regular">
                    <span className="min-w-0 flex-1 truncate text-accent-500">{watch}</span>
                    <span className="min-w-0 max-w-[45%] truncate text-text-secondary">{watchResults.find((item) => item.expression === watch)?.value ?? "—"}</span>
                    <button type="button" aria-label="Remover watch" onClick={() => removeWatch(project.id, index)} className="text-text-tertiary hover:text-status-rose-text"><X className="size-3" /></button>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <Input value={newWatch} onChange={setNewWatch} placeholder="expressão" fieldClassName="h-7 text-caption-1" onKeyDown={(event) => { if (event.key === "Enter") { addWatch(project.id, newWatch); setNewWatch(""); } }} />
                  <Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Adicionar watch" onClick={() => { addWatch(project.id, newWatch); setNewWatch(""); }} className="size-7" />
                </div>
              </div>
            ) : null}
          </section>
          <section className="p-2">
            <div className="mb-1 flex items-center gap-1.5 text-caption-2-semibold uppercase tracking-[0.12em] text-text-tertiary"><Braces className="size-3.5" /> Console / REPL</div>
            <div className="mb-1.5 max-h-64 min-h-24 overflow-y-auto rounded-lg border border-separator-border bg-background-secondary-default p-1.5 font-mono text-[10.5px] leading-relaxed">
              {consoleLines.length ? consoleLines.map((line) => (
                <div key={line.id} className={cx("whitespace-pre-wrap break-words", line.kind === "error" ? "text-status-rose-text" : line.kind === "input" ? "text-accent-500" : line.kind === "result" ? "text-status-lime-text" : line.kind === "paused" ? "text-status-yellow-text" : "text-text-secondary")}>{line.text}</div>
              )) : <span className="text-text-tertiary">Console vazio.</span>}
            </div>
            <div className="flex items-center gap-1">
              <Input value={consoleInput} onChange={setConsoleInput} placeholder="$ expressão" fieldClassName="h-7 font-mono text-caption-1" onKeyDown={(event) => { if (event.key === "Enter") void evaluate(consoleInput); }} />
              <Button variant="ghost" size="xs" iconOnly leadingIcon={CornerDownRight} aria-label="Executar" onClick={() => void evaluate(consoleInput)} className="size-7" />
            </div>
          </section>
        </div>

        </details>
      </div>
    </div>
  );

  const editorPane = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background-primary-default">
      <div className="flex shrink-0 items-center gap-2 border-b border-separator-border px-2 py-1.5">
        <Button variant="ghost" size="xs" iconOnly leadingIcon={ListTree} aria-label="Arquivos" title="Arquivos" onClick={() => setFilesOpen(true)} />
        <span className="min-w-0 flex-1 truncate font-mono text-caption-1-regular text-text-secondary">{currentPath || "Abra um arquivo"}</span>
        {currentPath && currentBreakpoints.length ? <span className="flex items-center gap-1 text-caption-2-regular text-status-rose-text"><CircleDot className="size-3" /> {currentBreakpoints.length}</span> : null}
        {fileDirty ? <Badge color="primary">modificado</Badge> : null}
        <Button variant="ghost" size="xs" leadingIcon={Plus} onClick={() => currentPath && addBreakpoint(project.id, currentPath, cursorLine)} disabled={!currentPath}>Breakpoint</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {file ? (
          <CodeEditor
            path={currentPath}
            value={file.content}
            language={languageFor(currentPath)}
            projectId={project.id}
            projectRoot={project.root}
            breakpoints={currentBreakpoints}
            debugLine={debugLine}
            onToggleBreakpoint={(line) => toggleBreakpoint(project.id, currentPath, line)}
            onCursorLine={setCursorLine}
            onCursorPosition={(line) => setCursorLine(line)}
            onChange={(content) => { setFile((current) => current ? { ...current, content } : current); setFileDirty(true); }}
            onSave={() => void saveFile()}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-500"><Bug className="size-6" /></span>
            <strong className="text-body-medium text-text-primary">Abra um arquivo para começar</strong>
            <p className="max-w-xs text-caption-1-regular text-text-secondary">Clique na gutter à esquerda do número da linha para colocar um breakpoint.</p>
            <Button variant="secondary" size="small" leadingIcon={Search} onClick={() => setFilesOpen(true)}>Buscar arquivo</Button>
          </div>
        )}
      </div>
      {currentPath ? (
        <div className="shrink-0 border-t border-separator-border p-1.5">
          <div className="mb-1 flex items-center gap-1 px-1 text-caption-2-semibold uppercase tracking-[0.12em] text-text-tertiary"><CircleDot className="size-3" /> Breakpoints</div>
          <div className="max-h-28 overflow-y-auto">
            {currentBreakpoints.length ? currentBreakpoints.sort((a, b) => a.line - b.line).map((breakpoint) => (
              <div key={breakpoint.id} className="group flex items-center gap-1 rounded-lg px-1 py-0.5">
                <button type="button" className={cx("size-2.5 shrink-0 rounded-full", breakpoint.enabled === false ? "bg-text-tertiary" : breakpoint.logMessage ? "bg-status-yellow-text" : breakpoint.condition ? "bg-status-blue-text" : "bg-status-rose-text")} onClick={() => updateBreakpoint(project.id, breakpoint.id, { enabled: breakpoint.enabled === false })} aria-label="Ativar breakpoint" />
                <button type="button" className="min-w-0 flex-1 truncate text-start text-caption-2-regular text-text-secondary" onClick={() => void openFile(breakpoint.path, breakpoint.line)}>{breakpoint.path.split("/").pop()}:{breakpoint.line}</button>
                {breakpoint.condition ? <span className="max-w-24 truncate text-caption-2-regular text-status-blue-text" title={breakpoint.condition}>if {breakpoint.condition}</span> : null}
                {breakpoint.logMessage ? <span className="max-w-24 truncate text-caption-2-regular text-status-yellow-text" title={breakpoint.logMessage}>log</span> : null}
                <button type="button" className="text-text-tertiary hover:text-text-primary" onClick={() => openBreakpointEditor(breakpoint)} aria-label="Editar breakpoint"><PencilIcon /></button>
                <button type="button" className="text-text-tertiary hover:text-status-rose-text" onClick={() => removeBreakpoint(project.id, breakpoint.id)} aria-label="Remover breakpoint"><X className="size-3" /></button>
              </div>
            )) : <p className="px-1 text-caption-2-regular text-text-tertiary">Clique na gutter do editor ou use “Breakpoint”.</p>}
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={cx("flex h-full min-h-0 flex-col bg-background-primary-default", mobile && "pb-1")}>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-separator-border p-2">
        <span className="flex items-center gap-1.5 text-body-2-medium text-text-primary"><span className="flex size-7 items-center justify-center rounded-xl bg-accent-500/10 text-accent-500"><Bug className="size-4" /></span> Debug</span>
        <Select
          size="sm"
          aria-label="Linguagem de debug"
          selectedKey={language}
          onSelectionChange={(key) => setConfig(project.id, { language: String(key) as "node" | "python", ...(String(key) === "python" && mode === "attach" ? { mode: "launch" as const } : {}) })}
          className="w-[6.7rem] shrink-0"
          triggerClassName="h-7 px-2 text-caption-1-regular"
        >
          <SelectItem id="node">Node.js / Chrome</SelectItem>
          <SelectItem id="python">Python</SelectItem>
        </Select>
        <Select
          size="sm"
          aria-label="Modo de debug"
          selectedKey={mode}
          onSelectionChange={(key) => setConfig(project.id, { mode: String(key) as "launch" | "attach" })}
          className="w-[5.5rem] shrink-0"
          triggerClassName="h-7 px-2 text-caption-1-regular"
        >
          <SelectItem id="launch">Iniciar</SelectItem>
          <SelectItem id="attach" isDisabled={language === "python"}>Anexar</SelectItem>
        </Select>
        <div className="min-w-[8rem] flex-1">
          {mode === "attach" ? (
            <Input value={config.address} onChange={(value) => setConfig(project.id, { address: value })} placeholder="127.0.0.1:9229 ou 9222" fieldClassName="h-7 text-caption-1" />
          ) : language === "node" ? (
            <Input value={config.command} onChange={(value) => setConfig(project.id, { command: value })} placeholder="node src/index.js" fieldClassName="h-7 font-mono text-caption-1" />
          ) : (
            <Input value={config.command} onChange={(value) => setConfig(project.id, { command: value })} placeholder="app.py" fieldClassName="h-7 font-mono text-caption-1" />
          )}
        </div>
        <Input value={config.cwd} onChange={(value) => setConfig(project.id, { cwd: value })} placeholder="cwd (opcional)" fieldClassName="h-7 text-caption-1" className="hidden md:block w-32" />
        <Button variant="primary" size="small" leadingIcon={session ? Square : Play} aria-label={session ? "Parar debug" : "Iniciar debug"} onClick={() => session ? void stop() : void start()} disabled={starting || (!session && !agentReady)} className="h-7">
          {starting ? "Iniciando..." : session ? "Parar" : "Debug"}
        </Button>
        <Button variant="ghost" size="small" iconOnly leadingIcon={RefreshCw} aria-label="Recarregar sessão" title="Reler sessão" onClick={() => { api.debugSession(project.id).then((active) => { if (active) setSession(active); }).catch(() => undefined); }} className="size-7" />
        <Button variant="ghost" size="small" iconOnly leadingIcon={Trash2} aria-label="Limpar console" title="Limpar console" onClick={() => setConsoleLines([])} className="size-7" />
      </div>
      {statusError ? <div className="shrink-0 border-b border-status-rose-text/20 bg-status-rose-text/10 px-3 py-1.5 text-caption-1-regular text-status-rose-text">{statusError}</div> : null}
      {mobile ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{debugSide}</div>
          <details className="shrink-0 border-t border-separator-border bg-background-secondary-default">
            <summary className="cursor-pointer px-3 py-2 text-caption-1-medium text-text-secondary">Editor e breakpoints</summary>
            <div className="h-[45dvh] min-h-0 border-t border-separator-border">{editorPane}</div>
          </details>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="hidden w-52 shrink-0 flex-col border-e border-separator-border bg-background-secondary-default md:flex">
            <div className="p-2"><Input value={fileQuery} onChange={setFileQuery} placeholder="Filtrar arquivos" leadingIcon={Search} fieldClassName="h-7 text-caption-1" /></div>
            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
              {filteredFiles.map((path) => (
                <button key={path} type="button" onClick={() => void openFile(path)} className={cx("flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-start text-caption-1-regular", path === currentPath ? "bg-accent-500/10 text-text-primary" : "text-text-secondary hover:bg-background-primary-hover")}>
                  <span className="min-w-0 flex-1 truncate" title={path}>{path.split("/").pop()}</span>
                  {breakpoints.some((item) => item.path === path) ? <CircleDot className="size-2.5 shrink-0 text-status-rose-text" /> : null}
                </button>
              ))}
            </div>
            <div className="border-t border-separator-border p-2 text-caption-2-regular text-text-tertiary">{filteredFiles.length} arquivos</div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">{editorPane}</div>
          <aside className="flex w-[22rem] shrink-0 border-s border-separator-border bg-background-secondary-default">{debugSide}</aside>
        </div>
      )}
      <Modal isOpen={filesOpen} onClose={() => setFilesOpen(false)} title="Abrir arquivo" description={project.name} placement="bottom" size="lg" bodyClassName="p-3" swipeToClose>
        <Input value={fileQuery} onChange={setFileQuery} placeholder="Filtrar arquivos" leadingIcon={Search} fieldClassName="h-9" />
        <div className="mt-2 max-h-[50dvh] overflow-y-auto">
          {filteredFiles.map((path) => (
            <button key={path} type="button" onClick={() => { setFilesOpen(false); void openFile(path); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-caption-1-regular text-text-secondary hover:bg-background-primary-hover">
              <span className="min-w-0 flex-1 truncate">{path}</span>
              {breakpoints.some((item) => item.path === path) ? <CircleDot className="size-3 text-status-rose-text" /> : null}
            </button>
          ))}
        </div>
      </Modal>
      <Modal isOpen={intakeOpen} onClose={() => setIntakeOpen(false)} title="Antes de debugar" description="O Debug Toph precisa saber o que está errado e como reproduzir." placement="bottom" size="sm" bodyClassName="p-3" swipeToClose>
        <div className="flex flex-col gap-2">
          <label className="text-caption-1-regular text-text-secondary">Qual é o bug?</label>
          <Textarea value={bug} onChange={(value) => setConfig(project.id, { bug: value })} rows={3} resize="none" />
          <label className="text-caption-1-regular text-text-secondary">Como reproduzir?</label>
          <Textarea value={reproduction} onChange={(value) => setConfig(project.id, { reproduction: value })} rows={3} resize="none" />
          <Button className="w-full" onClick={() => setIntakeOpen(false)} disabled={!bug.trim() || !reproduction.trim()}>Salvar contexto</Button>
        </div>
      </Modal>
      <Modal isOpen={Boolean(breakpointEditing)} onClose={() => setBreakpointEditing(null)} title="Editar breakpoint" description={breakpointEditing ? `${breakpointEditing.path}:${breakpointEditing.line}` : ""} placement="bottom" size="sm" bodyClassName="p-3" swipeToClose>
        <div className="flex flex-col gap-2">
          <label className="text-caption-1-regular text-text-secondary">Condição (opcional)</label>
          <Input value={breakpointDraft.condition} onChange={(value) => setBreakpointDraft((current) => ({ ...current, condition: value }))} placeholder="ex.: user.id === 42" fieldClassName="h-9 font-mono text-caption-1" />
          <label className="text-caption-1-regular text-text-secondary">Logpoint (opcional)</label>
          <Input value={breakpointDraft.logMessage} onChange={(value) => setBreakpointDraft((current) => ({ ...current, logMessage: value }))} placeholder="ex.: user carregado" fieldClassName="h-9 text-caption-1" />
          <p className="text-caption-2-regular text-text-tertiary">Use condição ou logpoint. Logpoint imprime e continua a execução.</p>
          <Button className="w-full" onClick={saveBreakpointEditor}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}

function StepOverIcon({ className }: { className?: string }) {
  return <StepForward className={className} />;
}
function StepIntoIcon({ className }: { className?: string }) {
  return <ArrowDownToLine className={className} />;
}
function StepOutIcon({ className }: { className?: string }) {
  return <ArrowUpFromLine className={className} />;
}
function PencilIcon() {
  return <span className="text-[10px]">✎</span>;
}
