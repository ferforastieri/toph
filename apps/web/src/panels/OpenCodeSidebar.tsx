import { useEffect, useState } from "react";
import { Bot, Plus } from "@toph/icons";
import type { Project } from "../api";
import { listOpenCodeSessions, type OpenCodeSessionSummary } from "../opencodeSessions";
import { useApp } from "../store";
import { Button } from "@/components/ui/button";

export default function OpenCodeSidebar({ project, onNewSession, onOpenSession }: { project: Project; onNewSession: () => void; onOpenSession: (session: { id: string; title?: string }) => void; }) {
  const tabs = useApp((state) => state.tabs);
  const setActiveTab = useApp((state) => state.setActiveTab);
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [sessions, setSessions] = useState<OpenCodeSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false; setLoading(true); setError("");
    listOpenCodeSessions(project.root, 50)
      .then((items) => { if (!cancelled) { setStatus("online"); setSessions(items); } })
      .catch((err) => { if (!cancelled) { setStatus("offline"); setError(err instanceof Error ? err.message : "OpenCode unavailable."); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [project.root]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-2"><span className="text-xs font-medium text-muted-foreground">OpenCode</span><Button variant="ghost" size="icon-xs" aria-label="Nova sessão" onClick={onNewSession}><Plus size={15} /></Button></div>
      <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground"><span className={`size-2 rounded-full ${status === "online" ? "bg-emerald-500" : status === "offline" ? "bg-destructive" : "bg-amber-500"}`} />{status === "checking" ? "Verificando..." : status === "online" ? "Conectado" : "Offline"}</div>
      {error && <p className="mx-2 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">{error}</p>}
      <div className="mx-2 flex items-start gap-2 rounded-lg border bg-card p-3"><Bot size={16} className="mt-0.5 text-muted-foreground" /><p className="text-[11px] text-muted-foreground">As sessões rodam no servidor com acesso a <code className="text-primary">{project.root}</code>.</p></div>
      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-2">
        {loading && <p className="px-2 py-2 text-[11px] text-muted-foreground">Carregando sessões...</p>}
        {sessions.length > 0 && <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">OpenCode history</p>}
        {sessions.map((session) => (
          <Button key={session.id} variant="ghost" size="sm" className="h-8 justify-start px-2" onClick={() => onOpenSession(session)}><Bot size={15} className="text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-start">{session.title ?? session.id.slice(0, 8)}</span><small className="text-[10px] text-muted-foreground">saved</small></Button>
        ))}
        {!loading && !error && sessions.length === 0 && <p className="px-2 py-2 text-[11px] text-muted-foreground">Nenhuma sessão salva.</p>}
        {tabs.filter((tab) => tab.kind === "ai").map((tab) => (
          <Button key={tab.id} variant="ghost" size="sm" className="h-8 justify-start px-2" onClick={() => setActiveTab(tab.id)}><Bot size={15} className="text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-start">{tab.title}</span><small className="text-[10px] text-muted-foreground">{tab.sessionId ? tab.sessionId.slice(0, 6) : "new"}</small></Button>
        ))}
      </div>
    </div>
  );
}
