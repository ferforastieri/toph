import { useEffect, useState } from "react";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Input } from "@/shared/boardui/base/input/input";
import { Modal } from "@/shared/boardui/base/modal/modal";
import { Textarea } from "@/shared/boardui/base/textarea/textarea";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
}

/** Small, centered form shown before the Toph picker when a team is created. */
export default function CreateTeamModal({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState("Equipe");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("Equipe");
    setDescription("");
  }, [open]);

  const create = () => {
    onCreate(name.trim() || "Equipe", description.trim());
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Nova equipe"
      description="Dê um nome para a equipe. Depois você escolhe os Tophs."
      placement="center"
      size="sm"
      bodyClassName="p-4"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={create}>Criar equipe</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Nome" value={name} onChange={setName} placeholder="Equipe" autoFocus />
        <Textarea
          label="Descrição (opcional)"
          rows={3}
          value={description}
          onChange={setDescription}
          placeholder="Contexto compartilhado com todos os Tophs desta equipe."
        />
      </div>
    </Modal>
  );
}
