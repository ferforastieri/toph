import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const app = resolve(import.meta.dirname, "..");
const root = resolve(app, "../..");
const name = process.platform === "win32" ? "toph.exe" : "toph";
const source = resolve(root, "bin", name);
const target = resolve(app, "src-tauri/resources", name);
await mkdir(resolve(app, "src-tauri/resources"), { recursive: true });
try {
  await copyFile(source, target);
  console.log(`Prepared local Toph sidecar (${name}).`);
} catch {
  console.warn(`Local Toph binary '${name}' not found; local mode will be unavailable.`);
}
