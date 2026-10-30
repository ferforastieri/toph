import { useEffect, useState } from "react";
import { Check, History, Plus } from "@toph/icons";
import type { Project } from "../api";
import { relativeTime } from "../lib";
import { listOpenCodeSessions, type OpenCodeSessionSummary } from "../opencodeSessions";
import { Button } from "@/boardui/base/buttons/button";
import { Avatar } from "@/boardui/base/avatar/avatar";
import { Chip } from "@/boardui/base/badges/chip";
import { Modal } from "@/boardui/base/modal/modal";
import LoadingState from "./LoadingState";

interface Props {
  open: boolean;
  project: Project;
  activeSessionId?: string;
  onClose: () => void;
  onSelect: (session: OpenCodeSessionSummary) => void;
  onNew: () => void;
}

export default function AgentSessionsSheet({ open, project, activeSessionId, onClose, onSelect, onNew }: Props) {
  const [sessions, setSessions] = useState<OpenCodeSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError("");
    listOpenCodeSessions(project.root, 50)
      .then((items) => {
        if (!cancelled) setSessions(items.filter((session) => !session.metadata?.tophBotId && !session.parentID));
      })
      .catch((err) => { if (!cancelled) { setSessions([]); setError(err instanceof Error ? err.message : "Could not load sessions."); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, project.root]);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Sessões de ${project.name}`}
      description="Histórico de sessões do OpenCode."
      size="lg"
      footer={<Button variant="secondary" onClick={() => { onNew(); onClose(); }} leadingIcon={Plus}>Nova sessão</Button>}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-caption-1-medium text-text-secondary"><History size={14} /> OpenCode</div>
        {loading && <LoadingState label="Carregando sessões..." className="py-2" />}
        {!loading && error && <Chip color="rose" variant="subtle" className="justify-start whitespace-normal px-2 py-1.5">{error}</Chip>}
        {!loading && !error && sessions.length === 0 && <p className="py-6 text-center text-body-regular text-text-secondary">Nenhuma sessão salva ainda.</p>}
        <div className="flex max-h-[440px] flex-col gap-1 overflow-y-auto">
          {sessions.map((session) => {
            const active = session.id === activeSessionId;
            return (
              <button type="button" className={`flex items-center gap-3 rounded-2lg border px-3 py-2 text-start ${active ? "border-accent-500/40 bg-accent-500/10" : "border-transparent hover:bg-background-primary-hover"}`} key={session.id} onClick={() => onSelect(session)}>
                <Avatar size="md" color="neutral" initials="OC" />
                <span className="flex min-w-0 flex-1 flex-col"><strong className="truncate text-caption-1-semibold text-text-primary">{session.title || "Nova sessão"}</strong><small className="text-caption-2-regular text-text-secondary">{session.time?.updated ? relativeTime(new Date(session.time.updated).toISOString()) : session.id.slice(0, 10)}</small></span>
                {active && <Check size={15} className="text-accent-500" />}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
