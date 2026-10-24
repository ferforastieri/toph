import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const source = resolve(root, "packages/brand/assets");
const webBrand = resolve(root, "apps/web/public/brand");
const landingBrand = resolve(root, "apps/landing/public/brand");
const desktopPublic = resolve(root, "apps/desktop/public");
const desktopIcons = resolve(root, "apps/desktop/src-tauri/icons");

const brandTargets = [webBrand, landingBrand];
for (const target of brandTargets) {
  await mkdir(target, { recursive: true });
  await Promise.all([
    copyFile(resolve(source, "generated/toph-mark.png"), resolve(target, "toph-mark.png")),
    copyFile(resolve(source, "logo/toph-logo-horizontal.png"), resolve(target, "toph-logo-horizontal.png")),
    copyFile(resolve(source, "generated/favicon.ico"), resolve(target, "favicon.ico")),
    copyFile(resolve(source, "generated/favicon-32.png"), resolve(target, "favicon-32.png")),
    copyFile(resolve(source, "generated/favicon-64.png"), resolve(target, "favicon-64.png")),
  ]);
}

await mkdir(desktopPublic, { recursive: true });
await mkdir(desktopIcons, { recursive: true });
await Promise.all([
  copyFile(resolve(source, "generated/toph-mark.png"), resolve(desktopPublic, "toph-mark.png")),
  copyFile(resolve(source, "generated/favicon-32.png"), resolve(desktopIcons, "32x32.png")),
  copyFile(resolve(source, "generated/favicon-128.png"), resolve(desktopIcons, "128x128.png")),
  copyFile(resolve(source, "generated/favicon-256.png"), resolve(desktopIcons, "128x128@2x.png")),
  copyFile(resolve(source, "generated/favicon-256.png"), resolve(desktopIcons, "icon.png")),
  copyFile(resolve(source, "generated/favicon.ico"), resolve(desktopIcons, "icon.ico")),
]);
console.log("brand assets synchronized");
