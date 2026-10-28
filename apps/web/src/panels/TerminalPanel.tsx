import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { RefreshCw, X } from "@toph/icons";
import { api, type Project } from "../api";
import { useApp } from "../store";
import { useSettings } from "../settings";
import { CODE_FONT_FAMILY } from "../editorThemes";
import { Button } from "@/components/ui/button";

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
  const theme = useSettings((state) => state.theme);

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
      theme: theme === "light"
        ? {
            background: "#F7F8F5",
            foreground: "#22251F",
            cursor: "#9D3BB5",
            selectionBackground: "#EBD4F2",
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
        : theme === "nightwolf"
          ? {
              background: "#000000",
              foreground: "#C8C8C8",
              cursor: "#FF50FF",
              cursorAccent: "#000000",
              selectionBackground: "#96969659",
              selectionForeground: "#C8C8C8",
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
  }, [attempt, project.id, setTerminalId, theme]);

  return (
    <section className="flex h-full min-h-0 flex-col border-t bg-muted/20">
      <div className="flex h-8 shrink-0 items-center justify-between border-b px-2">
        <span className="flex h-6 items-center rounded border bg-background px-2 text-[11px] font-medium">Terminal</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">{status}</span>
          <Button variant="ghost" size="icon-xs" aria-label="Reconnect" onClick={() => setAttempt((n) => n + 1)}><RefreshCw size={13} /></Button>
          <Button variant="ghost" size="icon-xs" aria-label="Close" onClick={() => setTerminalOpen(false)}><X size={14} /></Button>
        </div>
      </div>
      {error && <div className="border-b border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">{error}</div>}
      <div className="min-h-0 flex-1" ref={hostRef} />
    </section>
  );
}
