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
import materialManifest from "material-icon-theme/dist/material-icons.json";
import type { IconTheme } from "../settings";

interface Props {
  name: string;
  path?: string;
  dir?: boolean;
  open?: boolean;
  iconTheme: IconTheme;
  size?: number;
}

interface MaterialManifest {
  fileNames: Record<string, string>;
  fileExtensions: Record<string, string>;
  folderNames: Record<string, string>;
  folderNamesExpanded: Record<string, string>;
  file: string;
  folder: string;
  folderExpanded: string;
  iconDefinitions: Record<string, { iconPath?: string }>;
}

const material = materialManifest as MaterialManifest;

function materialIconName(name: string, dir: boolean, open: boolean): string {
  const lower = name.toLowerCase();
  if (dir) {
    return (open ? material.folderNamesExpanded[lower] : material.folderNames[lower])
      ?? (open ? material.folderExpanded : material.folder);
  }
  const exact = material.fileNames[lower];
  if (exact) return exact;
  const dot = lower.lastIndexOf(".");
  if (dot >= 0) {
    const extension = material.fileExtensions[lower.slice(dot + 1)];
    if (extension) return extension;
  }
  return material.file;
}

function materialIconFile(name: string, dir: boolean, open: boolean): string {
  const definition = material.iconDefinitions[materialIconName(name, dir, open)];
  const path = definition?.iconPath ?? "file.svg";
  return path.split("/").pop() ?? "file.svg";
}

const vividColors: Record<string, string> = {
  js: "#f1e05a", jsx: "#61dafb", ts: "#3178c6", tsx: "#61dafb",
  json: "#cbcb41", md: "#519aba", mdx: "#519aba", css: "#a074c4",
  scss: "#c6538c", html: "#e34c26", vue: "#41b883", svelte: "#ff3e00",
  py: "#3572a5", go: "#00add8", rs: "#dea584", java: "#b07219",
  kt: "#a97bff", sql: "#e38c00", sh: "#89e051", yml: "#cb171e",
  yaml: "#cb171e", toml: "#9c4221", xml: "#e34c26", png: "#a074c4",
  jpg: "#a074c4", jpeg: "#a074c4", gif: "#a074c4", svg: "#ffb13b",
  db: "#e38c00", sqlite: "#e38c00", pdf: "#e34c26",
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
  if (iconTheme === "material") {
    return (
      <img
        src={`${import.meta.env.BASE_URL}material-icons/${materialIconFile(name, dir, open)}`}
        alt=""
        className={`${dir ? "folder-icon" : "file-icon"} material-file-icon`}
        style={{ width: size, height: size }}
      />
    );
  }
  const Icon = iconFor(name, dir, open);
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const color = iconTheme === "vivid"
    ? (dir ? "var(--primary)" : vividColors[ext] ?? "var(--info)")
    : iconTheme === "outline"
      ? "var(--muted-2)"
      : (dir ? "var(--primary)" : "var(--text-soft)");
  return <Icon size={size} className={`${dir ? "folder-icon" : "file-icon"} file-icon-theme-${iconTheme}`} color={color} />;
}
