import { Icon, type IconName } from "@toph/ui";

interface Props {
  name: string;
  path?: string;
  dir?: boolean;
  open?: boolean;
  size?: number;
}

/** The kit's own file marks: a folder, a sheet, code, a table, an image. No other icon set. */
function glyphFor(name: string, dir: boolean): IconName {
  if (dir) return "archiveBox";
  const lower = name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/.test(lower)) return "image";
  if (/\.(ts|tsx|js|jsx|mjs|cjs|css|scss|html|json|toml|yaml|yml|rs|py|go|java|sh|sql)$/.test(lower)) return "code";
  if (/\.(md|mdx|txt|rst|log)$/.test(lower)) return "document";
  if (/\.(csv|tsv|xls|xlsx)$/.test(lower)) return "table";
  if (/\.(db|sqlite|sqlite3|duckdb)$/.test(lower)) return "database";
  return "document";
}

export default function FileIcon({ name, dir = false, size }: Props) {
  const px = size === 14 || size === 16 || size === 18 || size === 20 ? size : 16;
  return <Icon name={glyphFor(name, dir)} size={px} className="shrink-0 text-foreground-icon-tertiary" />;
}
