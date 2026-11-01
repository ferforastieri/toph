import { memo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ChevronDown, CircleAlert, FileDiff, FileText, MessageCircleQuestion, Search, TerminalSquare, Wrench, X } from "@toph/icons";
import type { AiMessage } from "../store";
import { Button } from "@/boardui/base/buttons/button";
import { Chip } from "@/boardui/base/badges/chip";
import { AgentThinking } from "@/boardui/application/agent-thinking/agent-thinking";

interface Props {
  messages: AiMessage[];
  streaming: boolean;
  onPermission?: (messageId: string, permissionId: string, decision: "once" | "always" | "reject") => void;
  className?: string;
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="my-1.5 text-[13.5px] leading-[1.6] text-text-primary">{children}</p>,
  h1: ({ children }) => <h1 className="mt-4 mb-1.5 text-[15px] font-semibold leading-snug text-text-primary">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-4 mb-1.5 text-[15px] font-semibold leading-snug text-text-primary">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 mb-1 text-[14px] font-semibold leading-snug text-text-primary">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-3 mb-1 text-[13.5px] font-semibold leading-snug text-text-primary">{children}</h4>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-4 text-[13.5px] leading-[1.55] text-text-primary marker:text-text-tertiary">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-4 text-[13.5px] leading-[1.55] text-text-primary marker:text-text-tertiary">{children}</ol>,
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
    <pre className="my-2.5 max-w-full overflow-x-auto rounded-lg border border-border-button-default bg-background-secondary-default p-2.5 text-[12px] leading-relaxed">
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

function toolKind(message: AiMessage): string {
  return (message.title ?? "").replace(/^Tool\s*·\s*/i, "").trim().toLowerCase();
}

function toolStatus(message: AiMessage) {
  const status = message.status ?? "complete";
  return status === "running" ? "Executando" : status === "error" ? "Falhou" : "Concluído";
}

function ToolMessage({ message, onPermission }: { message: AiMessage; onPermission?: MessageProps["onPermission"] }) {
  const name = toolKind(message);
  const input = parsedToolValue(message.text);
  const isShell = /shell|bash|command|execute|terminal/.test(name);
  const isEdit = /edit|write|patch|apply|create/.test(name);
  const isQuestion = /question|ask|prompt/.test(name);
  const path = String(input?.filePath ?? input?.path ?? input?.file ?? input?.filename ?? "");
  const command = String(input?.command ?? input?.cmd ?? input?.script ?? "");
  const status = message.status ?? "complete";

  const permission = message.permissionId && onPermission ? (
    <div className="flex flex-wrap gap-1.5 px-2.5 pb-2.5">
      <Button variant="secondary" size="xs" onClick={() => onPermission(message.id, message.permissionId!, "once")}>Permitir uma vez</Button>
      <Button variant="secondary" size="xs" leadingIcon={Check} onClick={() => onPermission(message.id, message.permissionId!, "always")}>Sempre</Button>
      <Button variant="danger" size="xs" leadingIcon={X} onClick={() => onPermission(message.id, message.permissionId!, "reject")}>Rejeitar</Button>
    </div>
  ) : null;

  if (isShell) {
    return (
      <details className="group overflow-hidden rounded-2xl border border-border-button-default bg-background-secondary-default">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-caption-1-medium text-text-secondary hover:bg-background-primary-hover">
          <TerminalSquare size={14} className="shrink-0 text-foreground-icon-tertiary" />
          <span className="shrink-0 font-medium text-text-primary">Shell</span>
          <span className="min-w-0 flex-1 truncate font-mono text-caption-2-regular text-text-secondary">{command || name}</span>
          <span className={status === "error" ? "text-caption-2-regular text-status-rose-text" : "text-caption-2-regular text-text-tertiary"}>{toolStatus(message)}</span>
          <ChevronDown size={13} className="shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-separator-border bg-background-primary-default p-2.5">
          {command ? <pre className="max-h-48 overflow-auto rounded-lg bg-background-tertiary-default p-2 text-[12px] leading-relaxed text-text-primary"><span className="text-text-tertiary">$ </span>{command}</pre> : null}
          {message.detail ? <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-text-secondary">{message.detail}</pre> : null}
          {!command && !message.detail ? <p className="px-1 py-2 text-caption-2-regular text-text-tertiary">Sem saída.</p> : null}
        </div>
        {permission}
      </details>
    );
  }

  if (isEdit) {
    const oldText = String(input?.oldString ?? "");
    const newText = String(input?.newString ?? input?.content ?? input?.text ?? "");
    return (
      <details className="group overflow-hidden rounded-2xl border border-border-button-default bg-background-secondary-default" open={status === "running"}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-caption-1-medium text-text-secondary hover:bg-background-primary-hover">
          <FileDiff size={14} className="shrink-0 text-foreground-icon-tertiary" />
          <span className="shrink-0 font-medium text-text-primary">{name === "write" ? "Write" : "Edit"}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-caption-2-regular text-text-secondary">{path || "arquivo"}</span>
          <ChevronDown size={13} className="shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-separator-border bg-background-primary-default p-2.5">
          {oldText || newText ? (
            <div className="overflow-x-auto rounded-lg border border-border-button-default font-mono text-[11.5px] leading-relaxed">
              {oldText.split("\n").map((line, index) => <div key={`old-${index}`} className="flex gap-2 bg-status-rose-background/40 px-2 text-status-rose-text"><span className="w-4 shrink-0 select-none">-</span><span className="whitespace-pre">{line}</span></div>)}
              {newText.split("\n").map((line, index) => <div key={`new-${index}`} className="flex gap-2 bg-status-lime-background/40 px-2 text-status-lime-text"><span className="w-4 shrink-0 select-none">+</span><span className="whitespace-pre">{line}</span></div>)}
            </div>
          ) : message.detail ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-text-secondary">{message.detail}</pre> : <p className="px-1 py-2 text-caption-2-regular text-text-tertiary">Conteúdo da edição indisponível.</p>}
          {message.detail && (oldText || newText) ? <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-text-tertiary">{message.detail}</pre> : null}
        </div>
        {permission}
      </details>
    );
  }

  if (isQuestion) {
    return (
      <details className="group overflow-hidden rounded-2xl border border-border-button-default bg-background-secondary-default">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-caption-1-medium text-text-secondary hover:bg-background-primary-hover">
          <MessageCircleQuestion size={14} className="shrink-0 text-foreground-icon-tertiary" />
          <span className="shrink-0 font-medium text-text-primary">Pergunta</span>
          <span className="min-w-0 flex-1 truncate text-caption-2-regular text-text-secondary">{message.title?.replace(/^Tool\s*·\s*/i, "") || name}</span>
          <ChevronDown size={13} className="shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-separator-border bg-background-primary-default p-2.5 text-[12px] leading-relaxed text-text-primary">
          {message.text ? <p className="whitespace-pre-wrap break-words">{message.text}</p> : null}
          {message.detail ? <p className="mt-1.5 whitespace-pre-wrap break-words text-text-secondary">{message.detail}</p> : null}
        </div>
        {permission}
      </details>
    );
  }

  return (
    <details className="group -mx-1">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-1.5 py-1 text-caption-1-medium text-text-secondary hover:bg-background-primary-hover hover:text-text-primary">
        {/read|list|glob|grep|search/.test(name) ? <Search size={13} className="shrink-0 text-foreground-icon-tertiary" /> : /edit|write|patch/.test(name) ? <FileText size={13} className="shrink-0 text-foreground-icon-tertiary" /> : <Wrench size={13} className="shrink-0 text-foreground-icon-tertiary" />}
        <span className="min-w-0 flex-1 truncate">{message.title ?? "Tool"}</span>
        {message.status && <span className="shrink-0 text-caption-2-regular text-text-tertiary">{toolStatus(message)}</span>}
        <ChevronDown size={12} className="shrink-0 text-foreground-icon-tertiary transition-transform group-open:rotate-180" />
      </summary>
      <div className="ps-5">
        {message.text && <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words py-1 text-[12px] leading-relaxed text-text-secondary">{message.text}</pre>}
        {message.detail && <pre className="max-h-56 overflow-auto py-1 text-[11.5px] leading-relaxed text-text-tertiary">{message.detail}</pre>}
        {permission}
      </div>
    </details>
  );
}

const TranscriptMessage = memo(function TranscriptMessage({ message, showCaret, onPermission }: MessageProps) {
  if (message.role === "error") {
    return <Chip color="rose" variant="subtle" className="justify-start gap-1.5 whitespace-normal px-2 py-1.5"><CircleAlert size={13} /> {message.text}</Chip>;
  }
  if (message.role === "user") {
    return (
      <p className="ms-auto max-w-[88%] rounded-2xl border border-accent-500/20 bg-accent-500/10 px-3.5 py-2 text-[13.5px] leading-[1.5] whitespace-pre-wrap break-words text-text-primary">
        {message.text}
      </p>
    );
  }
  if (message.role === "reasoning") {
    return (
      <details className="group -my-1">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-caption-1-medium text-text-tertiary hover:text-text-secondary">
          <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
          {message.title ?? "Thought"}
          {message.status === "running" && <span className="text-caption-2-regular text-text-tertiary">· pensando</span>}
        </summary>
        {message.text && <p className="mt-1.5 whitespace-pre-wrap break-words border-l border-separator-border pl-3 text-caption-1-regular leading-relaxed text-text-secondary">{message.text}</p>}
      </details>
    );
  }
  if (message.role === "step") {
    return <p className="text-caption-2-regular text-text-tertiary">{message.text}</p>;
  }
  if (message.role === "tool") {
    return <ToolMessage message={message} onPermission={onPermission} />;
  }
  return (
    <div className="min-w-0">
      {showCaret ? (
        <p className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.6] text-text-primary">{message.text}</p>
      ) : (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {message.text}
        </ReactMarkdown>
      )}
      {showCaret && (
        <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-accent-500 align-middle" aria-hidden />
      )}
    </div>
  );
}, (prev, next) => prev.message === next.message && prev.showCaret === next.showCaret);

export default function AgentTranscript({ messages, streaming, onPermission, className }: Props) {
  const lastMessage = messages[messages.length - 1];
  return (
    <div className={className ?? "flex flex-col gap-5 px-1 py-1"}>
      {messages.map((message) => (
        <TranscriptMessage
          key={message.id}
          message={message}
          showCaret={streaming && message.id === lastMessage?.id && message.status === "running"}
          onPermission={onPermission}
        />
      ))}
      {streaming && <AgentThinking variant="wave" label="Trabalhando" tone="accent" shimmer showTimer />}
    </div>
  );
}
