import { AlertTriangle, Bot, TerminalSquare } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { Avatar } from "@/shared/boardui/base/avatar/avatar";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Modal } from "@/shared/boardui/base/modal/modal";

interface Props {
  open: boolean;
  project: Project | null;
  busy?: boolean;
  error?: string;
  mobile?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function CloseProjectModal({ open, project, busy = false, error = "", mobile = false, onClose, onConfirm }: Props) {
  if (!project) return null;
  return (
    <Modal
      isOpen={open}
      onClose={() => { if (!busy) onClose(); }}
      title="Fechar projeto?"
      description="A área aberta será fechada. O repositório e os dados continuam salvos."
      placement={mobile ? "bottom" : "center"}
      size="sm"
      swipeToClose={mobile && !busy}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default p-3">
          <Avatar size="sm" initials={project.name.slice(0, 1).toUpperCase()} className="bg-accent-500/15 text-caption-2-semibold text-accent-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-2-medium text-text-primary">{project.name}</p>
            <p className="truncate text-caption-1-regular text-text-tertiary">{project.root}</p>
          </div>
        </div>

        <div className="flex gap-3 rounded-2xl border border-status-rose-text/20 bg-status-rose-background p-3 text-status-rose-text">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="min-w-0 text-caption-1-regular leading-relaxed">
            <p className="font-medium">Os terminais deste projeto serão encerrados.</p>
            <p className="mt-1 text-status-rose-text/80">Terminais, sessões de debug e execuções de IA abertas no projeto param. Outros projetos não são afetados.</p>
          </div>
        </div>

        <div className="grid gap-2 text-caption-1-regular text-text-secondary">
          <span className="flex items-center gap-2"><TerminalSquare size={15} className="text-text-tertiary" /> Terminais deste projeto e seus processos</span>
          <span className="flex items-center gap-2"><Bot size={15} className="text-text-tertiary" /> Execuções de IA e sessões de debug</span>
        </div>

        {error ? <p className="rounded-xl bg-status-rose-background px-3 py-2 text-caption-1-regular text-status-rose-text">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>{busy ? "Encerrando..." : "Fechar projeto"}</Button>
        </div>
      </div>
    </Modal>
  );
}
