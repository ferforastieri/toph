import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Bot, ChevronDown, LoaderCircle, MessageSquarePlus, Monitor, Plus, X } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { activeChat, chatCoordinator, chatTophs, useChats } from "../store";
import { useAI } from "../../providers/store";
import { useTophDrafts } from "../../agents/drafts";
import { agentApi, isActive, type AgentSession } from "../../agents/api";
import { useAgentChat } from "../../agents/useAgentChat";
import { AgentComposer, type AgentAttachment } from "./AgentComposer";
import { AgentImageGallery, agentImagesForMessages } from "./AgentTranscript";
import ChatMessages, { toTranscriptMessage } from "./ChatMessages";
import ChatUsageMeter from "./ChatUsageMeter";
import ComposerMenu from "./ComposerMenu";
import BotAvatar from "../../agents/components/BotAvatar";
import { unlockBotSound } from "../sound";
import { Button } from "@/shared/boardui/base/buttons/button";
import { DropdownItem } from "@/shared/boardui/base/dropdown/dropdown";
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
  const modelError = useAI((s) => s.error);
  const updateToph = useChats((s) => s.updateToph);
  const native = useAgentChat(project.id, chat?.id);
  const [sending, setSending] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [sessionsId, setSessionsId] = useState<string | null>(null);
  const [presentation, setPresentation] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
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
  const lastTop = useRef(0);
  const pendingScroll = useRef<{ height: number; top: number } | null>(null);
  const pendingRequest = useRef<{ text: string; id: string } | null>(null);
  const activeModel = coordinator?.model || config?.model || "";
  const activeModelInfo = models.find((model) => model.id === activeModel);
  const lastRun = native.runs.find((run) => !run.parentId);
  const lastError = lastRun && ["failed", "interrupted"].includes(lastRun.state) ? lastRun.error : "";
  const images = useMemo(() => agentImagesForMessages(native.messages.slice(-24).map(toTranscriptMessage), project.id, project.root).slice(-8), [native.messages, project.id, project.root]);

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
  useEffect(() => { if (images.length) setPresentation(true); }, [images.length]);
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

  return <div className="flex h-full min-h-0 w-full flex-1 gap-0 overflow-hidden" onPointerDown={unlockBotSound}>
    <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background-full max-[900px]:rounded-none max-[900px]:border-0 max-[900px]:shadow-none min-[901px]:rounded-3xl min-[901px]:border min-[901px]:border-border-button-white min-[901px]:shadow-sidebar">
      {chat && <div className="flex h-12 shrink-0 items-center gap-2 border-b border-separator-border bg-background-secondary-default px-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-background-tertiary-default text-caption-1-semibold text-text-tertiary">#</span>
        <div className="flex min-w-0 flex-1 flex-col"><strong className="truncate text-caption-1-semibold text-text-primary">{chat.name}</strong><span className="truncate text-caption-2-regular text-text-tertiary">{chat.description || (chat.kind === "team" ? "Equipe de Tophs" : "Conversa individual")}</span></div>
        <div className="flex shrink-0 items-center -space-x-2">{tophs.slice(0, 4).map((toph) => <button key={toph.id} type="button" aria-label={`Configurar ${toph.name}`} onClick={() => setConfigId(toph.id)} className="rounded-full ring-2 ring-background-secondary-default transition-transform hover:-translate-y-0.5" title={`${toph.name} · ${toph.role}`}><BotAvatar bot={toph} size={28} /></button>)}{tophs.length > 4 && <span className="flex size-7 items-center justify-center rounded-full bg-background-tertiary-default text-[10px] text-text-tertiary">+{tophs.length - 4}</span>}</div>
        {chat.kind === "team" && <Button variant="ghost" size="small" iconOnly={mobile} leadingIcon={mobile ? Plus : MessageSquarePlus} aria-label="Adicionar Toph" onClick={() => setGallery(true)}>{mobile ? null : "Adicionar Toph"}</Button>}
        {!mobile && images.length > 0 && <Button variant="ghost" size="xs" iconOnly leadingIcon={Monitor} aria-label="Apresentação" onClick={() => setPresentation((value) => !value)} />}
      </div>}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scroller} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-x-none" onScroll={(event) => {
          const el = event.currentTarget; const movedUp = el.scrollTop < lastTop.current - 1; lastTop.current = el.scrollTop;
          follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 && !movedUp; setAtBottom(follow.current);
        }}>
          <div key={chat?.id ?? "none"} className="toph-view-in mx-auto flex min-h-full w-full min-w-0 max-w-[760px] flex-col gap-4 overflow-x-hidden p-4 [&_img]:max-w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
            {native.hasMore && <Button variant="ghost" size="small" disabled={native.loading} onClick={older}>{native.loading ? <><LoaderCircle size={14} className="animate-spin" /> Carregando mensagens antigas…</> : "Carregar mensagens anteriores"}</Button>}
            {!native.hasMore && native.messages.length > 0 && <p className="py-1 text-center text-[11px] text-text-tertiary">Início da conversa</p>}
            {!stored?.hydrated ? <div className="my-auto flex items-center justify-center gap-2 py-8 text-caption-1-regular text-text-tertiary"><LoaderCircle size={16} className="animate-spin" /> Carregando chats…</div>
              : !chat ? <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center"><Bot size={22} /><strong>Escolha Individual ou Equipe.</strong><p className="text-text-secondary">Cada projeto tem suas conversas individuais e sua equipe de Tophs.</p></div>
              : !tophs.length ? <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center"><span className="flex size-12 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-500"><Bot size={22} /></span><strong className="text-title-3-medium">Adicione o primeiro Toph.</strong><p className="max-w-sm text-caption-1-regular text-text-secondary">Escolha um Toph pronto ou crie um livre com o papel que você precisar.</p><Button variant="secondary" size="small" leadingIcon={MessageSquarePlus} onClick={() => setGallery(true)}>Escolher Toph</Button></div>
              : !native.messages.length && !busy ? <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center"><div className="flex -space-x-2">{tophs.slice(0, 4).map((toph) => <BotAvatar key={toph.id} bot={toph} size={38} className="rounded-full bg-background-primary-default ring-2 ring-background-primary-default" />)}</div><strong className="text-title-3-medium">O chat está pronto.</strong><p className="max-w-md text-caption-1-regular text-text-secondary">{chat.kind === "team" ? `Fale com ${coordinator?.name ?? "o coordenador"}; ele distribui o trabalho e consolida a resposta.` : `Converse com ${coordinator?.name ?? "seu Toph"}.`}</p></div> : null}
            <ChatMessages messages={native.messages} tophs={tophs} coordinator={coordinator} runs={native.runs} models={models} defaultModel={config?.model ?? ""} project={project} mobile={mobile} />
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
          models={models} model={activeModel} onModelChange={(model) => updateToph(project.id, coordinator.id, { model })}
          effort={coordinator.effort ?? ""} efforts={activeModelInfo?.variants ?? []} onEffortChange={(effort) => updateToph(project.id, coordinator.id, { effort })}
          placeholder={`Mensagem em #${chat.name}`} history={native.messages.filter((m) => m.role === "user").map((m) => m.content)}
          modeControls={<><ComposerMenu label="Modo do agente" trigger={<><span>{coordinator.agentMode === "plan" ? "Plano" : "Build"}</span><ChevronDown size={12} className="size-3 text-foreground-icon-tertiary" /></>} popoverClassName="w-[300px] p-0" contentClassName="flex flex-col gap-1 p-1.5">{(close) => <><DropdownItem selected={coordinator.agentMode !== "plan"} onSelect={() => { updateToph(project.id, coordinator.id, { agentMode: "build" }); close(); }}>Build</DropdownItem><DropdownItem selected={coordinator.agentMode === "plan"} onSelect={() => { updateToph(project.id, coordinator.id, { agentMode: "plan" }); close(); }}>Plano</DropdownItem></>}</ComposerMenu><ChatUsageMeter usage={native.usage} chatName={chat.name} tophs={tophs} model={activeModelInfo} /></>} />
      </div>}
    </section>
    {!mobile && presentation && <aside className="toph-panel-in flex min-h-0 w-[clamp(300px,34vw,var(--ai-panel-width))] shrink-0 flex-col overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-sidebar"><header className="flex h-12 shrink-0 items-center gap-2 border-b border-separator-border bg-background-secondary-default px-3"><Monitor size={15} className="text-accent-500" /><div className="min-w-0 flex-1"><strong className="text-caption-1-semibold">Apresentação</strong><p className="text-caption-2-regular text-text-tertiary">O que o agente quer mostrar</p></div><Button variant="ghost" size="xs" iconOnly leadingIcon={X} aria-label="Fechar apresentação" onClick={() => setPresentation(false)} /></header><div className="min-h-0 flex-1 overflow-y-auto p-3"><AgentImageGallery images={images} title="Imagens" /></div></aside>}
    <Modal isOpen={Boolean(selected)} onClose={() => setConfigId(null)} title={selected?.name ?? "Toph"} description="Configure identidade, prompt, modelo e ferramentas deste Toph." size="xl" placement={mobile ? "bottom" : "center"} bodyClassName="p-0" swipeToClose={mobile}><Suspense fallback={<p>Carregando…</p>}>{selected && <BotConfig projectId={project.id} projectRoot={project.root} bot={selected} />}</Suspense></Modal>
    <Suspense fallback={null}>{sessionToph && <TophSessionsSheet open project={project} toph={sessionToph} onClose={() => setSessionsId(null)} onSelect={(session) => void selectSession(session)} onNew={() => { void newSession(sessionToph.id); setSessionsId(null); }} />}{gallery && <TophGallery open projectId={project.id} chatId={chat?.id ?? null} onClose={() => setGallery(false)} onCreated={setConfigId} />}</Suspense>
  </div>;
}
