import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Bot, History, Plus, Settings2 } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { activeChat, chatCoordinator, chatTophs, useChats } from "../store";
import { useAI } from "../../providers/store";
import { useTophDrafts } from "../../agents/drafts";
import { agentApi, isActive, type AgentSession } from "../../agents/api";
import { useAgentChat } from "../../agents/useAgentChat";
import { AgentComposer, type AgentAttachment } from "./AgentComposer";
import AgentTranscript from "./AgentTranscript";
import BotAvatar from "../../agents/components/BotAvatar";
import type { AiMessage } from "../../../app/store";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Modal } from "@/shared/boardui/base/modal/modal";

const BotConfig = lazy(() => import("../../agents/components/BotConfig"));
const TophGallery = lazy(() => import("../../agents/components/TophGallery"));
const TophSessionsSheet = lazy(() => import("./TophSessionsSheet"));

export interface TophActionRequest { tophId: string; action: "config" | "sessions" }
interface Props { project: Project; mobile?: boolean; externalAction?: TophActionRequest | null; onExternalActionHandled?: () => void }

export default function BotStudioTab({ project, mobile = false, externalAction, onExternalActionHandled }: Props) {
  const stored = useChats((s) => s.byProject[project.id]);
  const chat = activeChat(stored);
  const tophs = useMemo(() => chatTophs(stored, chat?.id), [stored?.tophs, chat?.id]);
  const coordinator = chatCoordinator(tophs);
  const config = useAI((s) => s.config);
  const models = useAI((s) => s.models);
  const updateToph = useChats((s) => s.updateToph);
  const native = useAgentChat(project.id, chat?.id);
  const [sending, setSending] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [sessionsId, setSessionsId] = useState<string | null>(null);
  const selected = tophs.find((a) => a.id === configId);
  const sessionToph = tophs.find((a) => a.id === sessionsId) ?? null;
  const draftKey = `${project.id}:${chat?.id ?? ""}:native`;
  const text = useTophDrafts((s) => s.drafts[draftKey] ?? "");
  const setDraft = useTophDrafts((s) => s.setDraft);
  const clearDraft = useTophDrafts((s) => s.clearDraft);
  const busy = native.busy || sending;
  const scroller = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const sendLock = useRef(false);
  const pendingRequest = useRef<{ text: string; id: string } | null>(null);

  useEffect(() => {
    if (!externalAction) return;
    if (externalAction.action === "config") setConfigId(externalAction.tophId);
    else setSessionsId(externalAction.tophId);
    onExternalActionHandled?.();
  }, [externalAction, onExternalActionHandled]);
  useEffect(() => {
    const listener = (raw: Event) => {
      const value = (raw as CustomEvent<{ action: string; tophId?: string }>).detail;
      if (value.action === "add") setGallery(true);
      else if (value.action === "config") setConfigId(value.tophId ?? null);
      else if (value.action === "sessions") setSessionsId(value.tophId ?? null);
    };
    window.addEventListener("toph:bot-action", listener);
    return () => window.removeEventListener("toph:bot-action", listener);
  }, []);
  useEffect(() => {
    if (follow.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [native.messages, native.approvals, busy]);

  async function send(value: string, attachments: AgentAttachment[]) {
    if (!chat || !coordinator || sendLock.current || busy) return;
    if (value.trim() === "/clear") {
      await newSession(coordinator.id); clearDraft(draftKey); return;
    }
    if (value.trim() === "/compact") { native.setError("O contexto é compactado automaticamente conforme o orçamento de tokens. O histórico completo permanece salvo."); return; }
    sendLock.current = true; setSending(true); native.setError(""); follow.current = true;
    const identity = JSON.stringify([value, attachments]);
    const requestId = pendingRequest.current?.text === identity ? pendingRequest.current.id : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    pendingRequest.current = { text: identity, id: requestId };
    try {
      await agentApi.start(project.id, { requestId, chatId: chat.id, agentId: coordinator.id, text: value, agents: tophs, attachments });
      pendingRequest.current = null; clearDraft(draftKey);
      await native.refresh();
    } catch (e) { native.setError(e instanceof Error ? e.message : "Não foi possível iniciar a execução"); }
    finally { sendLock.current = false; setSending(false); }
  }
  async function stop() {
    try { await Promise.all(native.runs.filter(isActive).map((run) => agentApi.cancel(project.id, run.id))); }
    catch (e) { native.setError(e instanceof Error ? e.message : "Falha ao cancelar"); }
  }
  async function newSession(agentId: string) {
    try { await agentApi.switchSession(project.id, agentId, null); await native.refresh(true); }
    catch (e) { native.setError(e instanceof Error ? e.message : "Falha ao criar sessão"); }
  }
  async function selectSession(session: AgentSession) {
    try { await agentApi.switchSession(project.id, session.agentId, session.id); setSessionsId(null); await native.refresh(true); }
    catch (e) { native.setError(e instanceof Error ? e.message : "Falha ao abrir sessão"); }
  }
  const lastRun = native.runs.find((r) => !r.parentId);
  const lastError = lastRun && (lastRun.state === "failed" || lastRun.state === "interrupted") ? lastRun.error : "";
  const messageGroups = useMemo(() => {
    const groups: Array<{ id: string; tophId?: string; messages: AiMessage[] }> = [];
    for (const message of native.messages) {
      if (!message.content && message.role === "assistant") continue;
      const role = message.role === "system" ? "assistant" : message.role;
      const item: AiMessage = { id: message.id, role, text: message.content, detail: message.detail, title: message.title, status: message.status, createdAt: message.createdAt };
      const previous = groups[groups.length - 1];
      if (role !== "user" && previous?.tophId === message.tophId && previous.messages[0].role !== "user") previous.messages.push(item);
      else groups.push({ id: message.id, tophId: message.tophId, messages: [item] });
    }
    return groups;
  }, [native.messages]);

  return <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-primary-default">
    {!mobile && <header className="flex shrink-0 items-center gap-2 border-b border-separator-border px-4 py-3">
      <Bot size={18} className="text-accent-500" />
      <div className="min-w-0 flex-1"><strong className="text-body-medium">{chat?.name ?? "Toph"}</strong><p className="text-caption-2-regular text-text-tertiary">Harness Toph · execução no servidor</p></div>
      {tophs.map((toph) => <button key={toph.id} onClick={() => setConfigId(toph.id)} title={`${toph.name} · configurar`}><BotAvatar bot={toph} size={28} /></button>)}
      <Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Adicionar Toph" onClick={() => setGallery(true)} />
      <Button variant="ghost" size="xs" iconOnly leadingIcon={History} aria-label="Sessões" disabled={!coordinator || busy} onClick={() => setSessionsId(coordinator?.id ?? null)} />
      <Button variant="ghost" size="xs" iconOnly leadingIcon={Settings2} aria-label="Configurar Toph" disabled={!coordinator} onClick={() => setConfigId(coordinator?.id ?? null)} />
    </header>}
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6" onScroll={() => { const el = scroller.current; if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {native.hasMore && <Button variant="ghost" size="small" disabled={native.loading} onClick={() => { follow.current = false; void native.older(); }}>{native.loading ? "Carregando…" : "Carregar mensagens anteriores"}</Button>}
        {!tophs.length && <div className="flex flex-col items-center gap-3 py-12"><Bot size={36} /><h2 className="text-lg font-semibold">Seu agente Toph</h2><p>Adicione um Toph para conversar e executar tarefas.</p><Button onClick={() => setGallery(true)}>Adicionar Toph</Button></div>}
        {tophs.length > 0 && !native.messages.length && <p className="py-10 text-center text-text-secondary">O que vamos resolver neste projeto?</p>}
        {messageGroups.map((group) => {
          const user = group.messages[0].role === "user";
          const author = tophs.find((a) => a.id === group.tophId);
          return <section key={group.id} className={user ? "ml-auto w-fit max-w-[92%] rounded-2xl bg-background-secondary-default px-4 py-2" : "min-w-0"} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 80px" }}>
            {!user && author && <div className="mb-2 flex items-center gap-2"><BotAvatar bot={author} size={24} /><span className="text-caption-1-semibold">{author.name}</span></div>}
            <AgentTranscript messages={group.messages} streaming={busy && group.messages.some((m) => m.role === "assistant" && m.status === "running")} projectId={project.id} projectRoot={project.root} />
          </section>;
        })}
        {native.approvals.map((approval) => <section key={approval.id} className="rounded-xl border border-accent-500/40 p-3">
          <strong>Autorizar {approval.name}?</strong><pre className="my-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{approval.arguments}</pre>
          <div className="flex gap-2"><Button onClick={() => void agentApi.approve(project.id, approval.id, true).catch((e) => native.setError(String(e)))}>Autorizar uma vez</Button><Button variant="secondary" onClick={() => void agentApi.approve(project.id, approval.id, false).catch((e) => native.setError(String(e)))}>Recusar</Button></div>
        </section>)}
        {native.compacting && <p role="status" className="text-sm text-text-tertiary">Compactando contexto; histórico preservado…</p>}
        {(native.error || lastError) && <p role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-red-500">{native.error || lastError}</p>}
      </div>
    </div>
    {coordinator && <div className="mx-auto w-full max-w-4xl shrink-0 px-2 pb-2">
      <AgentComposer value={text} onChange={(value) => setDraft(draftKey, value)} onSend={(value, files) => void send(value, files)} onStop={() => void stop()} busy={busy} models={models} model={coordinator.model || config?.model || ""} onModelChange={(model) => updateToph(project.id, coordinator.id, { model })} effort={coordinator.effort} efforts={[]} placeholder={`Converse com ${coordinator.name}…`} history={native.messages.filter((m) => m.role === "user").map((m) => m.content)} />
      <p className="px-3 text-right text-[10px] text-text-tertiary">{native.usage.inputTokens.toLocaleString()} entrada · {native.usage.outputTokens.toLocaleString()} saída · {native.usage.cachedTokens.toLocaleString()} cache · {native.usage.calls} chamadas</p>
    </div>}
    <Modal isOpen={Boolean(selected)} onClose={() => setConfigId(null)} title={selected?.name ?? "Toph"} size="xl" placement={mobile ? "bottom" : "center"}>
      <Suspense fallback={<p>Carregando…</p>}>{selected && <BotConfig projectId={project.id} projectRoot={project.root} bot={selected} />}</Suspense>
    </Modal>
    <Suspense fallback={null}>
      {sessionToph && <TophSessionsSheet open project={project} toph={sessionToph} onClose={() => setSessionsId(null)} onSelect={(s) => void selectSession(s)} onNew={() => { void newSession(sessionToph.id); setSessionsId(null); }} />}
      {gallery && <TophGallery open projectId={project.id} chatId={chat?.id ?? null} onClose={() => setGallery(false)} onCreated={setConfigId} />}
    </Suspense>
  </div>;
}
