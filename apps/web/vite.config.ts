import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

const apiTarget = process.env.TOPH_DEV_API || "http://127.0.0.1:8787";

export default defineConfig({
  root: resolve(__dirname),
  base: "/app/",
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    fs: { allow: [resolve(__dirname, "../..")] },
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: false,
        ws: true,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    sourcemap: true,
  },
});
