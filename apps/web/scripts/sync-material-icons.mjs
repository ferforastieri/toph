import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../../..");
const source = resolve(dirname(require.resolve("material-icon-theme/package.json")), "icons");
const target = resolve(root, "apps/web/public/material-icons");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
