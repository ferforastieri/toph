import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { syncLauncherBrand } from "../packages/brand/assets.mjs";

const launcher = resolve(import.meta.dirname, "../packages/launcher");

export default defineConfig({
  root: launcher,
  plugins: [
    {
      name: "toph-launcher-brand",
      configResolved() {
        syncLauncherBrand(resolve(launcher, "public"));
      },
    },
    react(),
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    target: "es2022",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
});
