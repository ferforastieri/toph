import React from "react";
import "@fontsource-variable/onest";
import "@fontsource-variable/martian-mono";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-mono";
import "./index.css";
import { initAppearance } from "./features/settings/store";
import { ConfirmProvider } from "./shared/ui/confirm";
import App from "./app/App";
import { installNativeInsets } from "./shared/platform/nativeInsets";

installNativeInsets();
initAppearance();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </React.StrictMode>,
);
