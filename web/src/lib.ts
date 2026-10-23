export function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

export function languageFor(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const languages: Record<string, string> = {
    go: "go",
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    jsonc: "json",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    htm: "html",
    md: "markdown",
    mdx: "markdown",
    py: "python",
    rb: "ruby",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    c: "c",
    h: "c",
    cpp: "cpp",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
    sql: "sql",
    xml: "xml",
    svg: "xml",
    dockerfile: "dockerfile",
    makefile: "makefile",
  };
  if (path.toLowerCase().endsWith("dockerfile")) return "dockerfile";
  if (path.toLowerCase().endsWith("makefile")) return "makefile";
  return languages[extension] ?? "plaintext";
}

export function quoteIdentifier(driver: string, schema: string, table: string): string {
  switch (driver) {
    case "mysql":
      return `\`${schema}\`.\`${table}\``;
    case "sqlite":
      return `"${table}"`;
    case "mssql":
      return `[${schema}].[${table}]`;
    default:
      return `"${schema}"."${table}"`;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function relativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "unknown";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function expandGitPattern(
  pattern: string,
  values: { repo: string; branch: string; user: string },
): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const tokens: Record<string, string> = {
    date,
    time,
    datetime: `${date}-${time}`,
    repo: values.repo,
    branch: values.branch || "main",
    user: values.user || "user",
  };
  return pattern.replace(/\{(date|time|datetime|repo|branch|user)\}/g, (_, key: string) => tokens[key] ?? "");
}

export function sanitizeBranchName(value: string): string {
  const cleaned = value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[~^:?*\\[\]]+/g, "-")
    .replace(/\.\.+/g, ".")
    .replace(/\/{2,}/g, "/")
    .replace(/^[-./]+|[-./]+$/g, "")
    .replace(/\.lock$/i, "");
  return cleaned || "feature/update";
}
