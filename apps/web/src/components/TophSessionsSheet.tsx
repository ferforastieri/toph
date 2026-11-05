import { useEffect, useMemo, useState } from "react";
import { Check, History, Plus, Trash2 } from "@toph/icons";
import type { Project } from "../api";
import type { ChatToph } from "../chats";
import { relativeTime } from "../lib";
import { listOpenCodeSessions, type OpenCodeSessionSummary } from "../opencodeSessions";
import { Button } from "@/boardui/base/buttons/button";
import { Avatar } from "@/boardui/base/avatar/avatar";
import { Chip } from "@/boardui/base/badges/chip";
import { Modal } from "@/boardui/base/modal/modal";
import LoadingState from "./LoadingState";

const sessionCache = new Map<string, OpenCodeSessionSummary[]>();
const sessionRequests = new Map<string, Promise<OpenCodeSessionSummary[]>>();

function loadProjectSessions(root: string, force = false): Promise<OpenCodeSessionSummary[]> {
  if (!force) {
    const cached = sessionCache.get(root);
    if (cached) return Promise.resolve(cached);
  }
  const existing = sessionRequests.get(root);
  if (existing) return existing;
  const request = listOpenCodeSessions(root, 100)
    .then((items) => {
      sessionCache.set(root, items);
      return items;
    })
    .finally(() => { sessionRequests.delete(root); });
  sessionRequests.set(root, request);
  return request;
}

interface Props {
  open: boolean;
  project: Project;
  toph: ChatToph | null;
  activeSessionId?: string;
  onClose: () => void;
  onSelect: (session: OpenCodeSessionSummary) => void;
  onNew: () => void;
  onDelete: (session: OpenCodeSessionSummary) => Promise<void>;
}

export default function TophSessionsSheet({ open, project, toph, activeSessionId, onClose, onSelect, onNew, onDelete }: Props) {
  const [allSessions, setAllSessions] = useState<OpenCodeSessionSummary[]>(() => sessionCache.get(project.root) ?? []);
  const [loading, setLoading] = useState(!sessionCache.has(project.root));
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  async function removeSession(session: OpenCodeSessionSummary): Promise<void> {
    if (deletingId) return;
    setDeletingId(session.id);
    setDeleteError("");
    try {
      await onDelete(session);
      setAllSessions((current) => current.filter((item) => item.id !== session.id));
      sessionCache.delete(project.root);
      setConfirmId(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Não foi possível excluir a sessão.");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    if (!toph) return;
    let cancelled = false;
    const cached = sessionCache.get(project.root);
    if (cached) {
      setAllSessions(cached);
      setLoading(false);
    }
    loadProjectSessions(project.root, Boolean(cached))
      .then((items) => {
        if (cancelled) return;
        setAllSessions(items);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Não foi possível carregar as sessões.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [project.root, toph?.id]);

  useEffect(() => {
    if (!open || !toph) return;
    const cached = sessionCache.get(project.root);
    if (cached) {
      setAllSessions(cached);
      setLoading(false);
    }
    loadProjectSessions(project.root, true)
      .then((items) => { setAllSessions(items); setError(""); })
      .catch((err) => setError(err instanceof Error ? err.message : "Não foi possível carregar as sessões."))
      .finally(() => setLoading(false));
  }, [open, project.root, toph?.id]);

  const sessions = useMemo(() => {
    if (!toph) return [];
    return allSessions.filter((session) =>
      session.metadata?.tophBotId === toph.id
      || session.id === toph.sessionId
      || Boolean(session.title?.startsWith(`${toph.name} · `)),
    );
  }, [allSessions, toph]);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Sessões de ${toph?.name ?? "Toph"}`}
      description="Sessões deste Toph. Escolha uma para retomar ou comece uma nova."
      size="lg"
      placement="bottom"
      bodyClassName="p-4"
      swipeToClose
      footer={<Button variant="secondary" onClick={() => { onNew(); onClose(); }} leadingIcon={Plus}>Nova sessão</Button>}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-caption-1-medium text-text-secondary"><History size={14} /> OpenCode</div>
        {loading ? <LoadingState label="Carregando sessões..." className="py-2" /> : null}
        {!loading && error ? <Chip color="rose" variant="subtle" className="justify-start whitespace-normal px-2 py-1.5">{error}</Chip> : null}
        {deleteError ? <Chip color="rose" variant="subtle" className="justify-start whitespace-normal px-2 py-1.5">{deleteError}</Chip> : null}
        {!loading && !error && sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-body-regular text-text-secondary">Nenhuma sessão deste Toph ainda.</p>
            <p className="text-caption-2-regular text-text-tertiary">Envie uma mensagem ou clique em “Nova sessão” para começar do zero.</p>
          </div>
        ) : null}
        <div className="flex max-h-[440px] flex-col gap-1 overflow-y-auto">
          {sessions.map((session) => {
            const active = session.id === activeSessionId;
            if (confirmId === session.id) {
              return (
                <div key={session.id} className="flex items-center gap-2 rounded-2lg border border-status-rose-border bg-status-rose-background px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-caption-2-regular text-text-secondary">
                    Excluir “{session.title || session.id.slice(0, 8)}”?
                  </span>
                  <Button variant="ghost" size="small" disabled={deletingId === session.id} onClick={() => setConfirmId(null)}>Cancelar</Button>
                  <Button variant="danger" size="small" disabled={deletingId === session.id} onClick={() => void removeSession(session)}>
                    {deletingId === session.id ? "Excluindo..." : "Excluir"}
                  </Button>
                </div>
              );
            }
            return (
              <div key={session.id} className={`flex items-center gap-1 rounded-2lg border pe-1 ${active ? "border-accent-500/40 bg-accent-500/10" : "border-transparent hover:bg-background-primary-hover"}`}>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 rounded-2lg px-3 py-2 text-start" onClick={() => onSelect(session)}>
                  <Avatar size="md" color="neutral" initials="TP" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <strong className="truncate text-caption-1-semibold text-text-primary">{session.title || "Sessão sem título"}</strong>
                    <small className="text-caption-2-regular text-text-secondary">{session.time?.updated ? relativeTime(new Date(session.time.updated).toISOString()) : session.id.slice(0, 10)}</small>
                  </span>
                  {active ? <Check size={15} className="text-accent-500" /> : null}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmId(session.id)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-status-rose-background hover:text-status-rose-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                  aria-label={`Excluir sessão ${session.title || session.id}`}
                  title="Excluir sessão"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
