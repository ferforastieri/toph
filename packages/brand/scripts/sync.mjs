import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const source = resolve(root, "packages/brand/assets");
const webBrand = resolve(root, "apps/web/public/brand");
const landingBrand = resolve(root, "apps/landing/public/brand");
const desktopPublic = resolve(root, "apps/client/public");

const brandTargets = [webBrand, landingBrand];
for (const target of brandTargets) {
  await mkdir(target, { recursive: true });
  await Promise.all([
    copyFile(resolve(source, "generated/toph-mark.png"), resolve(target, "toph-mark.png")),
    copyFile(resolve(source, "app-icons/toph-1024.png"), resolve(target, "toph-app-icon.png")),
    copyFile(resolve(source, "logo/toph-logo-horizontal.png"), resolve(target, "toph-logo-horizontal.png")),
    copyFile(resolve(source, "generated/favicon-16.png"), resolve(target, "favicon-16.png")),
    copyFile(resolve(source, "generated/favicon-32.png"), resolve(target, "favicon-32.png")),
    copyFile(resolve(source, "generated/favicon-48.png"), resolve(target, "favicon-48.png")),
    copyFile(resolve(source, "generated/favicon-64.png"), resolve(target, "favicon-64.png")),
    copyFile(resolve(source, "generated/favicon.ico"), resolve(target, "favicon.ico")),
    copyFile(resolve(source, "generated/apple-touch-icon.png"), resolve(target, "apple-touch-icon.png")),
    copyFile(resolve(source, "banner/toph-banner-1500x500.png"), resolve(target, "toph-banner-1500x500.png")),
    copyFile(resolve(source, "banner/toph-og-1200x630.png"), resolve(target, "toph-og-1200x630.png")),
  ]);
}

await mkdir(desktopPublic, { recursive: true });
await Promise.all([
  copyFile(resolve(source, "generated/toph-mark.png"), resolve(desktopPublic, "toph-mark.png")),
  copyFile(resolve(source, "app-icons/toph-1024.png"), resolve(desktopPublic, "toph-app-icon.png")),
]);

// Tauri desktop and Android icons are generated from src-tauri/icons.json with
// `npm run icons --workspace @toph/client`. Keeping that step separate lets the
// Android target refresh its adaptive launcher icon after `tauri android init`.

console.log("brand assets synchronized");
