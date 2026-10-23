import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../node_modules/monaco-editor/min/vs");
const target = resolve(here, "../app/public/monaco/vs");

if (!existsSync(source)) {
  console.error("monaco-editor is not installed; run npm install first");
  process.exit(1);
}

mkdirSync(dirname(target), { recursive: true });
cpSync(source, target, { recursive: true });
console.log(`copied Monaco to ${target}`);
