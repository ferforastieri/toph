import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { RefreshCw, X } from "lucide-react";
import { api, type Project } from "../api";
import { useApp } from "../store";

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

  useEffect(() => {
    if (!hostRef.current) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
      fontSize: 12.5,
      lineHeight: 1.3,
      scrollback: 5000,
      theme: {
        background: "#0F120D",
        foreground: "#EEF1E8",
        cursor: "#A8C66C",
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

    term.onData((data) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(data);
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
  }, [attempt, project.id, setTerminalId]);

  return (
    <section className="terminal-panel">
      <div className="terminal-header">
        <div className="terminal-tabs">
          <span className="terminal-tab active">Terminal</span>
        </div>
        <div className="terminal-actions">
          <span className={`terminal-status ${status}`}>{status}</span>
          <button className="icon-button" title="Reconnect" onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw size={13} />
          </button>
          <button className="icon-button" title="Close" onClick={() => setTerminalOpen(false)}>
            <X size={14} />
          </button>
        </div>
      </div>
      {error && <div className="terminal-error">{error}</div>}
      <div className="terminal-host" ref={hostRef} />
    </section>
  );
}
