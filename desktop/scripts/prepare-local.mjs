import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const name = process.platform === "win32" ? "toph.exe" : "toph";
const root = resolve(import.meta.dirname, "../..");
const source = resolve(root, "bin", name);
const target = resolve(root, "desktop/src-tauri/resources", name);
await mkdir(resolve(root, "desktop/src-tauri/resources"), { recursive: true });
try {
  await copyFile(source, target);
  console.log(`Prepared local Toph sidecar (${name}).`);
} catch {
  console.warn(`Local Toph binary '${name}' not found; local mode will be unavailable.`);
}
