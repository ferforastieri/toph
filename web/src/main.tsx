import React from "react";
import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/onest";
import ReactDOM from "react-dom/client";
import "./fonts.css";
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
