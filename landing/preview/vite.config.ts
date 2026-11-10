import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { syncBrand } from "../../packages/brand/assets.mjs";

const here = import.meta.dirname;

export default defineConfig({
  root: resolve(here),
  base: "/",
  plugins: [
    {
      name: "toph-brand-assets",
      configResolved() {
        syncBrand(resolve(here, "public/brand"));
      },
    },
    react(),
  ],
  server: {
    port: 5174,
    fs: { allow: [resolve(here, "../..")] },
  },
  build: {
    outDir: resolve(here, "dist"),
    emptyOutDir: true,
    sourcemap: true,
  },
});
