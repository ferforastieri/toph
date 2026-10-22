import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const term = new Terminal({
  convertEol: true,
  cursorBlink: true,
  fontFamily: "'IBM Plex Mono', 'SFMono-Regular', monospace",
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
term.open(document.getElementById("terminal"));
fit.fit();

let socket = null;
let observer = null;

function sendResize() {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
  }
}

term.onData((data) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(data);
});
term.onResize(() => sendResize());
window.addEventListener("resize", () => fit.fit());

window.TophTerminal = {
  connect(url) {
    if (socket) {
      socket.close();
      socket = null;
    }
    fit.fit();
    socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      sendResize();
      term.focus();
    };
    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        term.write(event.data);
      } else {
        term.write(new Uint8Array(event.data));
      }
    };
    socket.onclose = () => {
      term.write("\r\n[disconnected]\r\n");
    };
    if (!observer) {
      observer = new ResizeObserver(() => fit.fit());
      observer.observe(document.getElementById("terminal"));
    }
  },
  focus() {
    term.focus();
  },
  ready: true,
};
