import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono";
import "@toph/ui/styles/base.css";
import "./styles.css";
import Landing from "./Landing";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Landing />
  </React.StrictMode>,
);
