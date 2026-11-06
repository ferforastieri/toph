import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ignored = new Set(["node_modules", "target", "dist", "gen", ".git"]);
const errors = [];
const sources = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(?:ts|tsx|mjs)$/.test(entry.name)) sources.push(path);
  }
}
for (const directory of ["backend", "web", "desktop", "mobile", "landing", "packages", "deploy"]) {
  if (!existsSync(resolve(root, directory))) errors.push(`Missing root: ${directory}`);
}
for (const directory of ["web/src", "desktop", "mobile", "packages", "landing/preview/src"]) {
  walk(resolve(root, directory));
}
for (const path of sources) {
  const source = readFileSync(path, "utf8");
  const imports = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bvi\.mock\(\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(imports)) {
    const specifier = match[1];
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
    const target = specifier.startsWith("@/")
      ? resolve(root, "web/src", specifier.slice(2))
      : resolve(dirname(path), specifier);
    const candidates = [target, ...[".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"].map((suffix) => target + suffix)];
    if (!candidates.some((file) => existsSync(file) && statSync(file).isFile())) {
      errors.push(`${relative(root, path)}: unresolved ${specifier}`);
    }
  }
  if (path.includes("packages/launcher/") && source.includes("web/src/features")) {
    errors.push(`${relative(root, path)}: the native launcher must not bundle workbench features`);
  }
}
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
for (const workspace of manifest.workspaces) {
  if (!existsSync(resolve(root, workspace, "package.json"))) errors.push(`Missing workspace: ${workspace}`);
  if (!lock.packages[workspace]) errors.push(`Missing lockfile workspace: ${workspace}`);
}
for (const path of Object.keys(lock.packages)) {
  if (path.startsWith("apps/") || path.startsWith("services/")) errors.push(`Obsolete lockfile workspace: ${path}`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Architecture OK: ${sources.length} source files, ${manifest.workspaces.length} workspaces.`);
}
