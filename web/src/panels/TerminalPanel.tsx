import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { RefreshCw, X } from "lucide-react";
import { api, type Project } from "../api";
import { useApp } from "../store";
import { useResolvedTheme, useSettings } from "../settings";
import { Button } from "../ui/Button";
import ResizeHandle from "../ui/ResizeHandle";

interface Props {
  project: Project;
}

export default function TerminalPanel({ project }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const setTerminalId = useApp((state) => state.setTerminalId);
  const setTerminalOpen = useApp((state) => state.setTerminalOpen);
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const terminalFontSize = useSettings((state) => state.terminalFontSize);
  const terminalHeight = useSettings((state) => state.terminalHeight);
  const updateSettings = useSettings((state) => state.update);
  const accent = useSettings((state) => state.accent);
  const resolved = useResolvedTheme();

  useEffect(() => {
    if (!hostRef.current) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#A8C66C";
    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
      fontSize: terminalFontSize,
      lineHeight: 1.35,
      scrollback: 5000,
      theme: resolved === "light"
        ? {
            background: "#F7F8F5",
            foreground: "#22251F",
            cursor: primary,
            selectionBackground: "#CFE3B8",
            black: "#22251F",
            red: "#B64B40",
            green: "#3E7A45",
            yellow: "#9A6A15",
            blue: "#2F6E76",
            magenta: "#7A4E8E",
            cyan: "#2F6E76",
            white: "#F7F8F5",
            brightBlack: "#7A8177",
            brightRed: "#D46355",
            brightGreen: "#4F914F",
            brightYellow: "#B8822A",
            brightBlue: "#4C8C94",
            brightMagenta: "#9568AA",
            brightCyan: "#4C8C94",
            brightWhite: "#11130F",
          }
        : resolved === "brand"
        ? {
            background: "#080B12",
            foreground: "#DCE4F7",
            cursor: primary,
            selectionBackground: "#2B3B70",
            black: "#080B12",
            red: "#FF6B7A",
            green: "#7BD88F",
            yellow: "#FFC857",
            blue: "#7C9BFF",
            magenta: "#B9A0D6",
            cyan: "#58C4FF",
            white: "#DCE4F7",
            brightBlack: "#4D5870",
            brightRed: "#FF8A96",
            brightGreen: "#A0E7AE",
            brightYellow: "#FFD98A",
            brightBlue: "#98B0FF",
            brightMagenta: "#CDB8E6",
            brightCyan: "#8AD8FF",
            brightWhite: "#FFFFFF",
          }
        : resolved === "nightwolf"
        ? {
            background: "#000000",
            foreground: "#C8C8C8",
            cursor: primary,
            selectionBackground: "#96969659",
            black: "#000000",
            red: "#FF7878",
            green: "#AAE682",
            yellow: "#FFDC96",
            blue: "#00B1FF",
            magenta: "#FF50FF",
            cyan: "#00DCDC",
            white: "#C8C8C8",
            brightBlack: "#787878",
            brightRed: "#FF7878",
            brightGreen: "#AAE682",
            brightYellow: "#FFDC96",
            brightBlue: "#00B1FF",
            brightMagenta: "#FF50FF",
            brightCyan: "#00DCDC",
            brightWhite: "#FFFFFF",
          }
        : {
            background: "#0F120D",
            foreground: "#EEF1E8",
            cursor: primary,
            selectionBackground: "#33421F",
            black: "#0F120D",
            red: "#D96C5F",
            green: "#A8C66C",
            yellow: "#D4A24C",
            blue: "#7FA7A0",
            magenta: "#B9A0D6",
            cyan: "#7FA7A0",
            white: "#EEF1E8",
            brightBlack: "#566050",
            brightRed: "#F08A7D",
            brightGreen: "#B9D77E",
            brightYellow: "#E3B662",
            brightBlue: "#9BC2BA",
            brightMagenta: "#CDB8E6",
            brightCyan: "#9BC2BA",
            brightWhite: "#FFFFFF",
          },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    term.focus();

    async function connect() {
      try {
        let terminalId = useApp.getState().terminalIds[project.id];
        if (!terminalId) {
          const created = await api.createTerminal(project.id);
          terminalId = created.id;
          setTerminalId(project.id, terminalId);
        }
        if (disposed) return;
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        socket = new WebSocket(
          `${protocol}//${window.location.host}/api/terminals/${encodeURIComponent(terminalId)}/ws`,
        );
        socket.binaryType = "arraybuffer";
        socket.onopen = () => {
          if (disposed) return;
          setStatus("open");
          fit.fit();
          socket?.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        };
        socket.onmessage = (event) => {
          if (typeof event.data === "string") {
            term.write(event.data);
          } else {
            term.write(new Uint8Array(event.data));
          }
        };
        socket.onclose = () => {
          if (!disposed) setStatus("closed");
        };
        socket.onerror = () => {
          if (!disposed) {
            setStatus("error");
            setError("Terminal connection failed.");
          }
        };
      } catch (err) {
        if (!disposed) {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Could not create terminal.");
        }
      }
    }

    const encoder = new TextEncoder();
    term.onData((data) => {
      // xterm input is binary terminal data. Text frames are reserved for
      // resize/control messages by the backend.
      if (socket?.readyState === WebSocket.OPEN) socket.send(encoder.encode(data));
    });
    term.onResize(({ cols, rows }) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    resizeObserver = new ResizeObserver(() => fit.fit());
    resizeObserver.observe(hostRef.current);
    void connect();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      socket?.close();
      term.dispose();
    };
  }, [accent, attempt, project.id, setTerminalId, terminalFontSize, resolved]);

  return (
    <section className="terminal-panel">
      <ResizeHandle
        className="terminal-resize"
        orientation="horizontal"
        value={terminalHeight}
        min={180}
        max={640}
        invert
        label="Resize terminal"
        onChange={(height) => document.documentElement.style.setProperty("--terminal-height", `${height}px`)}
        onCommit={(height) => updateSettings({ terminalHeight: height })}
      />
      <div className="terminal-header">
        <div className="terminal-tabs">
          <span className="terminal-tab active">Terminal</span>
        </div>
        <div className="terminal-actions">
          <span className={`terminal-status ${status}`}>{status}</span>
          <Button className="icon-button" title="Reconnect" onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw size={13} />
          </Button>
          <Button className="icon-button" title="Close" onClick={() => setTerminalOpen(false)}>
            <X size={14} />
          </Button>
        </div>
      </div>
      {error && <div className="terminal-error">{error}</div>}
      <div className="terminal-host" ref={hostRef} />
    </section>
  );
}
