import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Copy, CornerDownRight, LoaderCircle } from "@toph/icons";
import type { AiMessage } from "../../../app/store";
import type { Project, AIModel } from "../../../shared/api";
import type { ChatToph } from "../store";
import { isActive, type AgentQuestionPrompt, type AgentRun, type NativeMessage } from "../../agents/api";
import { modelDisplay } from "../../providers/store";
import AgentTranscript, {
  ThoughtRow,
  ToolRow,
  TranscriptMessage,
  toolLabel,
  toolSubtitle,
} from "./AgentTranscript";
import AgentQuestionCard from "./AgentQuestionCard";
import BotAvatar from "../../agents/components/BotAvatar";
import { Button } from "@/shared/boardui/base/buttons/button";
import { cx } from "@/shared/boardui/utils/cx";

const transcriptCache = new WeakMap<NativeMessage, AiMessage>();
function messageOrder(a: NativeMessage, b: NativeMessage): number {
  if (a.seq != null && b.seq != null) return a.seq - b.seq;
  if (a.seq != null) return -1;
  if (b.seq != null) return 1;
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}
function toTranscriptMessage(message: NativeMessage): AiMessage {
  const cached = transcriptCache.get(message);
  if (cached) return cached;
  const result: AiMessage = {
    id: message.id,
    role: message.role === "system" ? "assistant" : message.role,
    text: message.content,
    detail: message.detail,
    title: message.title,
    status: message.status,
    createdAt: message.createdAt,
  };
  transcriptCache.set(message, result);
  return result;
}

interface Props {
  messages: NativeMessage[];
  tophs: ChatToph[];
  runs: AgentRun[];
  models: AIModel[];
  defaultModel: string;
  project: Project;
  mobile: boolean;
  compact?: boolean;
  questions?: AgentQuestionPrompt[];
  onAnswer?: (id: string, answer: string) => void | Promise<void>;
}

function Elapsed({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const seconds = Math.max(1, Math.floor((now - startedAt) / 1000));
  if (seconds < 60) return <span className="tabular-nums">{seconds}s</span>;
  return <span className="tabular-nums">{Math.floor(seconds / 60)}m {String(seconds % 60).padStart(2, "0")}s</span>;
}

function timeLabel(value: number): string {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function StepRow({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return <div className={cx("relative ms-3 border-s border-separator-border [content-visibility:auto] [contain-intrinsic-size:auto_80px]", compact ? "ps-2.5" : "ps-3")}>{children}</div>;
}

function TophTurnHeader({ toph, model }: { toph: ChatToph; model: string }) {
  return (
    <div className="mt-4 flex min-w-0 items-center gap-2 first:mt-0">
      <BotAvatar bot={toph} size={26} />
      <strong className="truncate text-caption-1-semibold text-text-primary">{toph.name}</strong>
      <span className="truncate text-caption-2-regular text-text-tertiary">{toph.role || "Toph"}</span>
      <span className="text-text-tertiary">·</span>
      <span className="truncate text-caption-2-regular text-text-tertiary">{model}</span>
    </div>
  );
}

function ActivityStatus({ toph, activity, startedAt }: { toph: ChatToph; activity: { label: string; detail?: string }; startedAt: number }) {
  return (
    <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg border border-accent-500/15 bg-accent-500/[0.04] px-2 py-1.5 text-[11px] text-text-secondary">
      <BotAvatar bot={toph} size={18} />
      <strong className="shrink-0 text-text-primary">{toph.name}</strong>
      <LoaderCircle className="size-3.5 shrink-0 animate-spin text-accent-500" />
      <span className="shrink-0 text-accent-600">{activity.label}</span>
      {activity.detail ? <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-text-tertiary" dir="ltr">{activity.detail}</span> : <span className="min-w-0 flex-1" />}
      <Elapsed startedAt={startedAt} />
    </div>
  );
}

export default function ChatMessages({
  messages,
  tophs,
  runs,
  models,
  defaultModel,
  project,
  mobile,
  compact = false,
  questions = [],
  onAnswer,
}: Props) {
  const ordered = useMemo(() => [...messages].sort(messageOrder), [messages]);
  const activeRuns = runs.filter(isActive);
  const label = (toph: ChatToph | undefined, message?: NativeMessage) => {
    const id = message?.model || toph?.model || defaultModel;
    return modelDisplay(models.find((m) => m.id === id) ?? (id ? { id, label: id.split("::").pop()?.split("/").pop() ?? id } : undefined));
  };

  function currentActivity(toph: ChatToph, run: AgentRun): { label: string; detail?: string } {
    const own = ordered.filter((message) => message.tophId === toph.id && message.createdAt >= run.createdAt);
    const last = own[own.length - 1];
    if (!last) return { label: "Pensando" };
    if (last.role === "tool") {
      if (last.status === "running") {
        const value = toTranscriptMessage(last);
        return { label: toolLabel(value), detail: toolSubtitle(value) };
      }
      return { label: "Pensando" };
    }
    if (last.role === "reasoning") return { label: last.status === "running" ? "Pensando" : "Processando" };
    if (last.role === "assistant") return { label: last.status === "running" && last.content ? "Respondendo" : "Pensando" };
    return { label: "Pensando" };
  }

  const rows: ReactNode[] = [];
  let activeTophId: string | null = null;
  let previousRole: string | null = null;

  for (const message of ordered) {
    if (message.role === "user") {
      activeTophId = null;
      previousRole = "user";
      rows.push(
        <div key={message.id} className="ms-auto flex min-w-0 max-w-[88%] flex-col items-end gap-1">
          <span className="px-1 text-[10px] text-text-tertiary">{timeLabel(message.createdAt)}</span>
          <p className="min-w-0 max-w-full overflow-hidden rounded-xl border border-accent-500/25 bg-accent-500/[0.07] px-3.5 py-2 text-[14px] leading-[1.55] whitespace-pre-wrap break-words text-text-primary">
            <span className="me-1.5 font-mono text-accent-500">›</span>{message.content}
          </p>
        </div>,
      );
      continue;
    }
    if (message.role === "system") {
      previousRole = "system";
      rows.push(
        <div key={message.id} className="flex flex-col items-center gap-1.5">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-accent-500/20 bg-accent-500/10 px-2.5 py-1 text-[11px] text-accent-600">
            <CornerDownRight size={12} className="shrink-0" />
            <span className="truncate" title={message.content}>{message.content}</span>
          </span>
        </div>,
      );
      continue;
    }
    if (message.role === "error") {
      previousRole = "error";
      rows.push(<p key={message.id} className="rounded-xl border border-status-rose-text/30 bg-status-rose-background px-3 py-2 text-[12px] text-status-rose-text">{message.content}</p>);
      continue;
    }
    if (message.role === "assistant" && !message.content && message.status !== "running") {
      previousRole = message.role;
      continue;
    }

    const toph = tophs.find((item) => item.id === message.tophId);
    if (!toph) {
      const value = toTranscriptMessage(message);
      rows.push(
        <div key={message.id} className="min-w-0">
          <AgentTranscript messages={[value]} streaming={message.status === "running"} projectId={project.id} projectRoot={project.root} />
        </div>,
      );
      previousRole = message.role;
      continue;
    }

    if (activeTophId !== toph.id || previousRole === "user") {
      activeTophId = toph.id;
      rows.push(
        <TophTurnHeader
          key={`header-${message.id}`}
          toph={toph}
          model={label(toph, message)}
        />,
      );
    }
    previousRole = message.role;

    if (message.role === "reasoning") {
      rows.push(
        <StepRow key={message.id} compact={compact}>
          <ThoughtRow message={toTranscriptMessage(message)} />
        </StepRow>,
      );
      continue;
    }
    if (message.role === "tool") {
      const value = toTranscriptMessage(message);
      rows.push(
        <StepRow key={message.id} compact={compact}>
          <ToolRow message={value} projectId={project.id} projectRoot={project.root} />
        </StepRow>,
      );
      continue;
    }
    if (message.role === "assistant") {
      const value = toTranscriptMessage(message);
      rows.push(
        <StepRow key={message.id} compact={compact}>
          {message.status !== "running" ? (
            <div className="flex items-center gap-1.5 px-1 text-[10px] text-text-tertiary">
              <span>{message.agentMode === "plan" ? "Plan" : "Build"}</span><span>·</span><span className="truncate">{label(toph, message)}</span><span>·</span><span>{timeLabel(message.createdAt)}</span>
              <Button variant="ghost" size="xs" iconOnly leadingIcon={Copy} aria-label="Copiar resposta" className="size-5 text-text-tertiary" onClick={() => void navigator.clipboard?.writeText(message.content).catch(() => undefined)} />
            </div>
          ) : null}
          <TranscriptMessage
            message={value}
            showCaret={message.status === "running"}
            toolsExpanded={false}
            projectId={project.id}
            projectRoot={project.root}
          />
        </StepRow>,
      );
    }
  }

  for (const run of activeRuns) {
    const toph = tophs.find((item) => item.id === run.agentId);
    if (!toph) continue;
    const hasHeader = ordered.some((message) => message.tophId === toph.id && message.createdAt >= run.createdAt);
    if (!hasHeader) {
      rows.push(<TophTurnHeader key={`run-header-${run.id}`} toph={toph} model={label(toph)} />);
    }
    const activity = currentActivity(toph, run);
    rows.push(
      <ActivityStatus
        key={`run-${run.id}`}
        toph={toph}
        activity={activity}
        startedAt={run.createdAt}
      />,
    );
  }

  for (const prompt of questions) {
    const toph = tophs.find((item) => item.id === prompt.agentId);
    rows.push(
      <section key={`question-${prompt.id}`} className="flex min-w-0 max-w-full items-start gap-2.5">
        {toph ? <BotAvatar bot={toph} size={26} /> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {toph ? <strong className="text-caption-1-semibold text-text-primary">{toph.name}</strong> : null}
          <AgentQuestionCard
            questions={prompt.questions}
            onSubmit={onAnswer ? (answer) => onAnswer(prompt.id, answer) : undefined}
          />
        </div>
      </section>,
    );
  }

  return <div className={cx("flex min-w-0 flex-col", compact || mobile ? "gap-1.5" : "gap-2.5")}>{rows}</div>;
}
