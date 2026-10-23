import {
  BookOpen,
  Braces,
  Container,
  Database,
  FileCode2,
  FileJson,
  FileText,
  FileType,
  Folder,
  FolderOpen,
  GitBranch,
  Image,
  Lock,
  Package,
  Settings,
} from "lucide-react";
import type { IconTheme } from "../settings";

interface Props {
  name: string;
  path?: string;
  dir?: boolean;
  open?: boolean;
  iconTheme: IconTheme;
  size?: number;
}

const materialColors: Record<string, string> = {
  js: "#f1e05a", jsx: "#61dafb", ts: "#3178c6", tsx: "#61dafb",
  json: "#cbcb41", md: "#519aba", mdx: "#519aba", css: "#a074c4",
  scss: "#c6538c", html: "#e34c26", vue: "#41b883", svelte: "#ff3e00",
  py: "#3572a5", go: "#00add8", rs: "#dea584", java: "#b07219",
  kt: "#a97bff", kts: "#a97bff", sql: "#e38c00", sh: "#89e051",
  yml: "#cb171e", yaml: "#cb171e", toml: "#9c4221", xml: "#e34c26",
  png: "#a074c4", jpg: "#a074c4", jpeg: "#a074c4", gif: "#a074c4",
  svg: "#ffb13b", ico: "#a074c4", lock: "#f1e05a", env: "#faf08b",
  dockerfile: "#2496ed", db: "#e38c00", sqlite: "#e38c00", pdf: "#e34c26",
};

function iconFor(name: string, dir: boolean, open: boolean) {
  if (dir) return open ? FolderOpen : Folder;
  const lower = name.toLowerCase();
  if (lower === "dockerfile") return Container;
  if (lower === ".gitignore" || lower === ".gitattributes") return GitBranch;
  if (lower === "package.json" || lower === "package-lock.json" || lower === "pnpm-lock.yaml") return Package;
  if (lower === ".env" || lower.startsWith(".env.")) return Lock;
  if (lower.endsWith(".json")) return FileJson;
  if (lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".txt")) return BookOpen;
  if (lower.endsWith(".yml") || lower.endsWith(".yaml") || lower.endsWith(".toml")) return Settings;
  if (["js", "jsx", "ts", "tsx", "vue", "svelte"].some((ext) => lower.endsWith(`.${ext}`))) return Braces;
  if (["css", "scss", "less", "html", "xml"].some((ext) => lower.endsWith(`.${ext}`))) return FileType;
  if (["png", "jpg", "jpeg", "gif", "svg", "ico", "webp"].some((ext) => lower.endsWith(`.${ext}`))) return Image;
  if (["sql", "db", "sqlite"].some((ext) => lower.endsWith(`.${ext}`))) return Database;
  if (["sh", "bash", "zsh", "fish"].some((ext) => lower.endsWith(`.${ext}`))) return FileCode2;
  return FileText;
}

export default function FileIcon({ name, dir = false, open = false, iconTheme, size = 15 }: Props) {
  const Icon = iconTheme === "toph"
    ? dir ? (open ? FolderOpen : Folder) : FileCode2
    : iconFor(name, dir, open);
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const color = iconTheme === "material"
    ? (dir ? "#7c9bff" : materialColors[ext] ?? materialColors[name.toLowerCase()] ?? "#a3aa99")
    : undefined;
  return <Icon size={size} className={`${dir ? "folder-icon" : "file-icon"} file-icon-theme-${iconTheme}`} color={color} />;
}
