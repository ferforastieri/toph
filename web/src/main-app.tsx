import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono";
import "@xterm/xterm/css/xterm.css";
import "./monaco";
import "./styles.css";
import { initAppearance } from "./settings";
import { ConfirmProvider } from "./ui/Confirm";
import App from "./App";

initAppearance();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </React.StrictMode>,
);
