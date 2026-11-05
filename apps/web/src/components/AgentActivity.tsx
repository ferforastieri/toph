import { useEffect, useMemo, useState } from "react";
import { ChevronDown, LoaderCircle } from "@toph/icons";
import type { AiMessage } from "../store";
import { ThoughtRow, ToolRow, toolLabel, toolSubtitle } from "./AgentTranscript";

export type AgentActivityState = "thinking" | "working" | "responding";

interface Props {
  messages: AiMessage[];
  state: AgentActivityState;
  startedAt: number;
  onPermission?: (messageId: string, permissionId: string, decision: "once" | "always" | "reject") => void;
  onQuestion?: (messageId: string, answer: string) => void | Promise<void>;
  projectId?: string;
  projectRoot?: string;
}

function useElapsedSeconds(startedAt: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);
  if (!active || !Number.isFinite(startedAt) || startedAt <= 0) return 0;
  return Math.max(1, Math.floor((now - startedAt) / 1000));
}

function elapsedLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function thoughtExcerpt(messages: AiMessage[]): string {
  const thought = [...messages].reverse().find((message) => message.role === "reasoning" && message.text.trim());
  if (!thought) return "";
  const lines = thought.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? thought.text.trim();
  return last.length > 220 ? `${last.slice(0, 220)}…` : last;
}

/**
 * Live "what is the agent doing now" strip. It mirrors the CLI/Codex pattern:
 * the current turn is a sequence of typed steps (reasoning, tool calls, text),
 * rendered as they arrive instead of hiding them behind a generic spinner.
 */
export default function AgentActivity({ messages, state, startedAt, onPermission, onQuestion, projectId, projectRoot }: Props) {
  const [expanded, setExpanded] = useState(false);
  const seconds = useElapsedSeconds(startedAt, true);
  const running = messages.filter((message) => message.status === "running");
  const current = running[running.length - 1];
  const excerpt = useMemo(() => thoughtExcerpt(messages), [messages]);
  const visible = expanded ? messages : messages.slice(-4);
  const hidden = messages.length - visible.length;
  const label = state === "thinking" ? "Pensando" : state === "working" ? "Trabalhando" : "Respondendo";
  const action = current?.role === "tool"
    ? { title: toolLabel(current), detail: toolSubtitle(current) }
    : null;

  return (
    <div className="min-w-0 rounded-2xl border border-accent-500/20 bg-accent-500/[0.04] px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2 px-1 py-0.5">
        <LoaderCircle className="size-3.5 shrink-0 animate-spin text-accent-500" />
        <span className="shrink-0 text-caption-1-semibold text-text-primary" role="status" aria-live="polite">{label}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-text-tertiary">{elapsedLabel(seconds)}</span>
        <span className="min-w-0 flex-1" />
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-text-tertiary transition-colors hover:bg-background-primary-hover hover:text-text-secondary"
            aria-expanded={expanded}
          >
            {expanded ? "Ocultar" : "Detalhes"}
            <ChevronDown className={`size-3 transition-transform ${expanded ? "rotate-180" : "-rotate-90"}`} />
          </button>
        ) : null}
      </div>

      {action ? (
        <div className="flex min-w-0 items-center gap-1.5 px-1 pb-0.5 text-[11.5px] text-text-secondary">
          <span className="shrink-0 font-medium text-text-primary">{action.title}</span>
          {action.detail ? <span className="min-w-0 truncate font-mono text-[11px] text-text-tertiary" dir="ltr">{action.detail}</span> : null}
        </div>
      ) : excerpt ? (
        <p className="line-clamp-2 px-1 pb-0.5 text-[11.5px] leading-relaxed text-text-tertiary">{excerpt}</p>
      ) : null}

      {visible.length > 0 ? (
        <div className="mt-0.5 flex min-w-0 flex-col gap-0.5">
          {hidden > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-fit px-1 text-[10.5px] text-text-tertiary hover:text-text-secondary"
            >
              +{hidden} etapa{hidden === 1 ? "" : "s"} anterior{hidden === 1 ? "" : "es"}
            </button>
          ) : null}
          {visible.map((message) => message.role === "reasoning" ? (
            <ThoughtRow key={message.id} message={message} />
          ) : (
            <ToolRow
              key={message.id}
              message={message}
              onPermission={onPermission}
              onQuestion={onQuestion}
              projectId={projectId}
              projectRoot={projectRoot}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
