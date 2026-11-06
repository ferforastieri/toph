import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { gzipSync } from "node:zlib";

const dist = resolve(import.meta.dirname, "../web/dist");
const html = readFileSync(join(dist, "index.html"), "utf8");
const sources = [];
for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/g)) {
  if (!/type="module"|rel="modulepreload"/.test(tag)) continue;
  const url = /(?:src|href)="([^"]+)"/.exec(tag)?.[1];
  if (url?.startsWith("/app/")) sources.push(url.slice("/app/".length));
}
const initial = [...new Set(sources)].map((path) => {
  const bytes = readFileSync(join(dist, path));
  return { path, bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
});
const assets = readdirSync(join(dist, "assets"));
console.log(JSON.stringify({
  initial,
  initialJsBytes: initial.reduce((sum, file) => sum + file.bytes, 0),
  initialGzipBytes: initial.reduce((sum, file) => sum + file.gzipBytes, 0),
  allJsBytes: assets.filter((name) => name.endsWith(".js")).reduce((sum, name) => sum + readFileSync(join(dist, "assets", name)).length, 0),
  sourceMapFiles: assets.filter((name) => name.endsWith(".map")).length,
}, null, 2));
