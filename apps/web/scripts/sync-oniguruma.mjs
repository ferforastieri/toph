import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../../..");
const source = resolve(dirname(require.resolve("vscode-oniguruma/package.json")), "release/onig.wasm");
const target = resolve(root, "apps/web/public/onig.wasm");

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
