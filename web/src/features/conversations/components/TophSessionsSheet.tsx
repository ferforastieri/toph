import { useEffect, useState } from "react";
import type { Project } from "../../../shared/api";
import type { ChatToph } from "../store";
import { agentApi, type AgentSession } from "../../agents/api";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Modal } from "@/shared/boardui/base/modal/modal";

interface Props { open: boolean; project: Project; toph: ChatToph | null; onClose: () => void; onSelect: (s: AgentSession) => void; onNew: () => void }
export default function TophSessionsSheet({ open, project, toph, onClose, onSelect, onNew }: Props) {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || !toph) return;
    let cancelled = false;
    void agentApi.sessions(project.id, toph.id).then((items) => { if (!cancelled) setSessions(items); }).catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [open, project.id, toph?.id]);
  return <Modal isOpen={open} onClose={onClose} title={`Conversas de ${toph?.name ?? "Toph"}`} description="Histórico salvo no servidor. O Toph retoma o contexto do harness quando possível; se expirou, recomeça a partir deste histórico." size="lg" footer={<Button onClick={onNew}>Nova conversa</Button>}>
    {error && <p role="alert">{error}</p>}
    <div className="flex max-h-96 flex-col gap-2 overflow-auto">{sessions.map((session) => <Button key={session.id} variant="secondary" className="justify-between" onClick={() => onSelect(session)}><span>{session.title}{!session.archived ? " · atual" : ""}</span><span className="text-xs">{new Date(session.updatedAt).toLocaleString()}</span></Button>)}</div>
    {!sessions.length && <p>Nenhuma sessão salva ainda.</p>}
  </Modal>;
}
