import { useMemo, useState } from "react";
import { Copy, CornerDownRight, ListTree } from "@toph/icons";
import type { Project, AIModel } from "../../../shared/api";
import type { AiMessage } from "../../../app/store";
import type { ChatToph } from "../store";
import { isActive, type AgentRun, type NativeMessage } from "../../agents/api";
import { modelDisplay } from "../../providers/store";
import BotAvatar from "../../agents/components/BotAvatar";
import AgentTranscript from "./AgentTranscript";
import AgentActivity, { type AgentActivityState } from "./AgentActivity";
import { Button } from "@/shared/boardui/base/buttons/button";
import { cx } from "@/shared/boardui/utils/cx";

export function toTranscriptMessage(message: NativeMessage): AiMessage {
  return { id: message.id, role: message.role === "system" ? "assistant" : message.role, text: message.content, detail: message.detail, title: message.title, status: message.status, createdAt: message.createdAt };
}

function MessageInfo({ message, toph, model, align = "start" }: { message: NativeMessage; toph?: ChatToph; model: string; align?: "start" | "end" }) {
  return <div className={cx("flex items-center gap-1.5 px-1 text-[11px] text-text-tertiary", align === "end" && "justify-end")}>
    <span>{(message.agentMode ?? toph?.agentMode) === "plan" ? "Plan" : "Build"}</span><span>·</span><span className="truncate">{model}</span><span>·</span>
    <span className="shrink-0">{new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
    <Button variant="ghost" size="xs" iconOnly leadingIcon={Copy} aria-label={message.role === "user" ? "Copiar mensagem" : "Copiar resposta"} className="size-5 text-text-tertiary" onClick={() => void navigator.clipboard?.writeText(message.content).catch(() => undefined)} />
  </div>;
}

function ActivityAvatar({ toph, state }: { toph: ChatToph; state?: AgentActivityState }) {
  return <span className={cx("relative mt-0.5 inline-flex shrink-0 items-center justify-center", state && `toph-activity-${state}`)}>
    {state && <span className="toph-activity-ring" aria-hidden />}
    <BotAvatar bot={toph} size={32} className={cx("relative z-[1]", state && "toph-activity-avatar")} />
  </span>;
}

interface Group { kind: "user" | "system" | "toph"; id: string; tophId?: string; messages: NativeMessage[] }
interface Props { messages: NativeMessage[]; tophs: ChatToph[]; coordinator: ChatToph | null; runs: AgentRun[]; models: AIModel[]; defaultModel: string; project: Project; mobile: boolean }

export default function ChatMessages({ messages, tophs, coordinator, runs, models, defaultModel, project, mobile }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const groups = useMemo(() => {
    const result: Group[] = [];
    for (const message of messages) {
      if (!message.content && message.role === "assistant" && message.status !== "running") continue;
      const kind = message.role === "user" ? "user" : message.role === "system" ? "system" : "toph";
      const previous = result[result.length - 1];
      if (kind !== "user" && previous?.kind === kind && previous.tophId === message.tophId) previous.messages.push(message);
      else result.push({ id: message.id, kind, tophId: message.tophId, messages: [message] });
    }
    return result;
  }, [messages]);
  const lastGroup = new Map<string | undefined, string>();
  for (const group of groups) if (group.kind === "toph") lastGroup.set(group.tophId, group.id);
  const activeRuns = runs.filter(isActive);
  const label = (toph: ChatToph | undefined, message?: NativeMessage) => {
    const id = message?.model || toph?.model || defaultModel;
    return modelDisplay(models.find((m) => m.id === id) ?? (id ? { id, label: id.split("::").pop()?.split("/").pop() ?? id } : undefined));
  };

  return <>
    {groups.map((group) => {
      if (group.kind === "user") {
        const message = group.messages[0];
        const toph = tophs.find((a) => a.id === message.tophId) ?? coordinator ?? undefined;
        return <div key={group.id} className="ms-auto flex min-w-0 max-w-[88%] flex-col items-end gap-1">
          <p className="min-w-0 max-w-full overflow-hidden rounded-2xl bg-accent-500 px-3.5 py-2 text-[14px] leading-[1.55] whitespace-pre-wrap break-words text-text-on-accent">{message.content}</p>
          <MessageInfo message={message} toph={toph} model={label(toph, message)} align="end" />
        </div>;
      }
      if (group.kind === "system") return <div key={group.id} className="flex flex-col items-center gap-1.5">{group.messages.map((message) => <span key={message.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-accent-500/20 bg-accent-500/10 px-2.5 py-1 text-[11px] text-accent-600"><CornerDownRight size={12} className="shrink-0" /><span className="truncate" title={message.content}>{message.content}</span></span>)}</div>;
      const toph = tophs.find((a) => a.id === group.tophId);
      if (!toph) return <AgentTranscript key={group.id} messages={group.messages.map(toTranscriptMessage)} streaming={false} projectId={project.id} projectRoot={project.root} />;
      const run = activeRuns.find((r) => r.agentId === toph.id);
      const current = Boolean(run && lastGroup.get(toph.id) === group.id && group.messages.some((m) => m.createdAt >= run.createdAt));
      const tools = group.messages.filter((m) => m.role === "tool" || m.role === "reasoning");
      const state: AgentActivityState | undefined = current ? tools.some((m) => m.status === "running") ? "working" : group.messages.some((m) => m.role === "assistant" && m.content) ? "responding" : "thinking" : undefined;
      const text = mobile ? group.messages : group.messages.filter((m) => m.role !== "tool" && m.role !== "reasoning");
      const footer = [...group.messages].reverse().find((m) => m.role === "assistant" && m.status !== "running" && m.content);
      return <section key={group.id} className="flex min-w-0 max-w-full items-start gap-2.5 [content-visibility:auto] [contain-intrinsic-size:auto_200px]">
        <ActivityAvatar toph={toph} state={state} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 border-s-2 ps-2.5" style={{ borderColor: `${toph.color}33` }}>
          <header className="flex min-w-0 items-baseline gap-2" title={toph.role}><strong className="truncate text-caption-1-semibold text-text-primary">{toph.name}</strong><span className="truncate text-caption-2-regular text-text-tertiary">{state ? <span className="toph-activity-status text-accent-500">{state === "thinking" ? "Pensando" : state === "working" ? "Trabalhando" : "Respondendo"}<span className="toph-activity-ellipsis" aria-hidden><i>.</i><i>.</i><i>.</i></span></span> : label(toph)}</span></header>
          {state && <AgentActivity messages={tools.map(toTranscriptMessage)} state={state} startedAt={run!.createdAt} projectId={project.id} projectRoot={project.root} />}
          <AgentTranscript messages={text.map(toTranscriptMessage)} streaming={current} projectId={project.id} projectRoot={project.root} />
          {!state && tools.length > 0 && <button type="button" onClick={() => setExpanded(expanded === group.id ? null : group.id)} className="flex w-fit items-center gap-1.5 rounded-full border border-border-button-default bg-background-secondary-default px-2 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent-500/40 hover:bg-accent-500/5 hover:text-accent-600" aria-expanded={expanded === group.id}><ListTree size={12} />{tools.length} {tools.length === 1 ? "atividade" : "atividades"}</button>}
          {!mobile && expanded === group.id && <div className="toph-view-in mt-1 rounded-2xl border border-border-button-default bg-background-secondary-default/60 p-2.5"><div className="mb-1.5 flex items-center justify-between px-1"><span className="text-[11px] font-medium text-text-secondary">O que {toph.name} fez</span><button type="button" onClick={() => setExpanded(null)} className="text-[11px] text-text-tertiary">Fechar</button></div><AgentTranscript messages={tools.map(toTranscriptMessage)} streaming={false} projectId={project.id} projectRoot={project.root} /></div>}
          {footer && <MessageInfo message={footer} toph={toph} model={label(toph, footer)} />}
        </div>
      </section>;
    })}
    {activeRuns.filter((run) => !groups.some((g) => g.kind === "toph" && g.tophId === run.agentId && g.messages.some((m) => m.createdAt >= run.createdAt))).map((run) => {
      const toph = tophs.find((a) => a.id === run.agentId);
      return toph ? <section key={run.id} className="flex items-start gap-2.5"><ActivityAvatar toph={toph} state="thinking" /><div className="flex min-w-0 flex-1 flex-col gap-1.5"><strong className="text-caption-1-semibold">{toph.name}</strong><AgentActivity messages={[]} state="thinking" startedAt={run.createdAt} projectId={project.id} projectRoot={project.root} /></div></section> : null;
    })}
  </>;
}
