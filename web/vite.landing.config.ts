import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname, "landing"),
  base: "/",
  plugins: [react()],
  server: {
    port: 5174,
    fs: { allow: [resolve(__dirname, ".")] },
  },
  build: {
    outDir: resolve(__dirname, "dist/landing"),
    emptyOutDir: true,
    sourcemap: true,
  },
});
