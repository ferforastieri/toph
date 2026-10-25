import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const app = resolve(import.meta.dirname, "..");
const source = resolve(app, "android", "MainActivity.kt");
const targetDir = resolve(
  app,
  "src-tauri/gen/android/app/src/main/java/br/com/ferforastieri/toph",
);
const target = resolve(targetDir, "MainActivity.kt");
await mkdir(targetDir, { recursive: true });
await copyFile(source, target);
console.log("Android MainActivity patched for APK downloads.");
