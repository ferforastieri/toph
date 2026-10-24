import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const brand = resolve(root, "brand/generated");
const publicDir = resolve(root, "desktop/public");
const icons = resolve(root, "desktop/src-tauri/icons");

await mkdir(publicDir, { recursive: true });
await mkdir(icons, { recursive: true });
await Promise.all([
  copyFile(resolve(brand, "toph-mark.png"), resolve(publicDir, "toph-mark.png")),
  copyFile(resolve(brand, "favicon-32.png"), resolve(icons, "32x32.png")),
  copyFile(resolve(brand, "favicon-128.png"), resolve(icons, "128x128.png")),
  copyFile(resolve(brand, "favicon-256.png"), resolve(icons, "128x128@2x.png")),
  copyFile(resolve(brand, "favicon-256.png"), resolve(icons, "icon.png")),
  copyFile(resolve(brand, "favicon.ico"), resolve(icons, "icon.ico")),
]);
