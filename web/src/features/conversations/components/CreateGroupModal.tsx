import { useEffect, useState } from "react";
import { Check } from "@toph/icons";
import type { ChatToph } from "../store";
import BotAvatar from "../../agents/components/BotAvatar";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Input } from "@/shared/boardui/base/input/input";
import { Modal } from "@/shared/boardui/base/modal/modal";
import { Textarea } from "@/shared/boardui/base/textarea/textarea";
import { cx } from "@/shared/boardui/utils/cx";

interface Props {
  open: boolean;
  tophs: ChatToph[];
  onClose: () => void;
  onCreate: (name: string, description: string, participantIds: string[]) => void;
}

/** Creates a group task: a conversation, never a team entity. */
export default function CreateGroupModal({ open, tophs, onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setSelected([]);
  }, [open]);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Nova conversa em grupo"
      description="Escolha dois ou mais Tophs. O grupo é só esta tarefa; nenhum deles sai do lugar."
      placement="center"
      size="md"
      bodyClassName="p-4"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={selected.length < 2} onClick={() => onCreate(name, description, selected)}>
            Abrir conversa
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Nome (opcional)" value={name} onChange={setName} placeholder="Ex.: revisão do checkout" autoFocus />
        <Textarea
          label="Contexto da tarefa (opcional)"
          rows={3}
          value={description}
          onChange={setDescription}
          placeholder="O que todos os Tophs desta conversa precisam saber."
        />
        <div className="flex flex-col gap-1">
          <p className="px-0.5 text-caption-1-medium text-text-primary">Tophs</p>
          {tophs.length < 2 ? (
            <p className="rounded-xl border border-dashed border-border-button-default p-3 text-caption-2-regular text-text-tertiary">
              Crie pelo menos dois Tophs para abrir uma conversa em grupo.
            </p>
          ) : (
            <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {tophs.map((toph) => {
                const active = selected.includes(toph.id);
                return (
                  <button
                    key={toph.id}
                    type="button"
                    onClick={() => toggle(toph.id)}
                    className={cx(
                      "flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 text-start transition-colors",
                      active ? "bg-accent-500/10" : "hover:bg-background-primary-hover",
                    )}
                  >
                    <BotAvatar bot={toph} size={28} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-caption-1-medium text-text-primary">{toph.name}</span>
                      <span className="truncate text-caption-2-regular text-text-tertiary">{toph.role || "Toph"}</span>
                    </span>
                    <span className={cx("flex size-5 shrink-0 items-center justify-center rounded-md border", active ? "border-accent-500 bg-accent-500 text-text-on-accent" : "border-border-button-default")}>
                      {active ? <Check size={12} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
