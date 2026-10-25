#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function output(values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
  } else {
    console.log(lines.join("\n"));
  }
}

const tags = git(["tag", "--list", "v*", "--sort=-v:refname"])
  .split("\n")
  .map((tag) => tag.trim())
  .filter(Boolean);
const latestTag = tags[0] ?? "";
const tagsAtHead = git(["tag", "--points-at", "HEAD", "--list", "v*"])
  .split("\n")
  .map((tag) => tag.trim())
  .filter(Boolean);

if (tagsAtHead.length > 0) {
  output({ release: "false", reason: `HEAD is already tagged ${tagsAtHead.join(", ")}` });
  process.exit(0);
}

const range = latestTag ? `${latestTag}..HEAD` : "HEAD";
const messages = git(["log", range, "--format=%B%x00"])
  .split("\x00")
  .map((message) => message.trim())
  .filter(Boolean);

if (messages.length === 0) {
  output({ release: "false", reason: `no commits since ${latestTag || "the start"}` });
  process.exit(0);
}

let bump = "patch";
for (const message of messages) {
  const subject = message.split("\n")[0] ?? "";
  const breaking =
    /^[a-z]+(?:\([^)]*\))?!:/i.test(subject) ||
    /(^|\n)BREAKING[ -]CHANGE:/.test(message);
  if (breaking) {
    bump = "major";
    continue;
  }
  if (/^feat(?:\([^)]*\))?:/i.test(subject) && bump !== "major") {
    bump = "minor";
  }
}

const match = /^v?([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(latestTag);
const [major, minor, patch] = match
  ? [Number(match[1]), Number(match[2]), Number(match[3])]
  : [0, 0, 0];

let version;
if (bump === "major") version = `${major + 1}.0.0`;
else if (bump === "minor") version = `${major}.${minor + 1}.0`;
else version = `${major}.${minor}.${patch + 1}`;

output({
  release: "true",
  version,
  tag: `v${version}`,
  bump,
  base: latestTag || "none",
  commits: String(messages.length),
});
