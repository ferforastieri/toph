import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { syncBrand } from "../packages/brand/assets.mjs";

const apiTarget = process.env.TOPH_DEV_API || "http://127.0.0.1:8787";
const tlsKey = process.env.TOPH_DEV_TLS_KEY;
const tlsCert = process.env.TOPH_DEV_TLS_CERT;
const https = tlsKey && tlsCert
  ? { key: readFileSync(tlsKey), cert: readFileSync(tlsCert) }
  : undefined;

const here = import.meta.dirname;
const require = createRequire(import.meta.url);
const packageDir = (name) => dirname(require.resolve(`${name}/package.json`));

/** Assets live in node_modules or in packages/brand; copy them into public/
 * before Vite serves or builds, instead of keeping standalone scripts. */
function localAssets() {
  return {
    name: "toph-local-assets",
    configResolved() {
      const monaco = resolve(here, "../node_modules/monaco-editor/min/vs");
      const monacoTarget = resolve(here, "public/monaco");
      rmSync(monacoTarget, { recursive: true, force: true });
      mkdirSync(monacoTarget, { recursive: true });
      cpSync(monaco, resolve(monacoTarget, "vs"), { recursive: true });

      copyFileSync(
        resolve(packageDir("vscode-oniguruma"), "release/onig.wasm"),
        resolve(here, "public/onig.wasm"),
      );

      syncBrand(resolve(here, "public/brand"));
    },
  };
}

export default defineConfig({
  root: resolve(import.meta.dirname),
  base: "/app/",
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  plugins: [localAssets(), react()],
  server: {
    port: 5173,
    https,
    fs: { allow: [resolve(import.meta.dirname, "..")] },
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: false,
        ws: true,
      },
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    sourcemap: process.env.TOPH_SOURCEMAP === "true",
  },
});
