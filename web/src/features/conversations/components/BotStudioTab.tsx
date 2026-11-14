import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Bot, LoaderCircle, Timer } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { ApiError } from "../../../shared/api";
import { chatDisplayName, chatTophs, sessionSubject, useChats } from "../store";
import { defaultModel, findModel, useAI } from "../../providers/store";
import { useTophDrafts } from "../../agents/drafts";
import { agentApi, isActive, type NativeMessage } from "../../agents/api";
import { useAgentChat } from "../../agents/useAgentChat";
import { AgentComposer, type AgentAttachment } from "./AgentComposer";
import ChatMessages from "./ChatMessages";
import ChatUsageMeter from "./ChatUsageMeter";
import ConversationModelPicker from "./ConversationModelPicker";
import ApprovalCard from "./ApprovalCard";
import BotAvatar from "../../agents/components/BotAvatar";
import { unlockBotSound } from "../sound";
import { Button } from "@toph/ui/app";
import { cx } from "@toph/ui";

interface Props {
  project: Project;
  conversationId: string;
  mobile?: boolean;
  embedded?: boolean;
  compact?: boolean;
  headerControl?: ReactNode;
}

export default function BotStudioTab({ project, conversationId, mobile = false, embedded = false, compact = false, headerControl }: Props) {
  const stored = useChats((s) => s.byProject[project.id]);
  const chat = stored?.chats.find((item) => item.id === conversationId) ?? null;
  const tophs = useMemo(() => chatTophs(stored, conversationId), [stored?.tophs, stored?.chats, conversationId]);
  const config = useAI((s) => s.config);
  const models = useAI((s) => s.models);
  const modelError = useAI((s) => s.error);
  const native = useAgentChat(project.id, chat?.id);
  const [sending, setSending] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [queued, setQueued] = useState<Array<{ text: string; attachments: AgentAttachment[] }>>([]);
  const draftKey = `${project.id}:${chat?.id ?? ""}:native`;
  const text = useTophDrafts((s) => s.drafts[draftKey] ?? "");
  const setDraft = useTophDrafts((s) => s.setDraft);
  const clearDraft = useTophDrafts((s) => s.clearDraft);
  const busy = native.busy || sending;
  const scroller = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const previousChat = useRef<string | undefined>(undefined);
  const previousCount = useRef(0);
  const sendLock = useRef(false);
  const lastTop = useRef(0);
  const programmaticScroll = useRef(false);
  const settleTimer = useRef(0);
  const touchStartTop = useRef(0);
  const pendingScroll = useRef<{ height: number; top: number } | null>(null);
  const pendingRequest = useRef<{ text: string; id: string } | null>(null);
  const activeModel = tophs[0]?.model || config?.model || "";
  const activeModelInfo = findModel(models, activeModel);
  const activeModelDisplay = activeModelInfo ?? (activeModel ? { id: activeModel, label: activeModel.split("::").pop() ?? activeModel } : undefined);
  const lastRun = native.runs.find((run) => !run.parentId);
  // Stopping is not a failure: never keep "Execution cancelled" pinned below
  // the conversation as a red banner.
  const lastRunError = lastRun && lastRun.state === "failed" ? lastRun.error : "";
  const lastError = /cancel|abort|interromp/i.test(lastRunError) ? "" : lastRunError;
  const bannerError = /cancel|abort|interromp/i.test(native.error) ? "" : native.error;
  const title = chatDisplayName(stored, chat);

  /** Pin to the end and ignore the scroll events this move generates. */
  function pinToBottom() {
    const element = scroller.current;
    if (!element) return;
    programmaticScroll.current = true;
    window.clearTimeout(settleTimer.current);
    element.scrollTop = element.scrollHeight;
    lastTop.current = element.scrollTop;
    settleTimer.current = window.setTimeout(() => {
      programmaticScroll.current = false;
    }, 150);
  }

  useEffect(() => {
    const refresh = () => { void native.refresh(true); };
    window.addEventListener("toph:refresh-chat", refresh);
    return () => window.removeEventListener("toph:refresh-chat", refresh);
  }, [native.refresh]);
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);
  useEffect(() => {
    follow.current = true;
    setAtBottom(true);
    setQueued([]);
    pendingScroll.current = null;
    lastTop.current = 0;
    programmaticScroll.current = false;
    window.clearTimeout(settleTimer.current);
    previousChat.current = chat?.id;
    previousCount.current = 0;
  }, [chat?.id]);
  // The markdown and step list can grow after the first paint. Keep the view
  // pinned to the end when the user has not scrolled up, and force it to the
  // end after a project/chat switch even if an intermediate scroll event fired.
  useEffect(() => {
    if (!scroller.current) return;
    const force = previousChat.current !== chat?.id || (previousCount.current === 0 && native.messages.length > 0);
    previousChat.current = chat?.id;
    previousCount.current = native.messages.length;
    if (!follow.current && !force) return;
    follow.current = true;
    // Force the pin even if a layout scroll event arrives before the frame.
    pinToBottom();
    const frame = requestAnimationFrame(() => {
      if (follow.current) pinToBottom();
    });
    return () => cancelAnimationFrame(frame);
  }, [chat?.id, native.messages, native.approvals, busy]);
  useEffect(() => {
    const content = contentRef.current;
    const element = scroller.current;
    if (!content || !element || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (!follow.current) return;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (follow.current) pinToBottom();
      });
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [chat?.id]);
  useLayoutEffect(() => {
    if (pendingScroll.current && scroller.current) {
      scroller.current.scrollTop = pendingScroll.current.top + scroller.current.scrollHeight - pendingScroll.current.height;
      pendingScroll.current = null;
    }
  }, [native.messages.length]);

  const sendNowRef = useRef<(value: string, attachments: AgentAttachment[]) => Promise<void>>(async () => undefined);
  const [optimistic, setOptimistic] = useState<NativeMessage | null>(null);

  async function sendNow(value: string, attachments: AgentAttachment[]) {
    if (!chat || !tophs.length || sendLock.current) return;
    if (value.trim() === "/clear") {
      await Promise.all(tophs.map((toph) => agentApi.switchSession(project.id, toph.id, null, chat.id).catch(() => undefined)));
      clearDraft(draftKey);
      await native.refresh(true);
      return;
    }
    // The backend router chooses who answers; an @handle in the text wins.
    sendLock.current = true; setSending(true); native.setError(""); follow.current = true;
    const subject = sessionSubject(value);
    if (subject && !chat.subject?.trim()) useChats.getState().updateChat(project.id, chat.id, { subject });
    useChats.getState().touchConversation(project.id, chat.id);
    const identity = JSON.stringify([chat.id, "router", value, attachments, tophs.map((toph) => toph.id)]);
    const requestId = pendingRequest.current?.text === identity ? pendingRequest.current.id : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    pendingRequest.current = { text: identity, id: requestId };
    setOptimistic({
      id: `optimistic-${requestId}`,
      chatId: chat.id,
      tophId: tophs[0]?.id,
      role: "user",
      content: value,
      status: "running",
      createdAt: Date.now(),
      seq: 9_000_000_000,
    });
    try {
      const settings = chat.tophSettings ?? {};
      const fallbackModel = defaultModel(models, config);
      await agentApi.start(project.id, {
        requestId,
        chatId: chat.id,
        agentId: "router",
        text: value,
        agents: tophs.map((toph) => ({
          ...toph,
          model: settings[toph.id]?.model || toph.model || fallbackModel,
          effort: settings[toph.id]?.effort ?? toph.effort,
          chatId: chat.id,
        })),
        attachments,
      });
      pendingRequest.current = null; clearDraft(draftKey); await native.refresh();
    } catch (e) {
      native.setError(
        e instanceof ApiError && e.status === 413
          ? "O anexo é grande demais para o servidor. Remova alguma imagem e tente de novo."
          : e instanceof Error ? e.message : "Não foi possível iniciar a execução",
      );
    }
    finally { setOptimistic(null); sendLock.current = false; setSending(false); }
  }
  sendNowRef.current = sendNow;

  // A question blocks the run: bring it into view instead of leaving it below
  // the fold where it looks like nothing happened.
  useEffect(() => {
    if (native.questions.length === 0) return;
    follow.current = true;
    setAtBottom(true);
    const frame = requestAnimationFrame(() => pinToBottom());
    return () => cancelAnimationFrame(frame);
  }, [native.questions.length]);

  useEffect(() => {
    if (busy || queued.length === 0) return;
    const [next, ...rest] = queued;
    setQueued(rest);
    void sendNowRef.current(next.text, next.attachments);
  }, [busy, queued]);

  async function send(value: string, attachments: AgentAttachment[]) {
    if (!chat || !tophs.length) return;
    if (busy) {
      setQueued((current) => [...current, { text: value, attachments }]);
      clearDraft(draftKey);
      return;
    }
    await sendNowRef.current(value, attachments);
  }
  async function stop() {
    try {
      await Promise.all(native.runs.filter(isActive).map((run) => agentApi.cancel(project.id, run.id)));
      native.setError("");
    } catch (e) {
      native.setError(e instanceof Error ? e.message : "Falha ao cancelar");
    }
  }
  function older() {
    if (native.loading || !native.hasMore) return;
    follow.current = false;
    if (scroller.current) pendingScroll.current = { height: scroller.current.scrollHeight, top: scroller.current.scrollTop };
    void native.older();
  }

  if (!chat) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-background-secondary-default text-text-tertiary"><Bot size={20} /></span>
          <strong className="text-title-3-medium text-text-primary">Conversa não encontrada</strong>
          <p className="text-caption-1-regular text-text-secondary">Ela pode ter sido apagada. Escolha um Toph na barra ao lado.</p>
        </div>
      </div>
    );
  }

  return <div className="flex h-full min-h-0 w-full flex-1 gap-0 overflow-hidden" onPointerDown={unlockBotSound}>
    <section className={cx(
      "relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background-full",
      !embedded && "max-[900px]:rounded-none max-[900px]:border-0 max-[900px]:shadow-none min-[901px]:rounded-3xl min-[901px]:border min-[901px]:border-border-button-white min-[901px]:shadow-sidebar",
    )}>
      {embedded && headerControl ? <div className="absolute end-2 top-2 z-20">{headerControl}</div> : null}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scroller}
          data-toph-scroller
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-x-none"
          onScroll={(event) => {
            const el = event.currentTarget;
            if (programmaticScroll.current) { lastTop.current = el.scrollTop; return; }
            lastTop.current = el.scrollTop;
            // Only reaching the end turns following back on. Layout shifts and
            // scroll anchoring must never switch it off; the wheel/touch
            // handlers below detect a deliberate scroll up.
            const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            if (atEnd) follow.current = true;
            setAtBottom(atEnd);
          }}
          onWheel={(event) => {
            if (event.deltaY < 0 && event.currentTarget.scrollTop > 8) follow.current = false;
          }}
          onTouchStart={(event) => { touchStartTop.current = event.currentTarget.scrollTop; }}
          onTouchMove={(event) => {
            if (event.currentTarget.scrollTop < touchStartTop.current - 4) follow.current = false;
          }}
        >
          <div key={chat.id} ref={contentRef} className={cx("toph-view-in mx-auto flex min-h-full w-full min-w-0 max-w-[860px] flex-col gap-2 overflow-x-hidden [&_img]:max-w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto", compact ? (embedded ? "px-4 pt-10 pb-2" : "px-4 pt-4 pb-2") : "px-7 pt-6 pb-3")}>
            {native.hasMore && <Button variant="ghost" size="small" disabled={native.loading} onClick={older}>{native.loading ? <><LoaderCircle size={14} className="animate-spin" /> Carregando mensagens antigas…</> : "Carregar mensagens anteriores"}</Button>}
            {!stored?.hydrated ? <div className="my-auto flex items-center justify-center gap-2 py-8 text-caption-1-regular text-text-tertiary"><LoaderCircle size={16} className="animate-spin" /> Carregando conversas…</div>
              : !tophs.length ? <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center"><span className="flex size-12 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-500"><Bot size={22} /></span><strong className="text-title-3-medium">Esta conversa ficou sem Tophs.</strong><p className="max-w-sm text-caption-1-regular text-text-secondary">Adicione um Toph nas configurações da conversa.</p></div>
              : !native.messages.length && !busy ? <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center"><div className="flex -space-x-2">{tophs.slice(0, 4).map((toph) => <BotAvatar key={toph.id} bot={toph} size={38} className="rounded-full bg-background-primary-default ring-2 ring-background-primary-default" />)}</div><strong className="text-title-3-medium">{tophs.length === 1 ? `Escreva para ${tophs[0].name}.` : "Escreva para o grupo."}</strong><p className="max-w-md text-caption-1-regular text-text-secondary">{tophs.length === 1 ? "Pergunte, peça uma alteração ou anexe um arquivo. Cada tarefa tem o próprio histórico." : "Quem estiver na conversa responde. Para chamar alguém em especial, use @."}</p></div> : null}
            <ChatMessages messages={optimistic ? [...native.messages, optimistic] : native.messages} tophs={tophs} runs={native.runs} project={project} mobile={mobile} compact={compact} questions={native.questions} onAnswer={(id, answer) => { void agentApi.answer(project.id, id, answer).catch((e) => native.setError(String(e))); }} />
            {native.approvals.map((approval) => <ApprovalCard key={approval.id} agentName={tophs.find((a) => a.id === approval.agentId)?.name ?? "Toph"} name={approval.name} arguments={approval.arguments} onApprove={() => void agentApi.approve(project.id, approval.id, true).catch((e) => native.setError(String(e)))} onReject={() => void agentApi.approve(project.id, approval.id, false).catch((e) => native.setError(String(e)))} />)}
            {native.compacting && <p role="status" className="text-center text-caption-2-regular text-text-tertiary">Compactando contexto; histórico preservado…</p>}
            {(bannerError || lastError) && <p role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-red-500">{bannerError || `Última execução: ${lastError}`}</p>}
          </div>
        </div>
        {tophs.length > 0 && !atBottom && <button type="button" onClick={() => { follow.current = true; setAtBottom(true); scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }} className="absolute bottom-3 left-1/2 z-10 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-border-button-default bg-background-secondary-default text-text-secondary shadow-sidebar" aria-label="Ir para o fim da conversa"><ArrowDown size={15} /></button>}
      </div>
      {queued.length > 0 ? (
        <div className="mx-auto w-full max-w-[860px] px-3 pt-1.5">
          <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border-button-default bg-background-secondary-default px-2.5 py-1.5 text-caption-2-regular text-text-secondary">
            <Timer size={13} className="shrink-0 text-accent-600" />
            <span className="min-w-0 flex-1 truncate">
              {queued.length} mensagem{queued.length === 1 ? "" : "s"} na fila — envio após a execução atual
              {queued[0]?.text ? `: ${queued[0].text}` : ""}
            </span>
            <button type="button" onClick={() => setQueued([])} className="shrink-0 text-caption-2-regular text-text-tertiary underline-offset-2 hover:text-text-primary hover:underline">Limpar</button>
          </div>
        </div>
      ) : null}
      {tophs.length > 0 && <div className="shrink-0">
        {modelError && <p role="alert" className="px-3 text-xs text-text-error-primary">{modelError}</p>}
        <AgentComposer value={text} onChange={(value) => setDraft(draftKey, value)} onSend={(value, files) => void send(value, files)} onStop={() => void stop()} busy={busy}
          placeholder={tophs.length === 1 ? `Mensagem para ${tophs[0].name}` : "Mensagem para o grupo"}
          history={native.messages.filter((m) => m.role === "user").map((m) => m.content)}
          leadingControls={<ConversationModelPicker projectId={project.id} chat={chat!} tophs={tophs} />}
          modeControls={<ChatUsageMeter chatName={title} model={activeModelDisplay} />} members={tophs} />
      </div>}
    </section>
  </div>;
}
