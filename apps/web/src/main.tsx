import React from "react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-mono";
import "@xterm/xterm/css/xterm.css";
import "./monaco";
import "./index.css";
import { initAppearance } from "./settings";
import { ConfirmProvider } from "./ui/confirm";
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
