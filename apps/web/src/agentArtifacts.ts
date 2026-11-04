export interface AgentImageArtifact {
  source: string;
  mime: string;
  name?: string;
}

export type AgentDiffLineKind = "context" | "add" | "remove" | "header";

export interface AgentDiffLine {
  kind: AgentDiffLineKind;
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface AgentDiffArtifact {
  title: string;
  lines: AgentDiffLine[];
  additions: number;
  deletions: number;
}

const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|gif|avif|bmp|svg)(?:[?#].*)?$/i;
const ANSI_ESCAPE = /\x1b\[[0-?]*[ -/]*[@-~]/g;

function cleanArtifactPath(value: string): string {
  return value.trim().replace(/^['"`(<:]+|['"`)>.,;:]+$/g, "");
}

function parseJson(value: string): unknown | null {
  const text = value.trim();
  if (!text || !["{", "["].includes(text[0])) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function parsedToolRecord(value?: string): Record<string, unknown> | null {
  if (!value) return null;
  const parsed = parseJson(value);
  return parsed && !Array.isArray(parsed) && typeof parsed === "object"
    ? parsed as Record<string, unknown>
    : null;
}

function looksLikeImage(source: string, mime = ""): boolean {
  return mime.startsWith("image/")
    || /^data:image\//i.test(source)
    || IMAGE_EXTENSION.test(source);
}

/** Extracts image files, data URIs and provider file parts from arbitrary tool output. */
export function extractAgentImages(...values: unknown[]): AgentImageArtifact[] {
  const images = new Map<string, AgentImageArtifact>();
  const add = (rawSource: string, mime = "", name?: string) => {
    const source = cleanArtifactPath(rawSource);
    if (!source || !looksLikeImage(source, mime)) return;
    const inferred = source.match(/^data:(image\/[^;]+)/i)?.[1] ?? "image/*";
    const existing = images.get(source);
    if (existing) {
      if (name && !existing.name) existing.name = name;
      if (mime && mime !== "image/*") existing.mime = mime;
      return;
    }
    images.set(source, { source, mime: mime || inferred, name });
  };

  const visit = (input: unknown, depth = 0) => {
    if (input == null || depth > 8) return;
    if (typeof input === "string") {
      // Large tool payloads are expensive to scan. Skip them fast when they
      // cannot contain an image reference.
      if (input.length > 50_000 && !/data:image\/|\.(?:png|jpe?g|webp|gif|avif|bmp|svg)\b|image_url|b64_json|image_base64/i.test(input)) return;
      const parsed = parseJson(input);
      if (parsed !== null) {
        visit(parsed, depth + 1);
        return;
      }

      const dataPattern = /data:(image\/[a-z0-9.+-]+);base64,[a-z0-9+/=\r\n]+/gi;
      let dataMatch: RegExpExecArray | null;
      while ((dataMatch = dataPattern.exec(input))) {
        add(dataMatch[0].replace(/\s+/g, ""), dataMatch[1] ?? "image/*");
      }

      const markdownPattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
      let markdownMatch: RegExpExecArray | null;
      while ((markdownMatch = markdownPattern.exec(input))) {
        add(markdownMatch[2] ?? "", "", markdownMatch[1] || undefined);
      }

      const htmlPattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
      let htmlMatch: RegExpExecArray | null;
      while ((htmlMatch = htmlPattern.exec(input))) add(htmlMatch[1] ?? "");

      const pathPattern = /(?:file:\/\/)?(?:[a-z]:[\\/]|\.{0,2}\/|\/)?[^\s'"`()<>\[\]{}]+\.(?:png|jpe?g|webp|gif|avif|bmp|svg)(?:[?#][^\s'"`()<>]*)?/gi;
      let pathMatch: RegExpExecArray | null;
      while ((pathMatch = pathPattern.exec(input))) add(pathMatch[0]);
      return;
    }
    if (Array.isArray(input)) {
      for (const item of input) visit(item, depth + 1);
      return;
    }
    if (typeof input !== "object") return;

    const item = input as Record<string, unknown>;
    const mime = String(item.mime ?? item.mimeType ?? item.media_type ?? "");
    const name = typeof item.name === "string" ? item.name : undefined;
    const imageTyped = item.type === "image" || item.type === "output_image" || item.type === "image_url";
    for (const key of ["uri", "url", "src", "path", "filePath", "file", "filename", "outputPath", "output_path"]) {
      if (typeof item[key] === "string") add(String(item[key]), mime || (imageTyped ? "image/png" : ""), name);
    }
    if (typeof item.image_url === "string") add(item.image_url, mime || "image/png", name);
    if (item.image_url && typeof item.image_url === "object" && typeof (item.image_url as Record<string, unknown>).url === "string") {
      add(String((item.image_url as Record<string, unknown>).url), mime || "image/png", name);
    }
    const base64 = item.b64_json ?? item.image_base64 ?? item.base64 ?? (mime.startsWith("image/") ? item.data : undefined);
    if (typeof base64 === "string" && (mime.startsWith("image/") || item.type === "image" || item.type === "output_image")) {
      add(`data:${mime || "image/png"};base64,${base64.replace(/\s+/g, "")}`, mime || "image/png", name);
    }
    const handled = new Set(["uri", "url", "src", "path", "filePath", "file", "filename", "outputPath", "output_path", "image_url", "name", "mime", "mimeType", "media_type", "b64_json", "image_base64", "base64", "data"]);
    for (const [key, nested] of Object.entries(item)) {
      if (!handled.has(key)) visit(nested, depth + 1);
    }
  };

  for (const value of values) visit(value);
  return [...images.values()];
}

function recordString(record: Record<string, unknown> | null, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return "";
}

function compactContext(lines: AgentDiffLine[]): AgentDiffLine[] {
  const result: AgentDiffLine[] = [];
  let index = 0;
  while (index < lines.length) {
    if (lines[index]?.kind !== "context") {
      result.push(lines[index]);
      index += 1;
      continue;
    }
    let end = index;
    while (end < lines.length && lines[end]?.kind === "context") end += 1;
    const run = lines.slice(index, end);
    if (run.length > 8) {
      result.push(...run.slice(0, 3));
      result.push({ kind: "header", text: `… ${run.length - 6} linhas sem alterações …` });
      result.push(...run.slice(-3));
    } else {
      result.push(...run);
    }
    index = end;
  }
  return result;
}

function diffText(before: string, after: string): AgentDiffLine[] {
  const oldLines = before === "" ? [] : before.replace(/\r\n/g, "\n").split("\n");
  const newLines = after === "" ? [] : after.replace(/\r\n/g, "\n").split("\n");
  if (oldLines.length * newLines.length > 120_000) {
    return [
      ...oldLines.map((text, index) => ({ kind: "remove" as const, text, oldLine: index + 1 })),
      ...newLines.map((text, index) => ({ kind: "add" as const, text, newLine: index + 1 })),
    ];
  }

  const rows = oldLines.length + 1;
  const columns = newLines.length + 1;
  const lcs = new Uint32Array(rows * columns);
  const at = (oldIndex: number, newIndex: number) => oldIndex * columns + newIndex;
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      lcs[at(oldIndex, newIndex)] = oldLines[oldIndex] === newLines[newIndex]
        ? lcs[at(oldIndex + 1, newIndex + 1)] + 1
        : Math.max(lcs[at(oldIndex + 1, newIndex)], lcs[at(oldIndex, newIndex + 1)]);
    }
  }

  const lines: AgentDiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      lines.push({ kind: "context", text: oldLines[oldIndex] ?? "", oldLine: oldIndex + 1, newLine: newIndex + 1 });
      oldIndex += 1;
      newIndex += 1;
    } else if (lcs[at(oldIndex + 1, newIndex)] >= lcs[at(oldIndex, newIndex + 1)]) {
      lines.push({ kind: "remove", text: oldLines[oldIndex] ?? "", oldLine: oldIndex + 1 });
      oldIndex += 1;
    } else {
      lines.push({ kind: "add", text: newLines[newIndex] ?? "", newLine: newIndex + 1 });
      newIndex += 1;
    }
  }
  while (oldIndex < oldLines.length) {
    lines.push({ kind: "remove", text: oldLines[oldIndex] ?? "", oldLine: oldIndex + 1 });
    oldIndex += 1;
  }
  while (newIndex < newLines.length) {
    lines.push({ kind: "add", text: newLines[newIndex] ?? "", newLine: newIndex + 1 });
    newIndex += 1;
  }
  return compactContext(lines);
}

function looksLikePatch(value: string): boolean {
  return /(^|\n)(?:diff --git |@@ |@@$|\*\*\* (?:Begin Patch|Update File:|Add File:|Delete File:)|---\s.+\n\+\+\+\s)/m.test(value);
}

function patchLines(value: string): AgentDiffLine[] {
  const clean = value.replace(ANSI_ESCAPE, "").replace(/\r\n/g, "\n");
  const starts = [clean.indexOf("diff --git "), clean.indexOf("*** Begin Patch"), clean.search(/^@@(?:\s|$)/m)].filter((index) => index >= 0);
  const patch = starts.length > 0 ? clean.slice(Math.min(...starts)) : clean;
  const lines: AgentDiffLine[] = [];
  let oldLine: number | undefined;
  let newLine: number | undefined;
  for (const raw of patch.split("\n")) {
    const hunk = raw.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      lines.push({ kind: "header", text: raw });
      continue;
    }
    if (/^(?:diff --git |index |--- |\+\+\+ |\*\*\* |@@$|\\ No newline)/.test(raw)) {
      lines.push({ kind: "header", text: raw });
      continue;
    }
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      lines.push({ kind: "add", text: raw.slice(1), newLine });
      if (newLine !== undefined) newLine += 1;
      continue;
    }
    if (raw.startsWith("-") && !raw.startsWith("---")) {
      lines.push({ kind: "remove", text: raw.slice(1), oldLine });
      if (oldLine !== undefined) oldLine += 1;
      continue;
    }
    const text = raw.startsWith(" ") ? raw.slice(1) : raw;
    lines.push({ kind: "context", text, oldLine, newLine });
    if (oldLine !== undefined) oldLine += 1;
    if (newLine !== undefined) newLine += 1;
  }
  return lines;
}

function artifact(title: string, lines: AgentDiffLine[]): AgentDiffArtifact | null {
  const additions = lines.filter((line) => line.kind === "add").length;
  const deletions = lines.filter((line) => line.kind === "remove").length;
  if (additions === 0 && deletions === 0) return null;
  return { title: title || "Alterações", lines, additions, deletions };
}

/** Normalizes OpenCode, OpenAI-compatible and patch-tool payloads into real diff lines. */
export function extractAgentDiffs(toolName: string, inputText?: string, detailText?: string): AgentDiffArtifact[] {
  const input = parsedToolRecord(inputText);
  const detail = parsedToolRecord(detailText);
  const structuredChanges = (detail?.changes ?? detail?.fileChanges) as unknown;
  if (Array.isArray(structuredChanges)) {
    const changes = structuredChanges.flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const change = raw as Record<string, unknown>;
      const before = String(change.before ?? change.original ?? "");
      const after = String(change.after ?? change.modified ?? "");
      const title = String(change.path ?? change.filePath ?? "Alterações");
      const result = artifact(title, diffText(before, after));
      return result ? [result] : [];
    });
    if (changes.length > 0) return changes;
  }

  const patchCandidates = [
    recordString(input, ["patch", "diff", "unifiedDiff", "patchText"]),
    inputText ?? "",
    recordString(detail, ["patch", "diff", "unifiedDiff", "patchText"]),
    detailText ?? "",
  ];
  const patch = patchCandidates.find((candidate) => candidate && looksLikePatch(candidate));
  if (patch) {
    const patchFiles = [...patch.matchAll(/^diff --git\s+a\/(.+?)\s+b\/(.+)$/gm)].map((match) => match[2] ?? match[1]).filter(Boolean);
    const title = patchFiles.length > 1
      ? `${patchFiles.length} arquivos alterados`
      : recordString(input, ["filePath", "path", "file", "filename"])
        || patchFiles[0]
        || patch.match(/^\*\*\* (?:Update|Add|Delete) File:\s*(.+)$/m)?.[1]
        || patch.match(/^\+\+\+\s+(?:b\/)?(.+)$/m)?.[1]
        || "Alterações";
    const result = artifact(title, patchLines(patch));
    return result ? [result] : [];
  }

  const before = recordString(input, ["oldString", "old_string", "oldText", "before", "original", "originalContent", "previous"]);
  const after = recordString(input, ["newString", "new_string", "newText", "after", "modified", "newContent"]);
  const writeContent = recordString(input, ["content", "text"]);
  const editTool = /edit|write|patch|apply|replace|create/i.test(toolName);
  if (!editTool || (!before && !after && !writeContent)) return [];
  const title = recordString(input, ["filePath", "path", "file", "filename"]) || "Alterações";
  const result = artifact(title, diffText(before, after || writeContent));
  return result ? [result] : [];
}

/** Finds files a mutating agent tool is about to change so callers can snapshot them. */
export function extractAgentFilePaths(toolName: string, inputText?: string): string[] {
  if (!/edit|write|patch|apply|replace|create|delete|move|rename/i.test(toolName)) return [];
  const paths = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    let path = cleanArtifactPath(value).replace(/^file:\/\//i, "").replace(/\\/g, "/");
    if (/^[ab]\//.test(path)) path = path.slice(2);
    if (path && !path.includes("\n") && !path.includes("\0")) paths.add(path);
  };
  const input = parsedToolRecord(inputText);
  if (input) {
    for (const key of ["filePath", "path", "file", "filename", "outputPath", "output_path", "targetPath", "target_path", "sourcePath", "source_path", "oldPath", "old_path", "newPath", "new_path", "from", "to"]) add(input[key]);
  }
  const patch = [
    recordString(input, ["patch", "diff", "unifiedDiff", "patchText"]),
    inputText ?? "",
  ].find((candidate) => candidate && looksLikePatch(candidate));
  if (patch) {
    const pattern = /^(?:\*\*\* (?:Update|Add|Delete) File:|\+\+\+|---)\s+(?:[ab]\/)?(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(patch))) {
      if (match[1] !== "/dev/null") add(match[1] ?? "");
    }
  }
  return [...paths];
}
