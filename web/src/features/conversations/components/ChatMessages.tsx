import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Copy, LoaderCircle } from "@toph/icons";
import type { AiMessage } from "../../../app/store";
import type { Project, AIModel } from "../../../shared/api";
import type { ChatToph } from "../store";
import { isActive, type AgentQuestionPrompt, type AgentRun, type NativeMessage } from "../../agents/api";
import { modelDisplay } from "../../providers/store";
import { TranscriptMessage, toolLabel } from "./AgentTranscript";
import AgentQuestionCard from "./AgentQuestionCard";
import BotAvatar from "../../agents/components/BotAvatar";
import { Button } from "@/shared/boardui/base/buttons/button";
import { cx } from "@/shared/boardui/utils/cx";

/** Tucano draws streamed Markdown about seven times a second instead of on
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
    <article data-testid="chat-user-message" className="flex min-w-0 justify-end px-1 py-1.5">
      <p className="max-w-[min(78%,620px)] rounded-[18px] rounded-br-[6px] bg-background-tertiary-default px-3.5 py-2 text-[14px] leading-[1.65] whitespace-pre-wrap break-words text-text-primary">
        {message.content}
      </p>
    </article>
  );
}

function AgentMessage({ message, toph, label, project, grouped }: {
  message: NativeMessage;
  toph: ChatToph;
  label: string;
  project: Project;
  grouped: boolean;
}) {
  return (
    <article data-testid="chat-agent-message" className="group/msg flex min-w-0 gap-3 px-1 py-1.5">
      <div className="w-[34px] shrink-0">{grouped ? null : <BotAvatar bot={toph} size={34} />}</div>
      <div className="min-w-0 flex-1">
        {grouped ? null : (
          <div className="mb-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <strong className="truncate text-[13.5px] font-semibold text-text-primary">{toph.name}</strong>
            <span className="rounded-full bg-background-tertiary-default px-1.5 py-0.5 text-[9px] font-medium text-text-secondary">{toph.role || "Toph"}</span>
            <span className="text-[10px] text-text-tertiary">{timeLabel(message.createdAt)}</span>
            <span className="min-w-0 truncate text-[10px] text-text-tertiary">{label}</span>
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
        <div className="md min-w-0 [&_p:first-child]:mt-0 [&_pre:first-child]:mt-0 [&_ul:first-child]:mt-0 [&_ol:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre:last-child]:mb-0 [&_ul:last-child]:mb-0 [&_ol:last-child]:mb-0">
          <StreamedTranscript message={message} project={project} />
        </div>
      </div>
    </article>
  );
}

function StepRow({ message, toph, showAvatar }: { message: NativeMessage; toph?: ChatToph; showAvatar: boolean }) {
  const failed = message.status === "error";
  return (
    <div data-testid="chat-step" className="flex min-w-0 gap-3 px-1 py-0.5">
      <div className="flex w-[34px] shrink-0 justify-center">{showAvatar && toph ? <BotAvatar bot={toph} size={18} /> : null}</div>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-[12.5px] leading-relaxed text-text-secondary">
        <span className={cx("size-1.5 shrink-0 rounded-full", failed ? "bg-status-rose-text" : "bg-accent-500/50")} />
        <span className={cx("min-w-0 truncate", failed && "text-status-rose-text")}>{message.activity || fallbackActivity(message)}</span>
        {message.status === "running" ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-accent-500" /> : null}
      </div>
    </div>
  );
}

function ActivityStatus({ toph, activity, startedAt }: { toph: ChatToph; activity: { label: string; detail?: string }; startedAt: number }) {
  return (
    <div className="flex min-w-0 gap-3 px-1 py-1">
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

  for (const message of ordered) {
    if (message.role === "user") {
      lastTophId = null;
      rows.push(<UserMessage key={message.id} message={message} />);
      continue;
    }
    if (message.role === "system") {
      lastTophId = null;
      rows.push(<p key={message.id} className="py-1 text-center text-[11px] text-text-tertiary">{message.content}</p>);
      continue;
    }
    if (message.role === "error") {
      lastTophId = null;
      rows.push(<p key={message.id} className="rounded-xl bg-status-rose-background px-3 py-2 text-[12px] text-status-rose-text">{message.content}</p>);
      continue;
    }

    const toph = tophs.find((item) => item.id === message.tophId);
    if (!toph) {
      const value = toTranscriptMessage(message);
      rows.push(
        <div key={message.id} className="min-w-0 px-1">
          <TranscriptMessage message={value} showCaret={message.status === "running"} projectId={project.id} projectRoot={project.root} />
        </div>,
      );
      continue;
    }

    const grouped = lastTophId === toph.id && message.createdAt - lastTophAt < groupWindow;
    if (message.role === "activity" || message.role === "tool") {
      rows.push(<StepRow key={message.id} message={message} toph={toph} showAvatar={!grouped} />);
      lastTophId = toph.id;
      lastTophAt = message.createdAt;
      continue;
    }
    if (message.role === "reasoning") {
      rows.push(
        <StepRow
          key={message.id}
          message={{ ...message, activity: message.content || "analisou o problema" }}
          toph={toph}
          showAvatar={!grouped}
        />,
      );
      lastTophId = toph.id;
      lastTophAt = message.createdAt;
      continue;
    }
    if (message.role === "assistant") {
      if (!message.content && message.status !== "running") continue;
      rows.push(
        <AgentMessage
          key={message.id}
          message={message}
          toph={toph}
          label={label(toph, message)}
          project={project}
          grouped={grouped}
        />,
      );
      lastTophId = toph.id;
      lastTophAt = message.createdAt;
    }
  }

  for (const run of activeRuns) {
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
      <section key={`question-${prompt.id}`} className="flex min-w-0 max-w-full items-start gap-2.5 px-1">
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

  return <div className={cx("flex min-w-0 flex-col", compact || mobile ? "gap-0.5" : "gap-1")}>{rows}</div>;
}
