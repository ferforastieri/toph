import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Check, History, Plus, X } from "@toph/icons";
import type { Project } from "../api";
import { relativeTime } from "../lib";
import { listOpenCodeSessions, type OpenCodeSessionSummary } from "../opencodeSessions";
import { Button } from "@toph/ui";

interface Props {
  open: boolean;
  project: Project;
  activeSessionId?: string;
  onClose: () => void;
  onSelect: (session: OpenCodeSessionSummary) => void;
  onNew: () => void;
}

export default function AgentSessionsSheet({
  open,
  project,
  activeSessionId,
  onClose,
  onSelect,
  onNew,
}: Props) {
  const [sessions, setSessions] = useState<OpenCodeSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    listOpenCodeSessions(project.root, 50)
      .then((items) => {
        if (!cancelled) setSessions(items);
      })
      .catch((err) => {
        if (!cancelled) {
          setSessions([]);
          setError(err instanceof Error ? err.message : "Could not load sessions.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, project.root]);

  if (!open) return null;

  return createPortal(
    <>
      <button type="button" className="mobile-sheet-backdrop" aria-label="Fechar sessões" onClick={onClose} />
      <section className="mobile-sheet agent-sessions-sheet" role="dialog" aria-modal="true" aria-label="Sessões do projeto">
        <div className="mobile-sheet-handle" aria-hidden="true"><span /></div>
        <div className="mobile-sheet-title">
          <div>
            <span className="eyebrow">OpenCode</span>
            <strong>Sessões de {project.name}</strong>
          </div>
          <Button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={16} /></Button>
        </div>
        {loading && <div className="agent-sessions-state">Carregando sessões...</div>}
        {!loading && error && <div className="panel-error">{error}</div>}
        {!loading && !error && sessions.length === 0 && (
          <div className="agent-sessions-state">Nenhuma sessão salva neste projeto ainda.</div>
        )}
        <div className="agent-sessions-list">
          {sessions.map((session) => {
            const active = session.id === activeSessionId;
            return (
              <button
                type="button"
                className={`agent-session-row ${active ? "active" : ""}`}
                key={session.id}
                onClick={() => onSelect(session)}
              >
                <span className="agent-session-icon"><Bot size={15} /></span>
                <span className="agent-session-copy">
                  <strong>{session.title || "Nova sessão"}</strong>
                  <small>
                    {session.time?.updated ? relativeTime(new Date(session.time.updated).toISOString()) : session.id.slice(0, 10)}
                  </small>
                </span>
                {active && <Check size={15} />}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="mobile-sheet-action"
          onClick={() => {
            onNew();
            onClose();
          }}
        >
          <span><Plus size={17} /> Nova sessão</span>
          <span className="mobile-sheet-action-hint"><History size={14} /></span>
        </button>
      </section>
    </>,
    document.body,
  );
}
