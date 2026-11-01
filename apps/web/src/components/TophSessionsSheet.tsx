import { useEffect, useState } from "react";
import { Check, History, Plus } from "@toph/icons";
import type { Project } from "../api";
import type { MiniBot } from "../bots";
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
  mode: "solo" | "team" | "unset";
  bot: MiniBot | null;
  activeSessionId?: string;
  onClose: () => void;
  onSelect: (session: OpenCodeSessionSummary) => void;
  onNew: () => void;
}

export default function TophSessionsSheet({ open, project, mode, bot, activeSessionId, onClose, onSelect, onNew }: Props) {
  const [sessions, setSessions] = useState<OpenCodeSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !bot) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    listOpenCodeSessions(project.root, 100)
      .then((items) => {
        if (cancelled) return;
        const scoped = items.filter((session) =>
          session.metadata?.tophBotId === bot.id
          || session.id === bot.sessionId
          || Boolean(session.title?.startsWith(`${bot.name} · `)),
        );
        setSessions(scoped);
      })
      .catch((err) => {
        if (!cancelled) {
          setSessions([]);
          setError(err instanceof Error ? err.message : "Não foi possível carregar as sessões.");
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, project.root, bot?.id, bot?.sessionId]);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Sessões de ${bot?.name ?? (mode === "solo" ? "Toph Solo" : "Toph")}`}
      description={mode === "solo" ? "Todas as sessões deste Toph solo." : "Sessões deste membro da equipe."}
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
        {!loading && !error && sessions.length === 0 ? <p className="py-6 text-center text-body-regular text-text-secondary">Nenhuma sessão salva ainda.</p> : null}
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
