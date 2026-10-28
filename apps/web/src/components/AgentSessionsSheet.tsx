import { useEffect, useState } from "react";
import { Bot, Check, History, Plus } from "@toph/icons";
import type { Project } from "../api";
import { relativeTime } from "../lib";
import { listOpenCodeSessions, type OpenCodeSessionSummary } from "../opencodeSessions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
      .then((items) => { if (!cancelled) setSessions(items); })
      .catch((err) => { if (!cancelled) { setSessions([]); setError(err instanceof Error ? err.message : "Could not load sessions."); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, project.root]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Sessões de {project.name}</DialogTitle><DialogDescription>Histórico de sessões do OpenCode.</DialogDescription></DialogHeader>
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><History size={14} /> OpenCode</div>
        {loading && <p className="py-6 text-center text-sm text-muted-foreground">Carregando sessões...</p>}
        {!loading && error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        {!loading && !error && sessions.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma sessão salva ainda.</p>}
        <div className="flex max-h-[440px] flex-col gap-1 overflow-y-auto">
          {sessions.map((session) => {
            const active = session.id === activeSessionId;
            return (
              <button type="button" className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-start ${active ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-accent"}`} key={session.id} onClick={() => onSelect(session)}>
                <Avatar className="size-8"><AvatarFallback className="bg-muted text-[10px]"><Bot size={15} /></AvatarFallback></Avatar>
                <span className="flex min-w-0 flex-1 flex-col"><strong className="truncate text-xs font-medium">{session.title || "Nova sessão"}</strong><small className="text-[10px] text-muted-foreground">{session.time?.updated ? relativeTime(new Date(session.time.updated).toISOString()) : session.id.slice(0, 10)}</small></span>
                {active && <Check size={15} className="text-primary" />}
              </button>
            );
          })}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => { onNew(); onClose(); }}><Plus size={15} /> Nova sessão</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
