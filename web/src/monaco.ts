import { loader } from "@monaco-editor/react";

// Monaco is served from the app origin, not a CDN. The build copies
// node_modules/monaco-editor/min/vs to public/monaco/vs.
loader.config({ paths: { vs: "/monaco/vs" } });
