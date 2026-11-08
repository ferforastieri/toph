import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Bot, LoaderCircle, MessageSquarePlus, Plus, Settings2 } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { activeChat, chatCoordinator, chatTophs, tophForChat, useChats } from "../store";
import { findModel, modelDisplay, useAI } from "../../providers/store";
import { useTophDrafts } from "../../agents/drafts";
import { agentApi, isActive, type AgentSession } from "../../agents/api";
import { useAgentChat } from "../../agents/useAgentChat";
import { AgentComposer, type AgentAttachment } from "./AgentComposer";
import ChatMessages from "./ChatMessages";
import ChatUsageMeter from "./ChatUsageMeter";
import TophSwitcher from "./TophSwitcher";
import BotAvatar from "../../agents/components/BotAvatar";
import { unlockBotSound } from "../sound";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Modal } from "@/shared/boardui/base/modal/modal";
import { cx } from "@/shared/boardui/utils/cx";

const BotConfig = lazy(() => import("../../agents/components/BotConfig"));
const TophGallery = lazy(() => import("../../agents/components/TophGallery"));
const TophSessionsSheet = lazy(() => import("./TophSessionsSheet"));

export interface TophActionRequest { tophId: string; action: "config" | "sessions" }
interface Props { project: Project; mobile?: boolean; embedded?: boolean; compact?: boolean; headerControl?: ReactNode; externalAction?: TophActionRequest | null; onExternalActionHandled?: () => void }

export default function BotStudioTab({ project, mobile = false, embedded = false, compact = false, headerControl, externalAction, onExternalActionHandled }: Props) {
  const stored = useChats((s) => s.byProject[project.id]);
  const chat = activeChat(stored);
  const tophs = useMemo(() => chatTophs(stored, chat?.id), [stored?.tophs, chat?.id]);
  const coordinator = chatCoordinator(tophs);
  const config = useAI((s) => s.config);
  const models = useAI((s) => s.models);
  const modelError = useAI((s) => s.error);
  const createChat = useChats((s) => s.createChat);
  const setActiveChat = useChats((s) => s.setActiveChat);
  const native = useAgentChat(project.id, chat?.id);
  const [sending, setSending] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [galleryChatId, setGalleryChatId] = useState<string | null>(null);
  const [configId, setConfigId] = useState<string | null>(null);
  const [sessionsId, setSessionsId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const selected = tophs.find((a) => a.id === configId);
  const sessionToph = tophs.find((a) => a.id === sessionsId) ?? null;
  const currentToph = tophForChat(stored, chat?.id);
  const draftKey = `${project.id}:${chat?.id ?? ""}:native`;
  const text = useTophDrafts((s) => s.drafts[draftKey] ?? "");
  const setDraft = useTophDrafts((s) => s.setDraft);
  const clearDraft = useTophDrafts((s) => s.clearDraft);
  const busy = native.busy || sending;
  const scroller = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const sendLock = useRef(false);
  const lastTop = useRef(0);
  const pendingScroll = useRef<{ height: number; top: number } | null>(null);
  const pendingRequest = useRef<{ text: string; id: string } | null>(null);
  const activeModel = coordinator?.model || config?.model || "";
  const activeModelInfo = findModel(models, activeModel);
  const activeModelDisplay = activeModelInfo ?? (activeModel ? { id: activeModel, label: activeModel.split("::").pop() ?? activeModel } : undefined);
  const modelLabel = modelDisplay(activeModelInfo);
  const lastRun = native.runs.find((run) => !run.parentId);
  const lastError = lastRun && ["failed", "interrupted"].includes(lastRun.state) ? lastRun.error : "";

  useEffect(() => {
    if (!externalAction) return;
    if (externalAction.action === "config") setConfigId(externalAction.tophId);
    else setSessionsId(externalAction.tophId);
    onExternalActionHandled?.();
  }, [externalAction, onExternalActionHandled]);
  useEffect(() => {
    const listener = (raw: Event) => {
      const value = (raw as CustomEvent<{ action: string; tophId?: string }>).detail;
      if (value?.action === "add") setGallery(true);
      else if (value?.action === "config") setConfigId(value.tophId ?? null);
      else if (value?.action === "sessions") setSessionsId(value.tophId ?? null);
    };
    window.addEventListener("toph:toph-action", listener);
    return () => window.removeEventListener("toph:toph-action", listener);
  }, []);
  useEffect(() => { follow.current = true; setAtBottom(true); pendingScroll.current = null; }, [chat?.id]);
  useEffect(() => {
    if (follow.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [native.messages, native.approvals, busy]);
  useLayoutEffect(() => {
    if (pendingScroll.current && scroller.current) {
      scroller.current.scrollTop = pendingScroll.current.top + scroller.current.scrollHeight - pendingScroll.current.height;
      pendingScroll.current = null;
    }
  }, [native.messages.length]);

  async function send(value: string, attachments: AgentAttachment[]) {
    if (!chat || !coordinator || sendLock.current || busy) return;
    if (value.trim() === "/clear") { await newSession(coordinator.id); clearDraft(draftKey); return; }
    if (value.trim() === "/compact") { native.setError("O contexto é compactado automaticamente conforme o orçamento de tokens. O histórico completo permanece salvo."); return; }
    sendLock.current = true; setSending(true); native.setError(""); follow.current = true;
    const identity = JSON.stringify([chat.id, coordinator.id, activeModel, coordinator.agentMode, value, attachments]);
    const requestId = pendingRequest.current?.text === identity ? pendingRequest.current.id : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    pendingRequest.current = { text: identity, id: requestId };
    try {
      await agentApi.start(project.id, { requestId, chatId: chat.id, chatDescription: chat.description, agentId: coordinator.id, text: value, agents: tophs, attachments });
      pendingRequest.current = null; clearDraft(draftKey); await native.refresh();
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
  function older() {
    if (native.loading || !native.hasMore) return;
    follow.current = false;
    if (scroller.current) pendingScroll.current = { height: scroller.current.scrollHeight, top: scroller.current.scrollTop };
    void native.older();
  }

  function createTophChat() {
    const created = createChat(project.id, "Toph");
    setActiveChat(project.id, created.id);
    setGalleryChatId(created.id);
    setGallery(true);
  }

  function openGalleryFor(chatId: string | null) {
    setGalleryChatId(chatId);
    setGallery(true);
  }

  function closeGallery() {
    setGallery(false);
    setGalleryChatId(null);
  }

  return <div className="flex h-full min-h-0 w-full flex-1 gap-0 overflow-hidden" onPointerDown={unlockBotSound}>
    <section className={cx(
      "relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background-full",
      !embedded && "max-[900px]:rounded-none max-[900px]:border-0 max-[900px]:shadow-none min-[901px]:rounded-3xl min-[901px]:border min-[901px]:border-border-button-white min-[901px]:shadow-sidebar",
    )}>
      <div className={cx("flex shrink-0 items-center gap-4 border-b border-separator-border/70 bg-background-secondary-default", compact ? "h-[52px] px-3" : "h-[52px] px-5")}>
        <TophSwitcher project={project} chat={chat} modelLabel={modelLabel} compact={compact || mobile} onCreateToph={createTophChat} />
        <span className="min-w-0 flex-1" />
        {chat?.kind === "team" ? (
          <>
            <div className="hidden shrink-0 items-center -space-x-2 sm:flex">{tophs.slice(0, 4).map((toph) => <button key={toph.id} type="button" aria-label={`Configurar ${toph.name}`} onClick={() => setConfigId(toph.id)} className="rounded-full ring-2 ring-background-secondary-default transition-transform hover:-translate-y-0.5" title={`${toph.name} · ${toph.role}`}><BotAvatar bot={toph} size={26} /></button>)}{tophs.length > 4 && <span className="flex size-7 items-center justify-center rounded-full bg-background-tertiary-default text-[10px] text-text-tertiary">+{tophs.length - 4}</span>}</div>
            <Button variant="ghost" size="small" iconOnly leadingIcon={MessageSquarePlus} aria-label="Adicionar Toph à equipe" title="Adicionar Toph à equipe" onClick={() => openGalleryFor(chat.id)} />
          </>
        ) : currentToph ? (
          <Button variant="ghost" size="small" iconOnly leadingIcon={Settings2} aria-label={`Configurar ${currentToph.name}`} title="Configurar Toph" onClick={() => setConfigId(currentToph.id)} />
        ) : null}
        {headerControl}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scroller} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-x-none" onScroll={(event) => {
          const el = event.currentTarget; const movedUp = el.scrollTop < lastTop.current - 1; lastTop.current = el.scrollTop;
          follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 && !movedUp; setAtBottom(follow.current);
        }}>
          <div key={chat?.id ?? "none"} className={cx("toph-view-in mx-auto flex min-h-full w-full min-w-0 max-w-[860px] flex-col gap-2 overflow-x-hidden [&_img]:max-w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto", compact ? "px-4 pt-4 pb-2" : "px-7 pt-6 pb-3")}>
            {native.hasMore && <Button variant="ghost" size="small" disabled={native.loading} onClick={older}>{native.loading ? <><LoaderCircle size={14} className="animate-spin" /> Carregando mensagens antigas…</> : "Carregar mensagens anteriores"}</Button>}
            {!native.hasMore && native.messages.length > 0 && <p className="py-1 text-center text-[11px] text-text-tertiary">Início da conversa</p>}
            {!stored?.hydrated ? <div className="my-auto flex items-center justify-center gap-2 py-8 text-caption-1-regular text-text-tertiary"><LoaderCircle size={16} className="animate-spin" /> Carregando chats…</div>
              : !chat ? <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center"><Bot size={22} /><strong>Escolha um Toph.</strong><p className="text-text-secondary">Cada Toph tem a própria conversa.</p><Button variant="secondary" size="small" leadingIcon={Plus} onClick={createTophChat}>Novo Toph</Button></div>
              : !tophs.length ? <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center"><span className="flex size-12 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-500"><Bot size={22} /></span><strong className="text-title-3-medium">Escolha um Toph.</strong><p className="max-w-sm text-caption-1-regular text-text-secondary">Cada Toph tem a própria conversa. Escolha um pronto ou crie um livre.</p><Button variant="secondary" size="small" leadingIcon={MessageSquarePlus} onClick={() => openGalleryFor(chat.id)}>Escolher Toph</Button></div>
              : !native.messages.length && !busy ? <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center"><div className="flex -space-x-2">{tophs.slice(0, 4).map((toph) => <BotAvatar key={toph.id} bot={toph} size={38} className="rounded-full bg-background-primary-default ring-2 ring-background-primary-default" />)}</div><strong className="text-title-3-medium">O chat está pronto.</strong><p className="max-w-md text-caption-1-regular text-text-secondary">{chat.kind === "team" ? `Fale com ${coordinator?.name ?? "o coordenador"}; ele distribui o trabalho e consolida a resposta.` : `Converse com ${coordinator?.name ?? "seu Toph"}.`}</p></div> : null}
            <ChatMessages messages={native.messages} tophs={tophs} runs={native.runs} models={models} defaultModel={config?.model ?? ""} project={project} mobile={mobile} compact={compact} questions={native.questions} onAnswer={(id, answer) => { void agentApi.answer(project.id, id, answer).catch((e) => native.setError(String(e))); }} />
            {native.approvals.map((approval) => <section key={approval.id} className="rounded-2xl border border-accent-500/25 bg-accent-500/5 p-3"><strong>{tophs.find((a) => a.id === approval.agentId)?.name ?? "Toph"} · Autorizar {approval.name}?</strong><pre className="my-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{approval.arguments}</pre><div className="flex gap-2"><Button size="small" onClick={() => void agentApi.approve(project.id, approval.id, true).catch((e) => native.setError(String(e)))}>Autorizar uma vez</Button><Button size="small" variant="secondary" onClick={() => void agentApi.approve(project.id, approval.id, false).catch((e) => native.setError(String(e)))}>Recusar</Button></div></section>)}
            {native.compacting && <p role="status" className="text-center text-caption-2-regular text-text-tertiary">Compactando contexto; histórico preservado…</p>}
            {(native.error || lastError) && <p role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-red-500">{native.error || `Última execução: ${lastError}`}</p>}
          </div>
        </div>
        {chat && tophs.length > 0 && !atBottom && <button type="button" onClick={() => { follow.current = true; setAtBottom(true); scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }} className="absolute bottom-3 end-3 z-10 flex size-8 items-center justify-center rounded-full border border-border-button-default bg-background-secondary-default text-text-secondary shadow-sidebar" aria-label="Ir para o fim da conversa"><ArrowDown size={15} /></button>}
      </div>
      {chat && coordinator && <div className="shrink-0">
        {modelError && <p role="alert" className="px-3 text-xs text-text-error-primary">{modelError}</p>}
        <AgentComposer value={text} onChange={(value) => setDraft(draftKey, value)} onSend={(value, files) => void send(value, files)} onStop={() => void stop()} busy={busy}
          placeholder={currentToph ? `Mensagem para ${currentToph.name}` : "Mensagem para a equipe"}
          hint={chat.kind === "team" ? "Quem estiver na equipe responde · use @ para chamar alguém" : `${currentToph?.name ?? "O Toph"} sempre responde aqui`}
          history={native.messages.filter((m) => m.role === "user").map((m) => m.content)}
          modeControls={<ChatUsageMeter chatName={currentToph?.name ?? chat.name} model={activeModelDisplay} />} />
      </div>}
    </section>
    <Modal isOpen={Boolean(selected)} onClose={() => setConfigId(null)} title={selected?.name ?? "Toph"} description="Configure identidade, prompt, modelo e ferramentas deste Toph." size="xl" placement={mobile ? "bottom" : "center"} bodyClassName="p-0" swipeToClose={mobile}><Suspense fallback={<p>Carregando…</p>}>{selected && <BotConfig projectId={project.id} projectRoot={project.root} bot={selected} />}</Suspense></Modal>
    <Suspense fallback={null}>{sessionToph && <TophSessionsSheet open project={project} toph={sessionToph} onClose={() => setSessionsId(null)} onSelect={(session) => void selectSession(session)} onNew={() => { void newSession(sessionToph.id); setSessionsId(null); }} />}{gallery && <TophGallery open projectId={project.id} chatId={galleryChatId} onClose={closeGallery} onCreated={(tophId) => { closeGallery(); setConfigId(tophId); }} />}</Suspense>
  </div>;
}
