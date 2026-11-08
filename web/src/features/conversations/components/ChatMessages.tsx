import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  if (name === "verify") return "verificou o projeto";
  if (name === "submit_research") return "concluiu a pesquisa";
  if (name === "submit_plan") return "montou o plano de alteração";
  if (name === "report_blocked") return "encontrou um bloqueio";
  if (name === "ask_user") return "perguntou ao usuário";

  if (name === "read_skill") return "consultou uma skill";
  if (name === "search_history") return "consultou o histórico";
  if (name === "search_memory") return "consultou a memória do projeto";
  if (name === "remember") return "salvou uma memória do projeto";
  if (name === "fetch_url") return "consultou um link";
  if (name === "read_artifact") return "leu um anexo";
  if (name === "generate_image") return "gerou uma imagem";
  if (name.startsWith("email_")) return "consultou o e-mail";
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

function TophTurnHeader({ toph, model }: { toph: ChatToph; model: string }) {
  return (
    <div className="mt-3 flex min-w-0 items-center gap-2 first:mt-0">
      <BotAvatar bot={toph} size={24} />
      <strong className="truncate text-[13px] font-semibold text-text-primary">{toph.name}</strong>
      <span className="truncate text-[10px] text-text-tertiary">{toph.role || "Toph"}</span>
      <span className="text-text-tertiary">·</span>
      <span className="truncate text-[10px] text-text-tertiary">{model}</span>
    </div>
  );
}

function ActivityLine({ toph, text, status }: { toph?: ChatToph; text: string; status?: string }) {
  const failed = status === "error";
  return (
    <div className="flex min-w-0 items-center gap-2 ps-1 text-[12px] leading-relaxed text-text-secondary">
      {toph ? <BotAvatar bot={toph} size={16} /> : <span className="size-4 shrink-0" />}
      <strong className={cx("shrink-0 text-[12px] font-medium", failed ? "text-status-rose-text" : "text-text-primary")}>{toph?.name ?? "Toph"}</strong>
      {status === "running" ? (
        <LoaderCircle className="size-3.5 shrink-0 animate-spin text-accent-500" />
      ) : (
        <span className={cx("size-1.5 shrink-0 rounded-full", failed ? "bg-status-rose-text" : "bg-accent-500/60")} />
      )}
      <span className={cx("min-w-0 truncate", failed && "text-status-rose-text")}>{text}</span>
    </div>
  );
}

function ActivityStatus({ toph, activity, startedAt }: { toph: ChatToph; activity: { label: string; detail?: string }; startedAt: number }) {
  return (
    <div className="flex min-w-0 items-center gap-2 ps-1 text-[12px] text-text-secondary">
      <BotAvatar bot={toph} size={16} />
      <strong className="shrink-0 text-[12px] font-medium text-text-primary">{toph.name}</strong>
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
      if (last.status === "running") return { label: toolLabel(toTranscriptMessage(last)), detail: last.activity || fallbackActivity(last) };
      return { label: "Pensando" };
    }
    if (last.role === "reasoning") return { label: last.status === "running" ? "Pensando" : "Processando" };
    if (last.role === "assistant") return { label: last.status === "running" && last.content ? "Respondendo" : "Pensando" };
    return { label: "Pensando" };
  }

  const rows: ReactNode[] = [];
  let activeTophId: string | null = null;

  for (const message of ordered) {
    if (message.role === "user") {
      activeTophId = null;
      rows.push(
        <div key={message.id} className="ms-auto flex min-w-0 max-w-[88%] flex-col items-end gap-1">
          <span className="px-1 text-[10px] text-text-tertiary">{timeLabel(message.createdAt)}</span>
          <p className="min-w-0 max-w-full overflow-hidden rounded-2xl rounded-tr-md bg-accent-500 px-3.5 py-2 text-[14px] leading-[1.55] whitespace-pre-wrap break-words text-text-on-accent">
            {message.content}
          </p>
        </div>,
      );
      continue;
    }
    if (message.role === "system") {
      rows.push(
        <p key={message.id} className="py-1 text-center text-[11px] text-text-tertiary">{message.content}</p>,
      );
      continue;
    }
    if (message.role === "error") {
      rows.push(
        <p key={message.id} className="rounded-xl bg-status-rose-background px-3 py-2 text-[12px] text-status-rose-text">{message.content}</p>,
      );
      continue;
    }

    const toph = tophs.find((item) => item.id === message.tophId);
    if (!toph) {
      const value = toTranscriptMessage(message);
      rows.push(
        <div key={message.id} className="min-w-0">
          <TranscriptMessage message={value} showCaret={message.status === "running"} projectId={project.id} projectRoot={project.root} bubble />
        </div>,
      );
      continue;
    }

    if (activeTophId !== toph.id) {
      activeTophId = toph.id;
      rows.push(<TophTurnHeader key={`header-${message.id}`} toph={toph} model={label(toph, message)} />);
    }

    if (message.role === "activity" || message.role === "tool") {
      rows.push(
        <ActivityLine key={message.id} toph={toph} text={message.activity || fallbackActivity(message)} status={message.status} />,
      );
      continue;
    }
    if (message.role === "reasoning") {
      rows.push(
        <ActivityLine key={message.id} toph={toph} text="analisou o problema" status={message.status} />,
      );
      continue;
    }
    if (message.role === "assistant") {
      if (!message.content && message.status !== "running") continue;
      const value = toTranscriptMessage(message);
      rows.push(
        <div key={message.id} className="flex min-w-0 max-w-[88%] flex-col items-start gap-1">
          {message.status !== "running" ? (
            <div className="flex items-center gap-1.5 ps-1 text-[10px] text-text-tertiary">
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
            bubble
          />
        </div>,
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
