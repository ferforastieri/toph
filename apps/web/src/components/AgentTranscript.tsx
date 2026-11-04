import { memo, useEffect, useMemo, useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ChevronDown, CircleAlert, Copy, Image, LoaderCircle, X } from "@toph/icons";
import { api, getApiBase } from "../api";
import type { AiMessage } from "../store";
import { extractAgentDiffs, extractAgentImages, parsedToolRecord, type AgentDiffArtifact, type AgentImageArtifact } from "../agentArtifacts";
import { Button } from "@/boardui/base/buttons/button";
import { Chip } from "@/boardui/base/badges/chip";
import AgentQuestionCard, { parseAgentQuestions } from "./AgentQuestionCard";

interface Props {
  messages: AiMessage[];
  streaming: boolean;
  onPermission?: (messageId: string, permissionId: string, decision: "once" | "always" | "reject") => void;
  className?: string;
  toolsExpanded?: boolean;
  projectId?: string;
  projectRoot?: string;
  onQuestion?: (messageId: string, answer: string) => void | Promise<void>;
  /** Renders assistant text inside a speech bubble, like a chat reply. */
  bubble?: boolean;
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="my-2 text-[14px] leading-[1.65] text-text-primary">{children}</p>,
  h1: ({ children }) => <h1 className="mt-5 mb-2 text-[16px] font-semibold leading-snug text-text-primary">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-5 mb-2 text-[16px] font-semibold leading-snug text-text-primary">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-1.5 text-[15px] font-semibold leading-snug text-text-primary">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-3 mb-1 text-[14px] font-semibold leading-snug text-text-primary">{children}</h4>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 text-[14px] leading-[1.6] text-text-primary marker:text-text-tertiary">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 text-[14px] leading-[1.6] text-text-primary marker:text-text-tertiary">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => <a href={href} className="text-accent-500 underline underline-offset-2 hover:text-accent-400" target="_blank" rel="noreferrer">{children}</a>,
  img: ({ src, alt }) => src ? (
    <a href={src} target="_blank" rel="noreferrer" className="my-2 block w-fit max-w-full">
      <img src={src} alt={alt ?? "Imagem"} loading="lazy" onError={(event) => { const wrapper = event.currentTarget.closest("a"); if (wrapper instanceof HTMLElement) wrapper.style.display = "none"; }} className="max-h-[420px] max-w-full rounded-xl border border-border-button-default bg-background-secondary-default object-contain" />
    </a>
  ) : null,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-accent-500/40 pl-3 text-text-secondary">{children}</blockquote>,
  hr: () => <hr className="my-3 border-separator-border" />,
  code: ({ node: _node, className, children, ...props }) => {
    const block = Boolean(className?.includes("language-"));
    return (
      <code
        className={block
          ? "font-mono text-[12px] leading-relaxed text-text-primary"
          : "rounded bg-background-tertiary-default px-1 py-0.5 font-mono text-[12px] text-text-primary"}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2.5 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-background-secondary-default p-3 text-[12px] leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2.5 max-w-full overflow-x-auto rounded-lg border border-border-button-default">
      <table className="w-full border-collapse text-left text-[12.5px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-separator-border px-2 py-1.5 font-semibold text-text-primary">{children}</th>,
  td: ({ children }) => <td className="border-b border-separator-border px-2 py-1.5 text-text-secondary last:border-0">{children}</td>,
};

interface MessageProps {
  message: AiMessage;
  showCaret: boolean;
  onPermission?: (messageId: string, permissionId: string, decision: "once" | "always" | "reject") => void;
  toolsExpanded?: boolean;
  projectId?: string;
  projectRoot?: string;
  onQuestion?: (messageId: string, answer: string) => void | Promise<void>;
  bubble?: boolean;
}

export interface ResolvedAgentImage extends AgentImageArtifact {
  uri: string;
}

function resolveImageSource(source: string, projectId?: string, projectRoot?: string): string {
  if (/^(?:data:|https?:|blob:)/i.test(source)) return source;
  if (source.startsWith("/api/")) return `${getApiBase()}${source}`;
  if (!projectId) return source;
  let path = source.replace(/^file:\/\//i, "").replace(/\\/g, "/");
  const root = projectRoot?.replace(/\\/g, "/").replace(/\/+$/, "") ?? "";
  if (root && path.startsWith(`${root}/`)) path = path.slice(root.length + 1);
  else if (/^(?:[a-z]:\/|\/)/i.test(path)) return "";
  path = path.replace(/^\.\//, "");
  return path ? api.rawUrl(projectId, path) : source;
}

const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g;

/** Rewrite image targets inside markdown so relative project paths and
 * `/api/...` URLs work in both the web app and the desktop webview. */
export function resolveMarkdownImages(text: string, projectId?: string, projectRoot?: string): string {
  if (!text.includes("![")) return text;
  return text.replace(MARKDOWN_IMAGE, (match, alt: string, source: string, title: string | undefined) => {
    const resolved = resolveImageSource(source, projectId, projectRoot);
    return resolved === source ? match : `![${alt}](${resolved}${title ?? ""})`;
  });
}

export function agentImagesForMessages(messages: AiMessage[], projectId?: string, projectRoot?: string): ResolvedAgentImage[] {
  return extractAgentImages(...messages.flatMap((message) => [message.text, message.detail]))
    .map((image) => ({ ...image, uri: resolveImageSource(image.source, projectId, projectRoot) }))
    .filter((image) => Boolean(image.uri));
}

function imageLabel(image: AgentImageArtifact): string {
  if (image.name) return image.name.split(/[\\/]/).pop() || "Imagem";
  if (/^data:/i.test(image.source)) return "Imagem gerada";
  return image.source.split(/[\\/]/).pop()?.split(/[?#]/)[0] || "Imagem";
}

function rawToolName(message: AiMessage): string {
  return (message.title ?? "").replace(/^Tool\s*·\s*/i, "").trim();
}

function toolKind(message: AiMessage): string {
  return rawToolName(message).toLowerCase();
}

function toolLabel(message: AiMessage): string {
  const name = toolKind(message);
  if (/shell|bash|command|execute|terminal/.test(name)) return "Shell";
  if (/browser|navigate|screenshot|page/.test(name)) return "Browser";
  if (/read/.test(name)) return "Read";
  if (/write/.test(name)) return "Write";
  if (/edit|patch|apply/.test(name)) return "Edit";
  if (/grep|search/.test(name)) return "Search";
  if (/glob/.test(name)) return "Glob";
  if (/list/.test(name)) return "List";
  if (/question|ask|prompt/.test(name)) return "Question";
  if (/task|agent/.test(name)) return "Task";
  const raw = rawToolName(message).replace(/[-_]+/g, " ");
  if (!raw) return "Tool";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function toolSubtitle(message: AiMessage): string {
  const input = parsedToolRecord(message.text);
  const name = toolKind(message);
  if (/shell|bash|command|execute|terminal/.test(name)) {
    return String(input?.command ?? input?.cmd ?? input?.script ?? message.detail ?? "");
  }
  if (/browser|navigate|screenshot|page/.test(name)) {
    return String(input?.url ?? input?.target ?? input?.query ?? input?.title ?? "");
  }
  if (/read|write|edit|patch|apply/.test(name)) {
    const path = String(input?.filePath ?? input?.path ?? input?.file ?? input?.filename ?? "");
    return path.split("/").pop() || path;
  }
  if (/grep|search|glob/.test(name)) {
    return String(input?.pattern ?? input?.query ?? input?.glob ?? "");
  }
  if (/question|ask/.test(name)) {
    return String(input?.question ?? input?.prompt ?? message.title ?? "");
  }
  if (/task|agent/.test(name)) {
    return String(input?.description ?? input?.prompt ?? "");
  }
  return String(input?.path ?? input?.query ?? input?.pattern ?? "");
}

function toolStatus(message: AiMessage) {
  const status = message.status ?? "complete";
  return status === "running" ? "working" : status === "error" ? "failed" : "";
}

function PermissionActions({ message, onPermission }: { message: AiMessage; onPermission?: MessageProps["onPermission"] }) {
  if (!message.permissionId || !onPermission) return null;
  return (
    <div className="flex flex-wrap gap-1.5 py-1.5 ps-3">
      <Button variant="secondary" size="xs" onClick={() => onPermission(message.id, message.permissionId!, "once")}>Permitir uma vez</Button>
      <Button variant="secondary" size="xs" leadingIcon={Check} onClick={() => onPermission(message.id, message.permissionId!, "always")}>Sempre</Button>
      <Button variant="danger" size="xs" leadingIcon={X} onClick={() => onPermission(message.id, message.permissionId!, "reject")}>Rejeitar</Button>
    </div>
  );
}

export function AgentImageGallery({ images, title }: { images: ResolvedAgentImage[]; title?: string }) {
  if (images.length === 0) return null;
  return (
    <section className="mt-2 min-w-0">
      {title ? <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-text-secondary"><Image size={13} /> {title}</div> : null}
      <div className="grid min-w-0 grid-cols-1 gap-2 2xl:grid-cols-2">
        {images.map((image, index) => (
          <figure key={`${image.source}-${index}`} className="min-w-0 max-w-full">
            <a href={image.uri} target="_blank" rel="noreferrer" className="block min-w-0 max-w-full overflow-hidden rounded-lg bg-background-full">
              <img src={image.uri} alt={imageLabel(image)} loading="lazy" onError={(event) => { const figure = event.currentTarget.closest("figure"); if (figure instanceof HTMLElement) figure.style.display = "none"; }} className="max-h-[440px] w-full max-w-full object-contain" />
            </a>
            <figcaption className="mt-1 flex items-center justify-between gap-2 text-[10px] text-text-tertiary">
              <span className="min-w-0 truncate">{imageLabel(image)}</span>
              <span className="shrink-0">{image.mime === "image/*" ? "IMAGEM" : image.mime.replace(/^image\//, "").toUpperCase()}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function DiffView({ diff }: { diff: AgentDiffArtifact }) {
  return (
    <section className="mt-2 min-w-0 overflow-hidden border-y border-separator-border bg-background-full/35">
      <header className="flex h-7 items-center gap-2 border-b border-separator-border px-2 font-mono text-[10px]">
        <span className="min-w-0 flex-1 truncate text-text-secondary" title={diff.title}>{diff.title}</span>
        <span className="text-status-rose-text">−{diff.deletions}</span>
        <span className="text-status-lime-text">+{diff.additions}</span>
      </header>
      <div className="grid grid-cols-[36px_36px_16px_minmax(0,1fr)] border-b border-separator-border bg-background-secondary-default/60 text-[8px] font-semibold uppercase tracking-wide text-text-tertiary">
        <span className="border-e border-separator-border px-1 text-center">Antes</span>
        <span className="border-e border-separator-border px-1 text-center">Depois</span>
        <span />
        <span className="px-1">Conteúdo</span>
      </div>
      <div className="max-h-[440px] min-w-0 overflow-auto font-mono text-[11px] leading-5">
        {diff.lines.map((line, index) => (
          <div
            key={`${line.kind}-${line.oldLine ?? ""}-${line.newLine ?? ""}-${index}`}
            className={line.kind === "add"
              ? "grid min-w-max grid-cols-[36px_36px_16px_minmax(240px,1fr)] bg-status-lime-background text-status-lime-text"
              : line.kind === "remove"
                ? "grid min-w-max grid-cols-[36px_36px_16px_minmax(240px,1fr)] bg-status-rose-background text-status-rose-text"
                : line.kind === "header"
                  ? "grid min-w-max grid-cols-[36px_36px_16px_minmax(240px,1fr)] bg-background-secondary-default text-text-tertiary"
                  : "grid min-w-max grid-cols-[36px_36px_16px_minmax(240px,1fr)] text-text-secondary"}
          >
            <span className="select-none border-e border-separator-border px-1 text-right text-text-tertiary/70">{line.oldLine ?? ""}</span>
            <span className="select-none border-e border-separator-border px-1 text-right text-text-tertiary/70">{line.newLine ?? ""}</span>
            <span className="select-none text-center">{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : line.kind === "header" ? "·" : " "}</span>
            <span className="whitespace-pre pe-3">{line.text || " "}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ToolOutput({ message, images }: { message: AiMessage; images: ResolvedAgentImage[] }) {
  const name = toolKind(message);
  const input = parsedToolRecord(message.text);
  const diffs = extractAgentDiffs(rawToolName(message), message.text, message.detail);
  if (!message.detail && images.length === 0 && diffs.length === 0) return null;
  const command = /shell|bash|command|execute|terminal/.test(name)
    ? String(input?.command ?? input?.cmd ?? input?.script ?? "")
    : "";
  return (
    <div className="min-w-0">
      <AgentImageGallery images={images} />
      {diffs.map((diff, index) => <DiffView key={`${diff.title}-${index}`} diff={diff} />)}
      {message.detail && images.length === 0 && diffs.length === 0 ? (
        <div className="relative mt-2 overflow-hidden border-s-2 border-separator-border bg-background-secondary-default/45">
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            leadingIcon={Copy}
            aria-label="Copiar saída"
            title="Copiar saída"
            className="absolute right-1 top-1 z-10 size-6 text-text-tertiary"
            onClick={() => void navigator.clipboard.writeText(`${command ? `${command}\n` : ""}${message.detail ?? ""}`).catch(() => undefined)}
          />
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 pe-9 font-mono text-[11.5px] leading-relaxed text-text-secondary">{command ? <span className="block text-text-primary">{command}</span> : null}{message.detail}</pre>
        </div>
      ) : null}
    </div>
  );
}

const ToolRow = memo(function ToolRow({ message, onPermission, onQuestion, defaultOpen = false, projectId, projectRoot }: { message: AiMessage; onPermission?: MessageProps["onPermission"]; onQuestion?: MessageProps["onQuestion"]; defaultOpen?: boolean; projectId?: string; projectRoot?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const questions = toolKind(message) === "question" ? parseAgentQuestions(message.text) : [];
  const images = useMemo(
    () => agentImagesForMessages([message], projectId, projectRoot),
    [message, projectId, projectRoot],
  );
  const hasImage = images.length > 0;
  const label = toolLabel(message);
  const subtitle = toolSubtitle(message);
  const status = toolStatus(message);
  const isRunning = message.status === "running";
  useEffect(() => {
    if (hasImage || defaultOpen) setOpen(true);
  }, [hasImage, defaultOpen]);
  if (questions.length > 0) {
    if (message.status === "complete" && message.detail && message.detail !== "{}") {
      return <div className="border-y border-separator-border bg-background-secondary-default/35 px-2 py-2 text-caption-1-regular whitespace-pre-wrap text-text-secondary">{message.detail}</div>;
    }
    if (message.status !== "running") {
      return <Chip color="rose" variant="subtle" className="justify-start whitespace-normal px-2 py-1.5">Esta pergunta foi encerrada antes de receber uma resposta.</Chip>;
    }
    return <AgentQuestionCard questions={questions} onSubmit={onQuestion ? (answer) => onQuestion(message.id, answer) : undefined} />;
  }
  return (
    <div className="py-0.5">
      <button
        type="button"
        className="toph-tool-row group flex w-full min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-start text-[13.5px] text-text-secondary hover:bg-background-primary-hover hover:text-text-primary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="shrink-0 font-medium text-text-primary">{label}</span>
        {subtitle ? <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-text-tertiary" dir="ltr">{subtitle}</span> : <span className="min-w-0 flex-1" />}
        {isRunning ? <LoaderCircle className="size-3 shrink-0 animate-spin text-accent-500" /> : status ? <span className="shrink-0 text-[11px] text-status-rose-text">{status}</span> : null}
        <ChevronDown className={`size-3 shrink-0 text-text-tertiary transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? "rotate-180" : "-rotate-90 opacity-0 group-hover:opacity-100"}`} />
      </button>
      {open ? (
        <div className="ps-2">
          <ToolOutput message={message} images={images} />
        </div>
      ) : null}
      <PermissionActions message={message} onPermission={onPermission} />
    </div>
  );
}, (prev, next) =>
  prev.message === next.message
  && prev.defaultOpen === next.defaultOpen
  && prev.projectId === next.projectId
  && prev.projectRoot === next.projectRoot);

const ThoughtRow = memo(function ThoughtRow({ message, duration }: { message: AiMessage; duration?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-0.5">
      <button
        type="button"
        className="toph-tool-row group flex w-full min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-start text-[13.5px] text-text-secondary hover:bg-background-primary-hover hover:text-text-primary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="shrink-0 font-medium text-text-primary">Thought</span>
        {message.status === "running" ? <LoaderCircle className="size-3 shrink-0 animate-spin text-accent-500" /> : message.durationMs ? <span className="text-[11px] text-text-tertiary">{Math.max(1, Math.round(message.durationMs / 1000))}s</span> : duration ? <span className="text-[11px] text-text-tertiary">{duration}</span> : null}
        <span className="min-w-0 flex-1" />
        <ChevronDown className={`size-3 shrink-0 text-text-tertiary transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? "rotate-180" : "-rotate-90 opacity-0 group-hover:opacity-100"}`} />
      </button>
      {open && message.text ? <p className="ps-2 pt-1 text-[12px] leading-relaxed text-text-tertiary whitespace-pre-wrap break-words">{message.text}</p> : null}
    </div>
  );
}, (prev, next) => prev.message === next.message && prev.duration === next.duration);

function ToolGroup({ messages, onPermission, onQuestion, defaultOpen = false, projectId, projectRoot }: { messages: AiMessage[]; onPermission?: MessageProps["onPermission"]; onQuestion?: MessageProps["onQuestion"]; defaultOpen?: boolean; projectId?: string; projectRoot?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const tools = messages.filter((message) => message.role === "tool");
  const thoughts = messages.filter((message) => message.role === "reasoning");
  const imageKey = tools.map((message) => `${message.id}:${message.text.length}:${message.detail?.length ?? 0}`).join("|");
  const images = useMemo(
    () => agentImagesForMessages(tools, projectId, projectRoot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imageKey, projectId, projectRoot],
  );
  const count = tools.length || thoughts.length;
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const labels: string[] = [];
  for (const tool of tools) {
    const label = toolLabel(tool);
    if (!labels.includes(label)) labels.push(label);
  }
  if (labels.length === 0) labels.push("Thought");
  const rows = (
    <div className={defaultOpen ? "flex flex-col gap-1" : "mt-1 flex flex-col gap-0"}>
      {messages.map((message, index) => {
        if (message.role === "reasoning") {
          const next = messages[index + 1];
          const seconds = next ? Math.max(0, Math.round((next.createdAt - message.createdAt) / 1000)) : 0;
          return <ThoughtRow key={message.id} message={message} duration={seconds > 0 ? `${seconds}s` : undefined} />;
        }
        return <ToolRow key={message.id} message={message} onPermission={onPermission} onQuestion={onQuestion} defaultOpen={defaultOpen} projectId={projectId} projectRoot={projectRoot} />;
      })}
    </div>
  );
  if (defaultOpen) return rows;
  return (
    <div className="w-full">
      <button
        type="button"
        className="toph-tool-row group flex w-full min-w-0 items-center gap-1.5 rounded-lg px-1 py-1 text-start text-[13px] text-text-tertiary hover:bg-background-primary-hover hover:text-text-secondary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`Used ${count} ${labels.join(", ")}`}
      >
        <span>Used</span>
        <span className="tabular-nums">{count}</span>
        <span className="truncate">{labels.join(", ")}</span>
        <ChevronDown className={`size-3 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? "rotate-180" : "-rotate-90"}`} />
      </button>
      {open ? rows : images.length > 0 ? <div className="ps-2 pt-1"><AgentImageGallery images={images} /></div> : null}
    </div>
  );
}

const TranscriptMessage = memo(function TranscriptMessage({ message, showCaret, onPermission, onQuestion, toolsExpanded, projectId, projectRoot, bubble }: MessageProps) {
  if (message.role === "error") {
    return <Chip color="rose" variant="subtle" className="justify-start gap-1.5 whitespace-normal px-2 py-1.5"><CircleAlert size={13} /> {message.text}</Chip>;
  }
  if (message.role === "user") {
    return (
      <div className="ms-auto flex min-w-0 max-w-[88%] flex-col items-end gap-1">
        <p className="min-w-0 max-w-full overflow-hidden rounded-2xl bg-accent-500 px-3.5 py-2 text-[14px] leading-[1.55] whitespace-pre-wrap break-words text-text-on-accent">
          {message.text}
        </p>
        <Button variant="ghost" size="xs" iconOnly leadingIcon={Copy} aria-label="Copiar mensagem" title="Copiar mensagem" onClick={() => void navigator.clipboard.writeText(message.text).catch(() => undefined)} className="size-6 text-text-tertiary opacity-50 hover:opacity-100" />
      </div>
    );
  }
  if (message.role === "reasoning") {
    return <ThoughtRow message={message} />;
  }
  if (message.role === "step") {
    return <p className="text-[12px] text-text-tertiary">{message.text}</p>;
  }
  if (message.role === "tool") {
    return <ToolRow message={message} onPermission={onPermission} onQuestion={onQuestion} defaultOpen={toolsExpanded} projectId={projectId} projectRoot={projectRoot} />;
  }
  const body = (
    <>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
        urlTransform={(url) => url.startsWith("data:image/") ? url : defaultUrlTransform(url)}
      >
        {resolveMarkdownImages(message.text, projectId, projectRoot)}
      </ReactMarkdown>
      {showCaret && (
        <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-accent-500 align-middle" aria-hidden />
      )}
    </>
  );
  if (bubble) {
    return (
      <div data-transcript-bubble className="w-fit min-w-0 max-w-full overflow-hidden rounded-2xl rounded-tl-md border border-separator-border bg-background-secondary-default px-3.5 py-1.5 shadow-sm [&>ol:first-child]:mt-0 [&>p:first-child]:mt-0 [&>pre:first-child]:mt-0 [&>ul:first-child]:mt-0 [&>*:last-child]:mb-0">
        {body}
      </div>
    );
  }
  return <div className="min-w-0">{body}</div>;
}, (prev, next) => prev.message === next.message
  && prev.showCaret === next.showCaret
  && prev.toolsExpanded === next.toolsExpanded
  && prev.projectId === next.projectId
  && prev.projectRoot === next.projectRoot
  && prev.bubble === next.bubble);

function AgentTranscript({ messages, streaming, onPermission, onQuestion, className, toolsExpanded = false, projectId, projectRoot, bubble = false }: Props) {
  const nodes: Array<{ kind: "message"; message: AiMessage } | { kind: "group"; messages: AiMessage[] }> = [];
  let group: AiMessage[] = [];
  const flush = () => {
    if (group.length) nodes.push({ kind: "group", messages: group });
    group = [];
  };
  for (const message of messages) {
    if (message.role === "tool" || message.role === "reasoning") {
      group.push(message);
    } else {
      flush();
      nodes.push({ kind: "message", message });
    }
  }
  flush();

  const lastMessage = messages[messages.length - 1];
  return (
    <div className={className ?? "flex flex-col gap-4 px-1 py-1"}>
      {nodes.map((node, index) => node.kind === "group" ? (
        <ToolGroup key={`group-${index}-${node.messages[0]?.id ?? ""}`} messages={node.messages} onPermission={onPermission} onQuestion={onQuestion} defaultOpen={toolsExpanded} projectId={projectId} projectRoot={projectRoot} />
      ) : (
        <TranscriptMessage
          key={node.message.id}
          message={node.message}
          showCaret={streaming && node.message.id === lastMessage?.id && node.message.status === "running"}
          onPermission={onPermission}
          onQuestion={onQuestion}
          toolsExpanded={toolsExpanded}
          projectId={projectId}
          projectRoot={projectRoot}
          bubble={bubble}
        />
      ))}
    </div>
  );
}

/**
 * The parent rebuilds the `messages` array on each render, but the individual
 * AiMessage objects are cached per ChatMessage. Comparing elements lets React
 * skip the whole transcript when only unrelated state changed.
 */
export default memo(AgentTranscript, (prev, next) =>
  prev.streaming === next.streaming
  && prev.toolsExpanded === next.toolsExpanded
  && prev.projectId === next.projectId
  && prev.projectRoot === next.projectRoot
  && prev.bubble === next.bubble
  && prev.className === next.className
  && prev.messages.length === next.messages.length
  && prev.messages.every((message, index) => message === next.messages[index]));
