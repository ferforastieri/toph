import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Info,
  Maximize,
  Minimize,
  MoreHorizontal,
  Plus,
  RefreshCw,
  SplitVertical,
  TerminalSquare,
  Trash2,
  TriangleAlert,
  X,
} from "@toph/icons";
import { api, type PortInfo, type Project } from "../api";
import { useSettings } from "../settings";
import { useApp } from "../store";
import { CODE_FONT_FAMILY } from "../editorThemes";
import { Button } from "@/boardui/base/buttons/button";
import { Textarea } from "@/boardui/base/textarea/textarea";
import { Badge } from "@/boardui/base/badges/badge";
import { Dropdown, DropdownDivider, DropdownGroup, DropdownItem, DropdownPopover, DropdownTrigger } from "@/boardui/base/dropdown/dropdown";
import { PillTab, PillTabList } from "@/boardui/base/tabs/pill-tab";
import { Group, Panel, Separator } from "react-resizable-panels";
import ResizeHandle from "../ui/resize";
import { cx } from "@/boardui/utils/cx";

interface Props {
  project: Project;
  onOpenFile: (path: string, line?: number) => void;
  sheet?: boolean;
  onClose?: () => void;
}

const terminalTabs = [
  { id: "problems", label: "Problems" },
  { id: "output", label: "Output" },
  { id: "debug", label: "Debug Console" },
  { id: "terminal", label: "Terminal" },
  { id: "ports", label: "Ports" },
] as const;

type TerminalTab = (typeof terminalTabs)[number]["id"];
interface Session { id: string; shell: string; title: string; parentId?: string; }
interface Diagnostic { path: string; line: number; column: number; severity: number; message: string; source: string; }
interface DebugLine { kind: "input" | "output" | "error"; text: string; }

function stripAnsi(value: string): string {
  return value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

export default function TerminalPanel({ project, onOpenFile, sheet = false, onClose }: Props) {
  const [tab, setTab] = useState<TerminalTab>("terminal");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState("");
  const [split, setSplit] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [shells, setShells] = useState(["bash"]);
  const [shell, setShell] = useState("bash");
  const [error, setError] = useState("");
  const [output, setOutput] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [debugInput, setDebugInput] = useState("");
  const [debugLines, setDebugLines] = useState<DebugLine[]>([]);
  const [debugBusy, setDebugBusy] = useState(false);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [clearNonce, setClearNonce] = useState(0);
  const [sessionMenu, setSessionMenu] = useState<{ session: Session; x: number; y: number } | null>(null);
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const terminalHeight = useSettings((state) => state.terminalHeight);
  const updateSettings = useSettings((state) => state.update);
  const theme = useSettings((state) => state.theme);
  const setTerminalOpen = useApp((state) => state.setTerminalOpen);
  const initialized = useRef(false);
  const outputRef = useRef("");

  const appendOutput = useCallback((chunk: string) => {
    if (!chunk) return;
    outputRef.current = `${outputRef.current}${chunk}`.slice(-200_000);
    setOutput(outputRef.current);
  }, []);

  const createSession = useCallback(async (shellName: string, activate = true, parentId?: string) => {
    const created = await api.createTerminal(project.id, shellName);
    const session = { id: created.id, shell: created.shell || shellName, title: created.shell || shellName, parentId };
    setSessions((current) => [...current, session]);
    if (activate) setActiveId(created.id);
    return session;
  }, [project.id]);

  useEffect(() => {
    if (!sessionMenu) return;
    const close = () => setSessionMenu(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [sessionMenu]);

  useEffect(() => {
    let cancelled = false;
    api.terminalShells()
      .then((result) => {
        if (cancelled) return;
        if (result.shells.length > 0) {
          setShells(result.shells);
          setShell((current) => result.shells.includes(current) ? current : result.shells[0]);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void createSession("bash").catch((err) => setError(err instanceof Error ? err.message : "Não foi possível abrir o terminal."));
  }, [createSession]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ items?: Diagnostic[] }>).detail;
      if (detail?.items) setDiagnostics(detail.items);
    };
    window.addEventListener("toph:diagnostics", handler);
    return () => window.removeEventListener("toph:diagnostics", handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const text = (event as CustomEvent<{ text?: string }>).detail?.text;
      if (text) appendOutput(`${text}\n`);
    };
    window.addEventListener("toph:output", handler);
    return () => window.removeEventListener("toph:output", handler);
  }, [appendOutput]);

  useEffect(() => {
    if (tab !== "ports") return;
    void loadPorts();
  }, [tab]);

  async function loadPorts() {
    setPortsLoading(true);
    try { setPorts(await api.ports()); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível listar as portas."); }
    finally { setPortsLoading(false); }
  }

  async function newSession(shellName = shell) {
    setError("");
    try { await createSession(shellName); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível abrir o terminal."); }
  }

  async function splitSession(session: Session) {
    setError("");
    try {
      // Split creates a child terminal session. The parent stays active in the
      // list, and the child hangs below it with the connection line.
      await createSession(session.shell, false, session.id);
      setSplit(true);
      setActiveId(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível dividir o terminal.");
    }
  }

  async function splitTerminal() {
    if (activeSession) await splitSession(activeSession);
  }

  async function killSession(id = activeId) {
    if (!id) return;
    await api.closeTerminal(id).catch(() => undefined);
    const remaining = sessions.filter((session) => session.id !== id);
    setSessions(remaining);
    if (remaining.length === 0) {
      setActiveId("");
      setSplit(false);
      void createSession(shell).catch((err) => setError(err instanceof Error ? err.message : "Não foi possível abrir o terminal."));
    } else {
      setActiveId((current) => current === id ? remaining[0].id : current);
      if (remaining.length < 2) setSplit(false);
    }
  }

  async function killAll() {
    await Promise.all(sessions.map((session) => api.closeTerminal(session.id).catch(() => undefined)));
    setSessions([]);
    setActiveId("");
    setSplit(false);
    void createSession(shell).catch((err) => setError(err instanceof Error ? err.message : "Não foi possível abrir o terminal."));
  }

  async function runDebug() {
    const code = debugInput.trim();
    if (!code || debugBusy) return;
    setDebugLines((current) => [...current, { kind: "input", text: code }]);
    setDebugInput("");
    setDebugBusy(true);
    try {
      const result = await api.debugEval(project.id, code);
      if (result.stdout) setDebugLines((current) => [...current, { kind: "output", text: result.stdout.trimEnd() }]);
      if (result.stderr) setDebugLines((current) => [...current, { kind: "error", text: result.stderr.trimEnd() }]);
      if (!result.stdout && !result.stderr) setDebugLines((current) => [...current, { kind: "output", text: `(exit ${result.exitCode ?? 0})` }]);
    } catch (err) {
      setDebugLines((current) => [...current, { kind: "error", text: err instanceof Error ? err.message : "Falha ao avaliar." }]);
    } finally {
      setDebugBusy(false);
    }
  }

  const selectedSession = sessions.find((session) => session.id === activeId) ?? sessions[0];
  const activeSession = selectedSession?.parentId
    ? sessions.find((session) => session.id === selectedSession.parentId) ?? selectedSession
    : selectedSession;
  const splitChild = activeSession ? sessions.find((session) => session.parentId === activeSession.id) : undefined;
  const paneSessions = split && activeSession && splitChild ? [activeSession, splitChild] : activeSession ? [activeSession] : [];
  const groups = sessions
    .filter((session) => !session.parentId)
    .map((session) => [session, ...sessions.filter((child) => child.parentId === session.id)]);
  const activeGroup = groups.find((group) => group.some((session) => session.id === activeId || session.parentId === activeId));
  const orderedSessions = activeGroup
    ? [...activeGroup, ...groups.filter((group) => group !== activeGroup).flat()]
    : groups.flat();

  useEffect(() => {
    const handleCommand = (event: Event) => {
      const command = (event as CustomEvent<{ command?: string }>).detail?.command;
      if (command === "new") void newSession();
      else if (command === "split") void splitTerminal();
      else if (command === "clear") setClearNonce((value) => value + 1);
      else if (command === "reconnect") setReconnectNonce((value) => value + 1);
      else if (command === "kill") void killSession();
      else if (command === "kill-all") void killAll();
    };
    const handleTab = (event: Event) => {
      const next = (event as CustomEvent<{ tab?: string }>).detail?.tab;
      if (next && terminalTabs.some((item) => item.id === next)) setTab(next as TerminalTab);
    };
    window.addEventListener("toph:terminal-command", handleCommand);
    window.addEventListener("toph:terminal-tab", handleTab);
    return () => {
      window.removeEventListener("toph:terminal-command", handleCommand);
      window.removeEventListener("toph:terminal-tab", handleTab);
    };
  }, [activeSession?.id, shell, sessions.length]);

  return (
    <section
      className={cx("bg-background-primary-default flex flex-col", sheet ? "h-full min-h-0" : "min-h-[180px] shrink-0 border-t")}
      style={sheet ? { height: "100%" } : { height: maximized ? "calc(100dvh - 120px)" : "var(--terminal-height)" }}
    >
      {!sheet && <ResizeHandle className="terminal-resize" orientation="horizontal" value={terminalHeight} min={180} max={640} invert label="Resize terminal" onChange={(height) => document.documentElement.style.setProperty("--terminal-height", `${height}px`)} onCommit={(height) => updateSettings({ terminalHeight: height })} />}
      <div className="bg-background-secondary-default flex h-9 shrink-0 items-center justify-between border-b pe-2">
        <PillTabList className="h-full px-2" aria-label="Terminal panel">
          {terminalTabs.map((item) => (
            <PillTab key={item.id} variant="gray" isSelected={tab === item.id} onSelect={() => setTab(item.id)}>
              {item.label}
              {item.id === "problems" && diagnostics.length > 0 && <Badge color="neutral" className="ms-1 h-4 px-1 text-caption-2-regular">{diagnostics.length}</Badge>}
            </PillTab>
          ))}
        </PillTabList>
        <div className="flex shrink-0 items-center gap-0.5">
          <Dropdown isOpen={shellMenuOpen} onOpenChange={setShellMenuOpen}>
            <DropdownTrigger aria-label="Selecionar shell" className="flex h-7 items-center gap-1 rounded-md px-1.5 text-caption-1-medium text-foreground-icon-primary hover:bg-background-primary-hover">
              <TerminalSquare size={14} /> {shell} <ChevronDown size={12} />
            </DropdownTrigger>
            <DropdownPopover aria-label="Shell" placement="bottom end">
              <DropdownGroup label="Shell">
                {shells.map((item) => <DropdownItem key={item} onSelect={() => { setShellMenuOpen(false); setShell(item); void newSession(item); }}>{item}</DropdownItem>)}
              </DropdownGroup>
              <DropdownDivider />
              <DropdownGroup>
                <DropdownItem onSelect={() => { setShellMenuOpen(false); void newSession(); }}>Novo terminal</DropdownItem>
              </DropdownGroup>
            </DropdownPopover>
          </Dropdown>
          <Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Novo terminal" title="Novo terminal" onClick={() => void newSession()} />
          <Button variant="ghost" size="xs" iconOnly leadingIcon={SplitVertical} aria-label="Dividir terminal" title="Dividir terminal" onClick={() => void splitTerminal()} />
          <Button variant="ghost" size="xs" iconOnly leadingIcon={Trash2} aria-label="Encerrar terminal" title="Encerrar terminal" disabled={!activeSession} onClick={() => void killSession()} />
          <Dropdown isOpen={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
            <DropdownTrigger aria-label="Mais ações" className="flex size-6 items-center justify-center rounded-md text-foreground-icon-primary hover:bg-background-primary-hover">
              <MoreHorizontal size={14} />
            </DropdownTrigger>
            <DropdownPopover aria-label="Mais ações" placement="bottom end">
              <DropdownGroup>
                <DropdownItem onSelect={() => { setMoreMenuOpen(false); setClearNonce((value) => value + 1); }}>Limpar terminal</DropdownItem>
                <DropdownItem onSelect={() => { setMoreMenuOpen(false); setReconnectNonce((value) => value + 1); }}>Reconectar terminal</DropdownItem>
              </DropdownGroup>
              <DropdownDivider />
              <DropdownGroup>
                <DropdownItem className="text-text-error-primary" onSelect={() => { setMoreMenuOpen(false); void killAll(); }}>Encerrar todos</DropdownItem>
              </DropdownGroup>
            </DropdownPopover>
          </Dropdown>
          {!sheet && <Button variant="ghost" size="xs" iconOnly leadingIcon={maximized ? Minimize : Maximize} aria-label={maximized ? "Restaurar terminal" : "Maximizar terminal"} title={maximized ? "Restaurar" : "Maximizar"} onClick={() => setMaximized((value) => !value)} />}
          <Button variant="ghost" size="xs" iconOnly leadingIcon={X} aria-label="Fechar terminal" title="Fechar painel" onClick={onClose ?? (() => setTerminalOpen(false))} />
        </div>
      </div>

      {error && <div className="border-b border-border-error-default bg-status-rose-background px-2 py-1 text-caption-1-regular text-status-rose-text">{error}</div>}

      {tab === "terminal" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            {split && paneSessions.length >= 2 ? (
              <Group orientation="horizontal" className="min-h-0 flex-1">
                <Panel defaultSize="50" minSize="20">
                  <TerminalView key={`${paneSessions[0].id}:${reconnectNonce}`} session={paneSessions[0]} theme={theme} clearNonce={clearNonce} onOutput={appendOutput} />
                </Panel>
                <Separator className="relative w-px bg-separator-border after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2 focus-visible:ring-2 focus-visible:ring-border-focus-ring" />
                <Panel defaultSize="50" minSize="20">
                  <TerminalView key={`${paneSessions[1].id}:${reconnectNonce}`} session={paneSessions[1]} theme={theme} clearNonce={clearNonce} onOutput={appendOutput} />
                </Panel>
              </Group>
            ) : (
              <div className="min-h-0 flex-1">
                {paneSessions[0] ? <TerminalView key={`${paneSessions[0].id}:${reconnectNonce}`} session={paneSessions[0]} theme={theme} clearNonce={clearNonce} onOutput={appendOutput} /> : <div className="flex h-full items-center justify-center text-caption-1-regular text-text-secondary">Nenhum terminal aberto.</div>}
              </div>
            )}
            {sessions.length > 1 && (
              <aside className="bg-background-primary-default flex w-52 shrink-0 flex-col border-s" aria-label="Terminais abertos">
                {orderedSessions.map((session) => (
                  <div
                    key={session.id}
                    role="tab"
                    tabIndex={0}
                    aria-selected={session.id === activeId}
                    onClick={() => setActiveId(session.parentId ?? session.id)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setActiveId(session.parentId ?? session.id); }}
                    onContextMenu={(event) => { event.preventDefault(); setSessionMenu({ session, x: Math.min(event.clientX, window.innerWidth - 280), y: Math.min(event.clientY, window.innerHeight - 420) }); }}
                    className={cx(
                      "group relative flex h-7 cursor-pointer items-center gap-2 px-2 text-caption-1-regular outline-none",
                      session.id === activeId ? "bg-background-secondary-hover text-text-primary" : "text-text-secondary hover:bg-background-secondary-hover/60 hover:text-text-primary",
                      session.parentId && "ps-6",
                    )}
                  >
                    {session.parentId && <span aria-hidden className="pointer-events-none absolute start-2 top-0 h-1/2 w-3 rounded-bl border-s border-b border-separator-border" />}
                    <TerminalSquare size={12} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{session.title}</span>
                    <span className={cx("flex shrink-0 items-center", session.id === activeId ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                      <Button variant="ghost" size="xs" iconOnly leadingIcon={SplitVertical} aria-label={`Dividir ${session.title}`} title="Dividir terminal" onClick={(event) => { event.stopPropagation(); void splitSession(session); }} />
                      <Button variant="ghost" size="xs" iconOnly leadingIcon={Trash2} aria-label={`Encerrar ${session.title}`} title="Encerrar terminal" onClick={(event) => { event.stopPropagation(); void killSession(session.id); }} />
                    </span>
                  </div>
                ))}
              </aside>
            )}
          </div>

        </div>
      )}

      {sessionMenu && createPortal(
        <div className="fixed inset-0 z-100" onMouseDown={() => setSessionMenu(null)}>
          <div
            className="bg-background-primary-default shadow-dropdown absolute w-64 rounded-lg border p-1.5"
            style={{ left: sessionMenu.x, top: sessionMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button type="button" className="flex w-full items-center gap-2 rounded-2lg px-2 py-1.5 text-start text-body-2-medium text-text-primary hover:bg-dropdown-item-hover-background" onClick={() => { setSessionMenu(null); void splitSession(sessionMenu.session); }}>Split Terminal <span className="ms-auto text-caption-2-regular text-text-tertiary">Ctrl+Shift+5</span></button>
            <div className="my-1 h-px bg-separator-border" />
            <button type="button" disabled className="flex w-full cursor-not-allowed items-center rounded-2lg px-2 py-1.5 text-start text-body-2-medium text-text-disabled">Move Terminal into Editor Area</button>
            <button type="button" disabled className="flex w-full cursor-not-allowed items-center rounded-2lg px-2 py-1.5 text-start text-body-2-medium text-text-disabled">Move Terminal into New Window</button>
            <div className="my-1 h-px bg-separator-border" />
            <button type="button" disabled className="flex w-full cursor-not-allowed items-center rounded-2lg px-2 py-1.5 text-start text-body-2-medium text-text-disabled">Focus in Commit Graph</button>
            <button type="button" disabled className="flex w-full cursor-not-allowed items-center rounded-2lg px-2 py-1.5 text-start text-body-2-medium text-text-disabled">Open in Commit Graph</button>
            <button type="button" disabled className="flex w-full cursor-not-allowed items-center rounded-2lg px-2 py-1.5 text-start text-body-2-medium text-text-disabled">Open in New Window</button>
            <div className="my-1 h-px bg-separator-border" />
            <button type="button" disabled className="flex w-full cursor-not-allowed items-center rounded-2lg px-2 py-1.5 text-start text-body-2-medium text-text-disabled">Change Color...</button>
            <button type="button" disabled className="flex w-full cursor-not-allowed items-center rounded-2lg px-2 py-1.5 text-start text-body-2-medium text-text-disabled">Change Icon...</button>
            <button type="button" className="flex w-full items-center gap-2 rounded-2lg px-2 py-1.5 text-start text-body-2-medium text-text-primary hover:bg-dropdown-item-hover-background" onClick={() => { const current = sessionMenu.session; setSessionMenu(null); const next = window.prompt("Nome do terminal", current.title); if (next?.trim()) setSessions((items) => items.map((item) => item.id === current.id ? { ...item, title: next.trim() } : item)); }}>Rename... <span className="ms-auto text-caption-2-regular text-text-tertiary">F2</span></button>
            <button type="button" disabled className="flex w-full cursor-not-allowed items-center rounded-2lg px-2 py-1.5 text-start text-body-2-medium text-text-disabled">Toggle Size to Content Width <span className="ms-auto text-caption-2-regular">Alt+Z</span></button>
            <div className="my-1 h-px bg-separator-border" />
            <button type="button" className="flex w-full items-center gap-2 rounded-2lg px-2 py-1.5 text-start text-body-2-medium text-text-error-primary hover:bg-dropdown-item-hover-background" onClick={() => { const current = sessionMenu.session; setSessionMenu(null); void killSession(current.id); }}>Kill terminal <span className="ms-auto text-caption-2-regular text-text-tertiary">Del</span></button>
          </div>
        </div>,
        document.body,
      )}

      {tab === "problems" && (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {diagnostics.length === 0 ? (
            <div className="bg-background-secondary-default m-1 flex flex-col items-center gap-2 rounded-lg border p-6 text-center">
              <span className="flex size-9 items-center justify-center rounded-full bg-background-tertiary-default text-status-lime-text"><CircleCheck size={20} /></span>
              <strong className="text-body-medium">Nenhum problema</strong>
              <p className="text-caption-1-regular text-text-secondary">O workspace não tem erros ou avisos.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {diagnostics.map((item, index) => {
                const Icon = item.severity >= 8 ? CircleAlert : item.severity >= 4 ? TriangleAlert : Info;
                return (
                  <button key={`${item.path}:${item.line}:${item.column}:${index}`} type="button" className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-background-primary-hover" onClick={() => onOpenFile(item.path, item.line)}>
                    <Icon size={14} className={item.severity >= 8 ? "text-text-error-primary" : item.severity >= 4 ? "text-status-yellow-text" : "text-foreground-icon-secondary"} />
                    <span className="flex min-w-0 flex-1 flex-col"><span className="text-caption-1-regular">{item.message}</span><span className="truncate text-caption-2-regular text-text-secondary">{item.path}:{item.line}:{item.column}{item.source ? ` · ${item.source}` : ""}</span></span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "output" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-8 shrink-0 items-center justify-end border-b px-2"><Button variant="ghost" size="xs" onClick={() => { outputRef.current = ""; setOutput(""); }}>Limpar</Button></div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-caption-1-regular text-text-secondary">{stripAnsi(output) || "Nenhuma saída ainda."}</pre>
        </div>
      )}

      {tab === "debug" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {debugLines.length === 0 && <p className="px-2 py-4 text-caption-1-regular text-text-secondary">Avalie JavaScript no contexto do projeto. Digite uma expressão abaixo.</p>}
            {debugLines.map((line, index) => (
              <div key={index} className={`flex gap-2 px-2 py-1 font-mono text-caption-1-regular ${line.kind === "input" ? "text-text-primary" : line.kind === "error" ? "text-text-error-primary" : "text-text-secondary"}`}>
                <span className="shrink-0">{line.kind === "input" ? "›" : line.kind === "error" ? "!" : "‹"}</span>
                <pre className="whitespace-pre-wrap break-words">{line.text}</pre>
              </div>
            ))}
          </div>
          <div className="flex shrink-0 items-end gap-2 border-t p-2" onKeyDownCapture={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void runDebug(); } }}>
            <Textarea value={debugInput} onChange={setDebugInput} rows={1} placeholder="Ex.: Object.keys(require('./package.json'))" className="min-h-8 font-mono text-caption-1-regular" />
            <Button size="small" disabled={debugBusy || !debugInput.trim()} onClick={() => void runDebug()}>{debugBusy ? "..." : "Executar"}</Button>
          </div>
        </div>
      )}

      {tab === "ports" && (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <div className="mb-2 flex items-center justify-between"><span className="text-caption-1-regular text-text-secondary">Portas TCP em escuta no servidor</span><Button variant="ghost" size="xs" leadingIcon={RefreshCw} onClick={() => void loadPorts()}>Atualizar</Button></div>
          {portsLoading && <p className="px-2 py-4 text-caption-1-regular text-text-secondary">Carregando...</p>}
          {!portsLoading && ports.length === 0 && (
            <div className="bg-background-secondary-default m-1 flex flex-col items-center gap-2 rounded-lg border p-6 text-center">
              <span className="flex size-9 items-center justify-center rounded-full bg-background-tertiary-default text-foreground-icon-secondary"><TerminalSquare size={20} /></span>
              <strong className="text-body-medium">Nenhuma porta</strong>
              <p className="text-caption-1-regular text-text-secondary">Nenhuma porta TCP em escuta foi encontrada.</p>
            </div>
          )}
          {ports.map((item) => {
            const host = item.address === "0.0.0.0" || item.address === "[::]" ? window.location.hostname : item.address;
            return (
              <div key={`${item.protocol}:${item.address}:${item.port}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-background-primary-hover">
                <Badge color="neutral" className="text-caption-2-regular uppercase">{item.protocol}</Badge>
                <span className="min-w-0 flex-1 truncate font-mono text-caption-1-regular">{item.address}:{item.port}</span>
                <a className="text-caption-1-medium text-accent-500 underline-offset-2 hover:underline" href={`http://${host}:${item.port}`} target="_blank" rel="noreferrer">Abrir</a>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TerminalView({ session, theme, clearNonce, onOutput }: { session: Session; theme: "light" | "dark"; clearNonce: number; onOutput: (text: string) => void; }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const outputCallback = useRef(onOutput);
  outputCallback.current = onOutput;

  useEffect(() => {
    if (!hostRef.current) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "block",
      drawBoldTextInBrightColors: true,
      fontFamily: CODE_FONT_FAMILY,
      fontSize: 14,
      fontWeight: "normal",
      fontWeightBold: "bold",
      letterSpacing: 0,
      lineHeight: 1,
      scrollback: 5000,
      theme: theme === "light" ? {
        background: "#F7F8F5", foreground: "#22251F", cursor: "#9D3BB5", selectionBackground: "#EBD4F2",
        black: "#22251F", red: "#B64B40", green: "#3E7A45", yellow: "#9A6A15", blue: "#2F6E76", magenta: "#7A4E8E", cyan: "#2F6E76", white: "#F7F8F5",
        brightBlack: "#7A8177", brightRed: "#D46355", brightGreen: "#4F914F", brightYellow: "#B8822A", brightBlue: "#4C8C94", brightMagenta: "#9568AA", brightCyan: "#4C8C94", brightWhite: "#11130F",
      } : {
        background: "#000000", foreground: "#C8C8C8", cursor: "#FF50FF", cursorAccent: "#000000", selectionBackground: "#96969659", selectionForeground: "#C8C8C8",
        black: "#000000", red: "#FF7878", green: "#AAE682", yellow: "#FFDC96", blue: "#00B1FF", magenta: "#FF50FF", cyan: "#00DCDC", white: "#C8C8C8",
        brightBlack: "#787878", brightRed: "#FF7878", brightGreen: "#AAE682", brightYellow: "#FFDC96", brightBlue: "#00B1FF", brightMagenta: "#FF50FF", brightCyan: "#00DCDC", brightWhite: "#FFFFFF",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    termRef.current = term;
    fit.fit();
    term.focus();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${window.location.host}/api/terminals/${encodeURIComponent(session.id)}/ws`);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => { if (!disposed) { fit.fit(); socket?.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })); } };
    socket.onmessage = (event) => {
      if (typeof event.data === "string") { term.write(event.data); outputCallback.current(event.data); }
      else { const bytes = new Uint8Array(event.data); term.write(bytes); outputCallback.current(new TextDecoder().decode(bytes)); }
    };
    socket.onclose = () => { if (!disposed) undefined; };
    socket.onerror = () => { if (!disposed) undefined; };
    const encoder = new TextEncoder();
    term.onData((data) => { if (socket?.readyState === WebSocket.OPEN) socket.send(encoder.encode(data)); });
    term.onResize(({ cols, rows }) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "resize", cols, rows })); });
    resizeObserver = new ResizeObserver(() => fit.fit());
    resizeObserver.observe(hostRef.current);
    return () => { disposed = true; resizeObserver?.disconnect(); socket?.close(); term.dispose(); termRef.current = null; };
  }, [session.id, theme]);

  useEffect(() => {
    if (clearNonce > 0) termRef.current?.clear();
  }, [clearNonce]);

  return <div className="min-h-0 h-full w-full" ref={hostRef} />;
}
