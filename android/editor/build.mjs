import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(here, "../app/src/main/assets");
mkdirSync(resolve(outdir, "editor"), { recursive: true });
mkdirSync(resolve(outdir, "terminal"), { recursive: true });

await build({
  entryPoints: [resolve(here, "src/editor.js")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["chrome100"],
  outfile: resolve(outdir, "editor/editor.js"),
  legalComments: "none",
});

await build({
  entryPoints: [resolve(here, "src/terminal.js")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["chrome100"],
  outfile: resolve(outdir, "terminal/terminal.js"),
  legalComments: "none",
});

copyFileSync(resolve(here, "index.html"), resolve(outdir, "editor/index.html"));
copyFileSync(resolve(here, "terminal.html"), resolve(outdir, "terminal/terminal.html"));
console.log("android editor and terminal built");
