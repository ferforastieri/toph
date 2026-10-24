import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono";
import "@xterm/xterm/css/xterm.css";
import "./monaco";
import "@toph/ui/styles/base.css";
import "./styles.css";
import { initAppearance } from "./settings";
import { ConfirmProvider } from "@toph/ui";
import App from "./App";

if (new URLSearchParams(window.location.search).get("mobile") === "1") {
  document.documentElement.classList.add("mobile-client");
}

initAppearance();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </React.StrictMode>,
);
