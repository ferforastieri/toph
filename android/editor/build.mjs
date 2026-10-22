import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(here, "../app/src/main/assets/editor");
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [resolve(here, "src/editor.js")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["chrome100"],
  outfile: resolve(outdir, "editor.js"),
  legalComments: "none",
});

copyFileSync(resolve(here, "index.html"), resolve(outdir, "index.html"));
console.log("android editor built");
