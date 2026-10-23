import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const source = resolve(root, "brand");
const targets = [
  resolve(root, "web/app/public/brand"),
  resolve(root, "web/landing/public/brand"),
];

for (const target of targets) {
  await mkdir(target, { recursive: true });
  await Promise.all([
    copyFile(resolve(source, "generated/toph-mark.png"), resolve(target, "toph-mark.png")),
    copyFile(resolve(source, "logo/toph-logo-horizontal.png"), resolve(target, "toph-logo-horizontal.png")),
    copyFile(resolve(source, "generated/favicon.ico"), resolve(target, "favicon.ico")),
    copyFile(resolve(source, "generated/favicon-32.png"), resolve(target, "favicon-32.png")),
    copyFile(resolve(source, "generated/favicon-64.png"), resolve(target, "favicon-64.png")),
  ]);
}
