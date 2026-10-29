import { memo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ChevronDown, CircleAlert, Wrench, X } from "@toph/icons";
import type { AiMessage } from "../store";
import { Badge } from "@/boardui/base/badges/badge";
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
    return (
      <details className="group overflow-hidden rounded-lg border border-border-button-default bg-background-secondary-default">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-caption-1-medium text-text-secondary hover:text-text-primary">
          <Wrench size={13} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{message.title ?? "Tool"}</span>
          {message.status && <Badge color="neutral" className="text-caption-2-regular">{message.status}</Badge>}
          <ChevronDown size={12} className="shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-separator-border">
          {message.text && <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words px-2.5 py-2 text-[12px] leading-relaxed text-text-secondary">{message.text}</pre>}
          {message.detail && <pre className="max-h-56 overflow-auto border-t border-separator-border px-2.5 py-2 text-[11.5px] leading-relaxed text-text-tertiary">{message.detail}</pre>}
          {message.permissionId && onPermission && (
            <div className="flex flex-wrap gap-1.5 border-t border-separator-border px-2.5 py-2">
              <Button variant="secondary" size="xs" onClick={() => onPermission(message.id, message.permissionId!, "once")}>Permitir uma vez</Button>
              <Button variant="secondary" size="xs" leadingIcon={Check} onClick={() => onPermission(message.id, message.permissionId!, "always")}>Sempre</Button>
              <Button variant="danger" size="xs" leadingIcon={X} onClick={() => onPermission(message.id, message.permissionId!, "reject")}>Rejeitar</Button>
            </div>
          )}
        </div>
      </details>
    );
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
          showCaret={streaming && message.id === lastMessage?.id}
          onPermission={onPermission}
        />
      ))}
      {streaming && <AgentThinking variant="wave" label="Trabalhando" tone="accent" shimmer showTimer />}
    </div>
  );
}
