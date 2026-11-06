import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve(import.meta.dirname, "../src-tauri/android-round");
const res = resolve(import.meta.dirname, "../src-tauri/gen/android/app/src/main/res");

for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
  const from = resolve(source, `${density}.png`);
  const to = resolve(res, `mipmap-${density}/ic_launcher_round.png`);
  if (existsSync(from) && existsSync(resolve(res, `mipmap-${density}`))) {
    copyFileSync(from, to);
    console.log(`patched mipmap-${density}/ic_launcher_round.png`);
  }
}
