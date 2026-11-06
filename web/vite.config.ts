import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const apiTarget = process.env.TOPH_DEV_API || "http://127.0.0.1:8787";
const tlsKey = process.env.TOPH_DEV_TLS_KEY;
const tlsCert = process.env.TOPH_DEV_TLS_CERT;
const https = tlsKey && tlsCert
  ? { key: readFileSync(tlsKey), cert: readFileSync(tlsCert) }
  : undefined;

export default defineConfig({
  root: resolve(import.meta.dirname),
  base: "/app/",
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  plugins: [react(), tailwindcss()],
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
