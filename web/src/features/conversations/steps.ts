import type { NativeMessage } from "../agents/api";

interface ToolStepView {
  label: string;
  detail?: string;
  note?: string;
  input?: string;
  output?: string;
  error?: string;
}

const MASK = "••••";
const SECRET_WORDS = String.raw`(?:token|secret|password|passwd|pwd|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|credentials?)`;
const QUOTED_OR_WORD = String.raw`("[^"]*"|'[^']*'|[^\s;&|'"]+)`;
const TOKEN_SHAPES = [
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
];
const SECRET_RULES: Array<[RegExp, string | ((...match: string[]) => string)]> = [
  [/\b(authorization\s*[:=]\s*)(?:(bearer|basic|token)\s+)?[^\s"',}]+/gi, (_m, head, kind) => `${head}${kind ? `${kind} ` : ""}${MASK}`],
  [/\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${MASK}`],
  [new RegExp(String.raw`(--?[\w-]{0,40}${SECRET_WORDS})(\s+|=)${QUOTED_OR_WORD}`, "gi"), `$1$2${MASK}`],
  [new RegExp(String.raw`\b([A-Za-z_][\w.-]{0,40}?${SECRET_WORDS})(\s*=\s*)${QUOTED_OR_WORD}`, "gi"), `$1$2${MASK}`],
  [new RegExp(String.raw`(["']?[\w-]{0,40}${SECRET_WORDS}["']?\s*:\s*)("[^"]*"|'[^']*'|[^\s,}\]]+)`, "gi"), (_m, head, value) => {
    const quoted = value.startsWith('"') ? `"${MASK}"` : value.startsWith("'") ? `'${MASK}'` : MASK;
    return `${head}${quoted}`;
  }],
  [/(\b[a-z][a-z0-9+.-]{0,30}:\/\/[^\s:/@]+:)[^\s@/]+@/gi, `$1${MASK}@`],
];

/** Commands and outputs are shown on screen: mask what looks like a credential. */
export function maskSecrets(value: string): string {
  let text = value;
  for (const [pattern, replacement] of SECRET_RULES) text = text.replace(pattern, replacement as never);
  for (const shape of TOKEN_SHAPES) text = text.replace(shape, MASK);
  return text;
}

function clip(value: string, max = 4_000): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function parse(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function argsOf(message: NativeMessage): Record<string, unknown> {
  const detail = parse(message.detail);
  const fromDetail = parse(detail?.input);
  if (fromDetail) return fromDetail;
  return parse(message.content) ?? {};
}

function resultOf(message: NativeMessage): unknown {
  const detail = parse(message.detail);
  if (detail && "output" in detail) return detail.output;
  if (message.status === "running") return undefined;
  const parsed = parse(message.content);
  if (parsed) return parsed;
  return message.content;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.content === "string") return record.content;
    if (typeof record.stdout === "string" || typeof record.stderr === "string") {
      return [record.stdout, record.stderr].filter((part) => typeof part === "string").join("\n");
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function linesSummary(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return "Sem saída";
  if (lines.length <= 3) {
    const one = maskSecrets(lines.join(" · "));
    return one.length > 120 ? `${one.slice(0, 120)}…` : one;
  }
  return `${lines.length} linhas`;
}

function readSummary(value: unknown): string {
  const record = parse(value);
  if (record && typeof record.totalLines === "number") {
    return `${record.totalLines} ${record.totalLines === 1 ? "linha" : "linhas"}`;
  }
  return linesSummary(textOf(value));
}

function listSummary(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "item" : "itens"}`;
  const record = parse(value);
  if (record) {
    for (const key of ["items", "results", "rows", "data", "files", "matches"]) {
      if (Array.isArray(record[key])) return listSummary(record[key]);
    }
    for (const key of ["total", "count", "totalLines"]) {
      if (typeof record[key] === "number") return `${record[key]} itens`;
    }
  }
  return linesSummary(textOf(value));
}

function shellSummary(value: unknown): { output?: string; error?: string } {
  const record = parse(value);
  if (!record) return { output: linesSummary(textOf(value)) };
  if (typeof record.error === "string" && record.error.trim()) {
    return { error: maskSecrets(record.error.trim()) };
  }
  const code = typeof record.exitCode === "number" ? record.exitCode : 0;
  const stdout = typeof record.stdout === "string" ? record.stdout : "";
  const stderr = typeof record.stderr === "string" ? record.stderr : "";
  if (code === 0) {
    return { output: stdout.trim() ? linesSummary(stdout) : "Sem saída" };
  }
  const why = maskSecrets(stderr.split(/\r?\n/).filter((line) => line.trim()).slice(-1)[0] ?? stdout.split(/\r?\n/).filter((line) => line.trim()).slice(-1)[0] ?? "");
  return { error: `exit code ${code}${why ? `: ${why}` : ""}` };
}

function toolName(message: NativeMessage): string {
  return (message.title ?? "").toLowerCase().replace(/^toph[_-]/, "").replace(/^mcp__toph__/, "");
}

function stringArg(args: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function short(value: string, max = 140): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** What a tool call should read as in the agent's step list. */
export function toolStep(message: NativeMessage): ToolStepView {
  if (message.role === "reasoning") {
    return {
      label: "Pensou",
      note: message.content.trim() || undefined,
    };
  }
  const name = toolName(message);
  const args = argsOf(message);
  const result = resultOf(message);
  const path = stringArg(args, ["path", "file", "file_path", "filename"]);

  if (/shell|bash|exec|command|terminal/.test(name)) {
    const command = stringArg(args, ["command", "cmd", "script"]);
    const summary = message.status === "running" ? {} : shellSummary(result);
    return {
      label: "Rodou",
      detail: command ? short(maskSecrets(command).split(/\r?\n/)[0] ?? "") : undefined,
      input: command ? clip(maskSecrets(command)) : undefined,
      output: summary.output,
      error: summary.error,
    };
  }
  if (/read_file|read$/.test(name)) {
    return { label: "Leu", detail: path || undefined, output: message.status === "running" ? undefined : readSummary(result) };
  }
  if (/write_file|write$/.test(name)) {
    return { label: "Escreveu", detail: path || undefined };
  }
  if (/edit_file|edit|patch|apply/.test(name)) {
    return { label: "Editou", detail: path || undefined };
  }
  if (/delete_file|delete|remove/.test(name)) {
    return { label: "Removeu", detail: path || undefined };
  }
  if (/search_history/.test(name)) {
    return { label: "Consultou", detail: "o histórico" };
  }
  if (/search_memory/.test(name)) {
    return { label: "Consultou", detail: "a memória" };
  }
  if (/mcp_list/.test(name)) {
    return { label: "Listou", detail: stringArg(args, ["server"]) || "uma integração" };
  }
  if (/mcp_call/.test(name)) {
    const server = stringArg(args, ["server"]);
    const tool = stringArg(args, ["tool"]);
    return { label: "Usou", detail: [server, tool].filter(Boolean).join(" · ") || "uma integração" };
  }
  if (/search|grep|glob/.test(name)) {
    const query = stringArg(args, ["query", "pattern", "q", "search"]);
    return { label: "Pesquisou", detail: query ? short(query) : undefined, output: message.status === "running" ? undefined : listSummary(result) };
  }
  if (/list_files|list/.test(name)) {
    return { label: "Listou", detail: "arquivos do projeto", output: message.status === "running" ? undefined : listSummary(result) };
  }
  if (/fetch_url|fetch|http|url/.test(name)) {
    return { label: "Consultou", detail: stringArg(args, ["url", "href"]) || undefined };
  }
  if (/read_artifact/.test(name)) {
    return { label: "Leu", detail: "um anexo" };
  }
  if (/read_skill/.test(name)) {
    return { label: "Carregou", detail: stringArg(args, ["name"]) || "uma skill" };
  }
  if (/propose_skill/.test(name)) {
    return { label: "Propôs", detail: stringArg(args, ["name"]) || "uma skill" };
  }
  if (/delegate/.test(name)) {
    const agent = stringArg(args, ["agent"]);
    const busy = parse(result)?.busy === true;
    return {
      label: busy ? "Já estava respondendo" : "Passou para",
      detail: agent ? `@${agent.replace(/^@/, "")}` : "outro Toph",
    };
  }
  if (/generate_image/.test(name)) {
    return { label: "Gerou", detail: "uma imagem" };
  }
  if (/email_send/.test(name)) {
    return { label: "Enviou", detail: "um e-mail" };
  }
  if (/email_/.test(name)) {
    return { label: "Consultou", detail: "o e-mail" };
  }
  if (/remember/.test(name)) {
    return { label: "Salvou", detail: "uma memória do projeto" };
  }
  if (message.activity) {
    return { label: message.activity };
  }
  return { label: name.replace(/[_-]+/g, " ") || "Ferramenta" };
}

export function toolError(message: NativeMessage): string | undefined {
  if (message.status !== "error") return undefined;
  const result = resultOf(message);
  const record = parse(result);
  const text = record && typeof record.error === "string" ? record.error : textOf(result);
  return text.trim() ? maskSecrets(text.trim()) : undefined;
}

export function stepDuration(ms: number | undefined): string | undefined {
  if (!ms || ms < 1) return undefined;
  if (ms < 1_000) return "<1s";
  return `${(ms / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s`;
}
