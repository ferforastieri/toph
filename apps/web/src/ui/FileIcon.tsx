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
} from "@toph/icons";
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

function baseName(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.split("/").pop() || normalized;
}

function materialIconName(name: string, dir: boolean, open: boolean): string {
  const lower = baseName(name).toLowerCase();
  if (dir) {
    return (open ? material.folderNamesExpanded[lower] : material.folderNames[lower])
      ?? (open ? material.folderExpanded : material.folder);
  }
  const exact = material.fileNames[lower];
  if (exact) return exact;
  // Material Icon Theme supports compound suffixes such as d.ts, test.ts,
  // schema.json and routing.tsx. Try the longest suffix first.
  const parts = lower.split(".");
  for (let index = 0; index < parts.length; index += 1) {
    const extension = material.fileExtensions[parts.slice(index).join(".")];
    if (extension) return extension;
  }
  return material.file;
}

function materialIconFile(name: string, dir: boolean, open: boolean): string {
  const definition = material.iconDefinitions[materialIconName(name, dir, open)];
  const path = definition?.iconPath ?? "file.svg";
  return path.split("/").pop() ?? "file.svg";
}

function iconFor(name: string, dir: boolean, open: boolean) {
  if (dir) return open ? FolderOpen : Folder;
  const lower = baseName(name).toLowerCase();
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
  const color = dir ? "var(--primary)" : "var(--text-soft)";
  return <Icon size={size} className={`${dir ? "folder-icon" : "file-icon"} file-icon-theme-${iconTheme}`} color={color} />;
}
