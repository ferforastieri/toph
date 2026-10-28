import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

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
        target: "http://127.0.0.1:8787",
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
