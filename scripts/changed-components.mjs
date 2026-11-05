#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const base = process.env.BASE_REF?.trim() || "";
const head = process.env.HEAD_REF?.trim() || "HEAD";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function filesSinceBase() {
  if (!base) return git(["ls-files"]).split("\n").filter(Boolean);
  try {
    return git(["diff", "--name-only", `${base}..${head}`]).split("\n").filter(Boolean);
  } catch {
    return git(["ls-files"]).split("\n").filter(Boolean);
  }
}

const files = filesSinceBase();
const has = (predicate) => files.some(predicate);
const anyPrefix = (...prefixes) => has((file) => prefixes.some((prefix) => file.startsWith(prefix)));

const web = anyPrefix(
  "apps/web/",
  "packages/",
) || files.some((file) =>
  ["package.json", "package-lock.json", "tsconfig.json", "vite.config.ts"].includes(file),
);

const backend = anyPrefix(
  "services/toph/",
  "apps/web/",
  "packages/",
) || files.some((file) =>
  ["package.json", "package-lock.json"].includes(file),
);

// The server embeds the web bundle, so a web change requires a server rebuild.
const server = backend || web;

const client = anyPrefix(
  "apps/client/",
  "packages/",
) || files.some((file) =>
  ["package.json", "package-lock.json"].includes(file),
);

// The mobile and desktop clients are thin shells around the server web app.
// They do not need a rebuild when only the web UI or backend changes.
const android = client;
const desktop = client;
const landing = anyPrefix("landing-page/");
const installer = files.includes("install.sh");
const releasable = server || android || desktop || installer;

const outputs = {
  server: String(server),
  web: String(web),
  android: String(android),
  desktop: String(desktop),
  landing: String(landing),
  installer: String(installer),
  releasable: String(releasable),
  files: String(files.length),
};

for (const [key, value] of Object.entries(outputs)) {
  console.log(`${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
