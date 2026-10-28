import { useEffect } from "react";
import { Bot, Plus } from "@toph/icons";
import { providerLabel, useAI } from "../ai";
import type { Project } from "../api";
import OpenCodeSidebar from "./OpenCodeSidebar";
import { Button } from "@/components/ui/button";

interface Props {
  project: Project;
  onNewSession: () => void;
  onOpenSession: (session: { id: string; title?: string }) => void;
}

export default function AiSidebar({ project, onNewSession, onOpenSession }: Props) {
  const config = useAI((state) => state.config);
  const load = useAI((state) => state.load);
  useEffect(() => { if (!config) void load(); }, [config, load]);
  if (config?.provider === "opencode") return <OpenCodeSidebar project={project} onNewSession={onNewSession} onOpenSession={onOpenSession} />;
  const label = config ? providerLabel(config.provider) : "Agent";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-2"><span className="text-xs font-medium text-muted-foreground">Agent</span><Button variant="ghost" size="icon-xs" aria-label="Novo chat" onClick={onNewSession}><Plus size={15} /></Button></div>
      <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground"><span className="size-2 rounded-full bg-emerald-500" />{config ? `${label}${config.model ? ` · ${config.model}` : ""}` : "Carregando..."}</div>
      <div className="mx-2 flex items-start gap-2 rounded-lg border bg-card p-3"><Bot size={16} className="mt-0.5 text-muted-foreground" /><p className="text-[11px] text-muted-foreground">O agente roda no servidor com acesso a <code className="text-primary">{project.root}</code>.</p></div>
      <div className="p-2"><Button variant="outline" size="sm" className="w-full justify-start" onClick={onNewSession}><Bot size={14} /> Novo chat</Button></div>
    </div>
  );
}
