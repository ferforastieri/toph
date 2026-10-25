export interface GitChange {
  path: string;
  index: string;
  worktree: string;
  staged: boolean;
  unstaged: boolean;
}

export function parseGitStatus(raw: string): { branch: string; changes: GitChange[] } {
  let branch = "";
  const changes: GitChange[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    if (line.startsWith("## ")) {
      branch = line.slice(3).split("...")[0].split(" ")[0] ?? "";
      continue;
    }
    if (line.length < 4) continue;
    const index = line[0];
    const worktree = line[1];
    let path = line.slice(3);
    if (path.includes(" -> ")) path = path.split(" -> ").pop() ?? path;
    path = path.replace(/^"|"$/g, "");
    if (!path) continue;
    changes.push({
      path,
      index,
      worktree,
      staged: index !== " " && index !== "?",
      unstaged: worktree !== " " || index === "?",
    });
  }
  return { branch, changes };
}

export function statusLabel(change: GitChange): string {
  if (change.index === "?") return "U";
  if (change.index !== " ") return change.index;
  return change.worktree.trim() || "M";
}

export function changeStatusByPath(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const change of parseGitStatus(raw).changes) {
    const next = statusLabel(change);
    const current = map.get(change.path);
    if (!current || current === "U") map.set(change.path, next);
  }
  return map;
}
