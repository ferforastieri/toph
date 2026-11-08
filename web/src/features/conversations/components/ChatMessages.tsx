import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Copy, LoaderCircle } from "@toph/icons";
import type { AiMessage } from "../../../app/store";
import type { Project } from "../../../shared/api";
import type { ChatToph } from "../store";
import { isActive, type AgentQuestionPrompt, type AgentRun, type NativeMessage } from "../../agents/api";
import { TranscriptMessage, toolLabel } from "./AgentTranscript";
import AgentQuestionCard from "./AgentQuestionCard";
import BotAvatar from "../../agents/components/BotAvatar";
import { Button } from "@/shared/boardui/base/buttons/button";
import { cx } from "@/shared/boardui/utils/cx";

/** Streamed Markdown is repainted about seven times a second instead of on
 * every token. The server keeps the full text; this only paces the paint. */
const STREAM_MS = 140;

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
    role: message.role === "system" || message.role === "activity" ? "assistant" : message.role,
    text: message.content,
    detail: message.detail,
    title: message.title,
    status: message.status,
    createdAt: message.createdAt,
  };
  transcriptCache.set(message, result);
  return result;
}

function short(value: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length <= 80 ? text : `${text.slice(0, 79)}…`;
}

function fallbackActivity(message: NativeMessage): string {
  const name = (message.title ?? "").toLowerCase();
  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(message.content ?? "{}");
    if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>;
  } catch {
    // Tool output is not always JSON; the label below is enough.
  }
  const path = typeof args.path === "string" ? short(args.path) : "";
  const query = typeof args.query === "string" ? short(args.query) : "";
  if (name === "read_file") return path ? `leu \`${path}\`` : "leu um arquivo";
  if (name === "edit_file" || name === "write_file") return path ? `editou \`${path}\`` : "editou um arquivo";
  if (name === "delete_file") return path ? `removeu \`${path}\`` : "removeu um arquivo";
  if (name === "search") return query ? `pesquisou por \`${query}\`` : "pesquisou no projeto";
  if (name === "list_files") return "listou arquivos do projeto";
  if (name === "shell") return "executou um comando no projeto";
  if (name === "read_skill") return "consultou uma skill";
  if (name === "search_history") return "consultou o histórico";
  if (name === "search_memory") return "consultou a memória do projeto";
  if (name === "remember") return "salvou uma memória do projeto";
  if (name === "fetch_url") return "consultou um link";
  if (name === "read_artifact") return "leu um anexo";
  if (name === "delegate") return "passou uma tarefa para outro Toph";
  if (name === "generate_image") return "gerou uma imagem";
  if (name.startsWith("email_")) return "consultou o e-mail";
  if (name === "mcp_list") return "listou as ferramentas da integração";
  if (name === "mcp_call") return "usou uma integração";
  return "usou uma ferramenta";
}

interface Props {
  messages: NativeMessage[];
  tophs: ChatToph[];
  runs: AgentRun[];
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

function useStreamedText(message: NativeMessage): string {
  const running = message.status === "running";
  const latest = useRef(message.content);
  latest.current = message.content;
  const [text, setText] = useState(message.content);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setText(latest.current), STREAM_MS);
    return () => window.clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (!running) setText(message.content);
  }, [message.content, running]);
  return running ? text : message.content;
}

function StreamedTranscript({ message, project }: { message: NativeMessage; project: Project }) {
  const text = useStreamedText(message);
  const value = useMemo(() => ({ ...toTranscriptMessage(message), text }), [message, text]);
  return (
    <TranscriptMessage
      message={value}
      showCaret={message.status === "running"}
      projectId={project.id}
      projectRoot={project.root}
    />
  );
}

function UserMessage({ message }: { message: NativeMessage }) {
  return (
    <article data-testid="chat-user-message" className="toph-msg-in flex min-w-0 justify-end py-1.5">
      <p className="max-w-[min(78%,620px)] rounded-[18px] rounded-br-[6px] bg-background-tertiary-default px-3.5 py-2 text-[14px] leading-[1.65] whitespace-pre-wrap break-words text-text-primary">
        {message.content}
      </p>
    </article>
  );
}

function AgentMessage({ message, toph, project, grouped, steps }: {
  message: NativeMessage;
  toph: ChatToph;
  project: Project;
  grouped: boolean;
  steps: NativeMessage[];
}) {
  return (
    <article data-testid="chat-agent-message" className="toph-msg-in group/msg flex min-w-0 gap-3 py-1.5">
      <div className="w-[34px] shrink-0">{grouped ? null : <BotAvatar bot={toph} size={34} />}</div>
      <div className="min-w-0 flex-1">
        {grouped ? null : (
          <div className="mb-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <strong className="truncate text-[13.5px] font-semibold text-text-primary">{toph.name}</strong>
            <span className="text-[11px] text-text-tertiary">{timeLabel(message.createdAt)}</span>
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              leadingIcon={Copy}
              aria-label="Copiar resposta"
              title="Copiar resposta"
              className="size-5 text-text-tertiary opacity-0 transition-opacity group-hover/msg:opacity-100 focus-visible:opacity-100"
              onClick={() => void navigator.clipboard?.writeText(message.content).catch(() => undefined)}
            />
          </div>
        )}
        <RunSteps steps={steps} working={message.status === "running"} />
        <div className="md min-w-0 [&_p:first-child]:mt-0 [&_pre:first-child]:mt-0 [&_ul:first-child]:mt-0 [&_ol:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre:last-child]:mb-0 [&_ul:last-child]:mb-0 [&_ol:last-child]:mb-0">
          <StreamedTranscript message={message} project={project} />
        </div>
      </div>
    </article>
  );
}

function stepLabel(message: NativeMessage): string {
  if (message.activity) return message.activity;
  if (message.role === "reasoning") return message.content || "analisou o problema";
  return fallbackActivity(message);
}

function StepItem({ message }: { message: NativeMessage }) {
  const failed = message.status === "error";
  return (
    <div data-testid="chat-step" className="flex min-w-0 items-center gap-2 py-0.5 text-[12.5px] leading-relaxed text-text-secondary">
      <span className={cx("size-1.5 shrink-0 rounded-full", failed ? "bg-status-rose-text" : "bg-accent-500/50")} />
      <span className={cx("min-w-0 truncate", failed && "text-status-rose-text")}>{stepLabel(message)}</span>
      {message.status === "running" ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-accent-500" /> : null}
    </div>
  );
}

function RunSteps({ steps, working }: { steps: NativeMessage[]; working: boolean }) {
  const [open, setOpen] = useState(working);
  useEffect(() => {
    if (working) setOpen(true);
  }, [working]);
  if (steps.length === 0) return null;
  const labels = [...new Set(steps.map(stepLabel))];
  const current = [...steps].reverse().find((message) => message.status === "running");
  const failed = steps.some((message) => message.status === "error");
  const summary = working
    ? current ? `${stepLabel(current)}…` : "Trabalhando…"
    : `${failed ? "" : "Pronto · "}${steps.length} ${steps.length === 1 ? "passo" : "passos"}`;
  return (
    <div className="my-0.5 max-w-[600px] text-[12.5px]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="-ms-1 inline-flex max-w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-text-tertiary transition-colors hover:bg-background-primary-hover hover:text-text-secondary"
      >
        {working ? (
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent-500" />
        ) : (
          <ChevronDown className={cx("size-3 shrink-0 transition-transform duration-300", open ? "rotate-0" : "-rotate-90")} />
        )}
        <span className={cx("shrink-0", working && "text-accent-500")}>{summary}</span>
        {!working && labels.length > 0 ? <span className="min-w-0 truncate text-text-tertiary">{labels.slice(0, 3).join(", ")}</span> : null}
      </button>
      {open ? (
        <div className="ms-1 mt-0.5 flex flex-col gap-0.5 border-s-2 border-separator-border py-1 ps-3">
          {steps.map((message) => <StepItem key={message.id} message={message} />)}
        </div>
      ) : null}
    </div>
  );
}

function StepGroup({ messages, toph, showAvatar }: { messages: NativeMessage[]; toph: ChatToph; showAvatar: boolean }) {
  const working = messages.some((message) => message.status === "running");
  return (
    <div data-testid="chat-step-group" className="toph-msg-in flex min-w-0 gap-3 py-0.5">
      <div className="flex w-[34px] shrink-0 justify-center">{showAvatar ? <BotAvatar bot={toph} size={18} /> : null}</div>
      <div className="min-w-0 flex-1"><RunSteps steps={messages} working={working} /></div>
    </div>
  );
}

function ActivityStatus({ toph, activity, startedAt }: { toph: ChatToph; activity: { label: string; detail?: string }; startedAt: number }) {
  return (
    <div className="toph-msg-in flex min-w-0 gap-3 py-1">
      <div className="w-[34px] shrink-0"><BotAvatar bot={toph} size={34} /></div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[12.5px] text-text-secondary">
        <strong className="text-[13px] font-semibold text-text-primary">{toph.name}</strong>
        <LoaderCircle className="size-3.5 shrink-0 animate-spin text-accent-500" />
        <span className="shrink-0 text-accent-600">{activity.label}</span>
        {activity.detail ? <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-text-tertiary" dir="ltr">{activity.detail}</span> : <span className="min-w-0 flex-1" />}
        <Elapsed startedAt={startedAt} />
      </div>
    </div>
  );
}

export default function ChatMessages({
  messages,
  tophs,
  runs,
  project,
  questions = [],
  onAnswer,
}: Props) {
  const ordered = useMemo(() => [...messages].sort(messageOrder), [messages]);
  const activeRuns = runs.filter(isActive);
  const assistantRuns = useMemo(() => new Set(ordered.filter((message) => message.role === "assistant" && message.runId).map((message) => message.runId!)), [ordered]);
  const stepsByRun = useMemo(() => {
    const map = new Map<string, NativeMessage[]>();
    for (const message of ordered) {
      if ((message.role === "tool" || message.role === "reasoning" || message.role === "activity") && message.runId && assistantRuns.has(message.runId)) {
        const list = map.get(message.runId) ?? [];
        list.push(message);
        map.set(message.runId, list);
      }
    }
    return map;
  }, [ordered, assistantRuns]);

  function currentActivity(toph: ChatToph, run: AgentRun): { label: string; detail?: string } {
    const own = ordered.filter((message) => message.tophId === toph.id && message.createdAt >= run.createdAt);
    const last = own[own.length - 1];
    if (!last) return { label: "Pensando" };
    if (last.role === "tool") {
      if (last.status === "running") return { label: toolLabel(toTranscriptMessage(last)), detail: last.activity || fallbackActivity(last) };
      return { label: "Pensando" };
    }
    if (last.role === "reasoning") return { label: last.status === "running" ? "Pensando" : "Processando" };
    if (last.role === "assistant") return { label: last.status === "running" && last.content ? "Respondendo" : "Pensando" };
    return { label: "Pensando" };
  }

  const rows: ReactNode[] = [];
  const groupWindow = 5 * 60 * 1000;
  let lastTophId: string | null = null;
  let lastTophAt = 0;
  let pendingSteps: NativeMessage[] = [];
  let pendingToph: ChatToph | null = null;
  let pendingShowAvatar = false;

  function flushSteps() {
    if (!pendingToph || pendingSteps.length === 0) return;
    rows.push(<StepGroup key={`steps-${pendingSteps[0].id}`} messages={pendingSteps} toph={pendingToph} showAvatar={pendingShowAvatar} />);
    pendingSteps = [];
    pendingToph = null;
  }

  for (const message of ordered) {
    if (message.role === "user") {
      flushSteps();
      lastTophId = null;
      rows.push(<UserMessage key={message.id} message={message} />);
      continue;
    }
    if (message.role === "system") {
      flushSteps();
      lastTophId = null;
      rows.push(<p key={message.id} className="py-1 text-center text-[11px] text-text-tertiary">{message.content}</p>);
      continue;
    }
    if (message.role === "error") {
      flushSteps();
      lastTophId = null;
      rows.push(<p key={message.id} className="rounded-xl bg-status-rose-background px-3 py-2 text-[12px] text-status-rose-text">{message.content}</p>);
      continue;
    }

    const toph = tophs.find((item) => item.id === message.tophId);
    if (!toph) {
      flushSteps();
      const value = toTranscriptMessage(message);
      rows.push(
        <div key={message.id} className="toph-msg-in min-w-0">
          <TranscriptMessage message={value} showCaret={message.status === "running"} projectId={project.id} projectRoot={project.root} />
        </div>,
      );
      continue;
    }

    if ((message.role === "activity" || message.role === "tool" || message.role === "reasoning") && message.runId && assistantRuns.has(message.runId)) {
      continue;
    }
    const grouped = lastTophId === toph.id && message.createdAt - lastTophAt < groupWindow;
    if (message.role === "activity" || message.role === "tool" || message.role === "reasoning") {
      if (!pendingToph || pendingToph.id !== toph.id) {
        flushSteps();
        pendingToph = toph;
        pendingShowAvatar = !grouped;
      }
      pendingSteps.push(message);
      lastTophId = toph.id;
      lastTophAt = message.createdAt;
      continue;
    }
    if (message.role === "assistant") {
      if (!message.content && message.status !== "running") continue;
      flushSteps();
      rows.push(
        <AgentMessage
          key={message.id}
          message={message}
          toph={toph}
          project={project}
          grouped={grouped}
          steps={message.runId ? stepsByRun.get(message.runId) ?? [] : []}
        />,
      );
      lastTophId = toph.id;
      lastTophAt = message.createdAt;
    }
  }

  flushSteps();

  for (const run of activeRuns) {
    if (ordered.some((message) => message.runId === run.id && message.role === "assistant")) continue;
    const toph = tophs.find((item) => item.id === run.agentId);
    if (!toph) continue;
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
      <section key={`question-${prompt.id}`} className="toph-msg-in flex min-w-0 max-w-full items-start gap-2.5">
        <div className="w-[34px] shrink-0">{toph ? <BotAvatar bot={toph} size={34} /> : null}</div>
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

  return <div className="flex min-w-0 flex-col">{rows}</div>;
}
