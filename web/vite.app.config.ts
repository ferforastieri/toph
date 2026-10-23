import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname, "app"),
  base: "/app/",
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: [resolve(__dirname, ".")] },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
        ws: true,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "dist/app"),
    emptyOutDir: true,
    sourcemap: true,
  },
});
