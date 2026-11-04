import { useEffect, useMemo, useState } from "react";
import { Check, History, Plus } from "@toph/icons";
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
}

export default function TophSessionsSheet({ open, project, toph, activeSessionId, onClose, onSelect, onNew }: Props) {
  const [allSessions, setAllSessions] = useState<OpenCodeSessionSummary[]>(() => sessionCache.get(project.root) ?? []);
  const [loading, setLoading] = useState(!sessionCache.has(project.root));
  const [error, setError] = useState("");
  const [scope, setScope] = useState<"toph" | "project">("toph");

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
    if (open) setScope("toph");
  }, [open, toph?.id]);

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
    if (scope === "project") return allSessions;
    return allSessions.filter((session) =>
      session.metadata?.tophBotId === toph.id
      || session.id === toph.sessionId
      || Boolean(session.title?.startsWith(`${toph.name} · `)),
    );
  }, [allSessions, scope, toph]);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Sessões de ${toph?.name ?? "Toph"}`}
      description="Escolha uma sessão para este Toph ou veja todas as sessões do projeto."
      size="lg"
      placement="bottom"
      bodyClassName="p-4"
      swipeToClose
      footer={<Button variant="secondary" onClick={() => { onNew(); onClose(); }} leadingIcon={Plus}>Nova sessão</Button>}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-caption-1-medium text-text-secondary"><History size={14} /> OpenCode</div>
        <div className="flex items-center gap-1 rounded-xl bg-background-secondary-default p-1">
          <button type="button" onClick={() => setScope("toph")} className={`flex-1 rounded-lg px-2 py-1.5 text-caption-1-medium transition-colors ${scope === "toph" ? "bg-background-primary-default text-text-primary shadow-xs" : "text-text-secondary hover:bg-background-primary-hover"}`}>Deste Toph</button>
          <button type="button" onClick={() => setScope("project")} className={`flex-1 rounded-lg px-2 py-1.5 text-caption-1-medium transition-colors ${scope === "project" ? "bg-background-primary-default text-text-primary shadow-xs" : "text-text-secondary hover:bg-background-primary-hover"}`}>Todas do projeto</button>
        </div>
        {loading ? <LoadingState label="Carregando sessões..." className="py-2" /> : null}
        {!loading && error ? <Chip color="rose" variant="subtle" className="justify-start whitespace-normal px-2 py-1.5">{error}</Chip> : null}
        {!loading && !error && sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-body-regular text-text-secondary">
              {scope === "toph" ? "Nenhuma sessão deste Toph ainda." : "Nenhuma sessão encontrada neste projeto."}
            </p>
            {scope === "toph" ? <Button variant="secondary" size="small" onClick={() => setScope("project")}>Ver todas as sessões do projeto</Button> : null}
          </div>
        ) : null}
        <div className="flex max-h-[440px] flex-col gap-1 overflow-y-auto">
          {sessions.map((session) => {
            const active = session.id === activeSessionId;
            return (
              <button type="button" className={`flex items-center gap-3 rounded-2lg border px-3 py-2 text-start ${active ? "border-accent-500/40 bg-accent-500/10" : "border-transparent hover:bg-background-primary-hover"}`} key={session.id} onClick={() => onSelect(session)}>
                <Avatar size="md" color="neutral" initials="TP" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <strong className="truncate text-caption-1-semibold text-text-primary">{session.title || "Sessão sem título"}</strong>
                  <small className="text-caption-2-regular text-text-secondary">{session.time?.updated ? relativeTime(new Date(session.time.updated).toISOString()) : session.id.slice(0, 10)}</small>
                </span>
                {active ? <Check size={15} className="text-accent-500" /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
