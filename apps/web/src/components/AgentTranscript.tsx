import { memo, useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ChevronDown, CircleAlert, Copy, LoaderCircle, X } from "@toph/icons";
import type { AiMessage } from "../store";
import { Button } from "@/boardui/base/buttons/button";
import { Chip } from "@/boardui/base/badges/chip";

interface Props {
  messages: AiMessage[];
  streaming: boolean;
  onPermission?: (messageId: string, permissionId: string, decision: "once" | "always" | "reject") => void;
  className?: string;
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
}

function parsedToolValue(value?: string): Record<string, any> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
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
  const input = parsedToolValue(message.text);
  const name = toolKind(message);
  if (/shell|bash|command|execute|terminal/.test(name)) {
    return String(input?.command ?? input?.cmd ?? input?.script ?? message.detail ?? "");
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

function ToolOutput({ message }: { message: AiMessage }) {
  const name = toolKind(message);
  const input = parsedToolValue(message.text);
  const oldText = String(input?.oldString ?? "");
  const newText = String(input?.newString ?? input?.content ?? input?.text ?? "");
  if (/edit|write|patch|apply/.test(name) && (oldText || newText)) {
    return (
      <div className="mt-2 overflow-x-auto rounded-xl bg-background-secondary-default p-3 font-mono text-[11.5px] leading-relaxed">
        {oldText.split("\n").map((line, index) => <div key={`old-${index}`} className="flex gap-2 text-status-rose-text"><span className="w-3 shrink-0 select-none">-</span><span className="whitespace-pre">{line}</span></div>)}
        {newText.split("\n").map((line, index) => <div key={`new-${index}`} className="flex gap-2 text-status-lime-text"><span className="w-3 shrink-0 select-none">+</span><span className="whitespace-pre">{line}</span></div>)}
      </div>
    );
  }
  if (!message.detail) return null;
  const command = /shell|bash|command|execute|terminal/.test(name)
    ? String(input?.command ?? input?.cmd ?? input?.script ?? "")
    : "";
  return (
    <div className="relative mt-2 overflow-hidden rounded-xl bg-background-secondary-default">
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
  );
}

function ToolRow({ message, onPermission }: { message: AiMessage; onPermission?: MessageProps["onPermission"] }) {
  const [open, setOpen] = useState(false);
  const label = toolLabel(message);
  const subtitle = toolSubtitle(message);
  const status = toolStatus(message);
  const isRunning = message.status === "running";
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
        <ChevronDown className={`size-3 shrink-0 text-text-tertiary transition-transform ${open ? "rotate-180" : "-rotate-90 opacity-0 group-hover:opacity-100"}`} />
      </button>
      {open ? (
        <div className="ps-2">
          <ToolOutput message={message} />
        </div>
      ) : null}
      <PermissionActions message={message} onPermission={onPermission} />
    </div>
  );
}

function ThoughtRow({ message, duration }: { message: AiMessage; duration?: string }) {
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
        <ChevronDown className={`size-3 shrink-0 text-text-tertiary transition-transform ${open ? "rotate-180" : "-rotate-90 opacity-0 group-hover:opacity-100"}`} />
      </button>
      {open && message.text ? <p className="ps-2 pt-1 text-[12px] leading-relaxed text-text-tertiary whitespace-pre-wrap break-words">{message.text}</p> : null}
    </div>
  );
}

function ToolGroup({ messages, onPermission }: { messages: AiMessage[]; onPermission?: MessageProps["onPermission"] }) {
  const [open, setOpen] = useState(false);
  const tools = messages.filter((message) => message.role === "tool");
  const thoughts = messages.filter((message) => message.role === "reasoning");
  const count = tools.length || thoughts.length;
  const labels: string[] = [];
  for (const tool of tools) {
    const label = toolLabel(tool);
    if (!labels.includes(label)) labels.push(label);
  }
  if (labels.length === 0) labels.push("Thought");
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
        <ChevronDown className={`size-3 shrink-0 transition-transform ${open ? "rotate-180" : "-rotate-90"}`} />
      </button>
      {open ? (
        <div className="mt-1 flex flex-col gap-0">
          {messages.map((message, index) => {
            if (message.role === "reasoning") {
              const next = messages[index + 1];
              const seconds = next ? Math.max(0, Math.round((next.createdAt - message.createdAt) / 1000)) : 0;
              return <ThoughtRow key={message.id} message={message} duration={seconds > 0 ? `${seconds}s` : undefined} />;
            }
            return <ToolRow key={message.id} message={message} onPermission={onPermission} />;
          })}
        </div>
      ) : null}
    </div>
  );
}

const TranscriptMessage = memo(function TranscriptMessage({ message, showCaret, onPermission }: MessageProps) {
  if (message.role === "error") {
    return <Chip color="rose" variant="subtle" className="justify-start gap-1.5 whitespace-normal px-2 py-1.5"><CircleAlert size={13} /> {message.text}</Chip>;
  }
  if (message.role === "user") {
    return (
      <div className="ms-auto flex min-w-0 max-w-[88%] flex-col items-end gap-1">
        <p className="min-w-0 max-w-full overflow-hidden rounded-2xl bg-blue-600/20 px-3.5 py-2 text-[14px] leading-[1.55] whitespace-pre-wrap break-words text-text-primary">
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
    return <ToolRow message={message} onPermission={onPermission} />;
  }
  return (
    <div className="min-w-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {message.text}
      </ReactMarkdown>
      {showCaret && (
        <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-accent-500 align-middle" aria-hidden />
      )}
    </div>
  );
}, (prev, next) => prev.message === next.message && prev.showCaret === next.showCaret);

export default function AgentTranscript({ messages, streaming, onPermission, className }: Props) {
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
        <ToolGroup key={`group-${index}-${node.messages[0]?.id ?? ""}`} messages={node.messages} onPermission={onPermission} />
      ) : (
        <TranscriptMessage
          key={node.message.id}
          message={node.message}
          showCaret={streaming && node.message.id === lastMessage?.id && node.message.status === "running"}
          onPermission={onPermission}
        />
      ))}
      {streaming && (
        <div className="flex items-center gap-2 px-1 py-1 text-[13px] text-text-tertiary">
          <LoaderCircle className="size-3.5 animate-spin" />
          <span>Working</span>
        </div>
      )}
    </div>
  );
}
