import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-mono";
import "@xterm/xterm/css/xterm.css";
import "./monaco";
import "@toph/icons/styles.css";
import "@toph/ui/styles/base.css";
import "./styles.css";
import { initAppearance } from "./settings";
import { ConfirmProvider } from "@toph/ui";
import App from "./App";
import { installNativeInsets } from "./nativeInsets";

if (new URLSearchParams(window.location.search).get("mobile") === "1") {
  document.documentElement.classList.add("mobile-client");
}

installNativeInsets();
initAppearance();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </React.StrictMode>,
);
