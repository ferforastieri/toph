import {
} from "@toph/icons";
import materialManifest from "material-icon-theme/dist/material-icons.json";

interface Props {
  name: string;
  path?: string;
  dir?: boolean;
  open?: boolean;

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

export default function FileIcon({ name, dir = false, open = false, size = 15 }: Props) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}material-icons/${materialIconFile(name, dir, open)}`}
      alt=""
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}
