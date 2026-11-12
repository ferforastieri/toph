import { useEffect, useState } from "react";
import { Trash2 } from "@toph/icons";
import type { Project } from "../../../shared/api";
import type { ProjectChats, TophChat } from "../store";
import { chatTophs, useChats } from "../store";
import { chatTabId } from "../navigation";
import { agentApi } from "../../agents/api";
import { useApp } from "../../../app/store";
import BotAvatar from "../../agents/components/BotAvatar";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Input } from "@/shared/boardui/base/input/input";
import { Modal } from "@/shared/boardui/base/modal/modal";
import { Textarea } from "@/shared/boardui/base/textarea/textarea";
import { useConfirm } from "../../../shared/ui/confirm";

interface Props {
  open: boolean;
  project: Project;
  chat: TophChat | null;
  projectChats: ProjectChats | undefined;
  onClose: () => void;
}

/** Name, context and the one Toph of a task. */
export default function ConversationSettings({ open, project, chat, projectChats, onClose }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    if (!open || !chat) return;
    setName(chat.name);
    setDescription(chat.description);
  }, [open, chat?.id, chat?.name, chat?.description]);

  if (!chat) return null;
  const conversation = chat;
  const memberTophs = chatTophs(projectChats, conversation.id);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      useChats.getState().updateChat(project.id, conversation.id, { name, description });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function removeConversation() {
    const ok = await confirm({
      title: "Apagar conversa?",
      message: "As mensagens e as sessões desta tarefa serão removidas. O Toph continua no projeto.",
      confirmLabel: "Apagar conversa",
      danger: true,
    });
    if (!ok) return;
    await agentApi.deleteChat(project.id, conversation.id).catch(() => undefined);
    useChats.getState().deleteConversation(project.id, conversation.id);
    useApp.getState().closeTab(chatTabId(project.id, conversation.id));
    onClose();
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Conversa"
      description="Nome e contexto desta tarefa."
      placement="center"
      size="md"
      bodyClassName="p-4"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="small" leadingIcon={Trash2} className="text-status-rose-text" onClick={() => void removeConversation()}>Apagar conversa</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" disabled={busy} onClick={() => void save()}>Salvar</Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nome (opcional)" value={name} onChange={setName} placeholder={memberTophs.map((toph) => toph.name).join(" + ")} />
        <Textarea
          label="Contexto da tarefa"
          rows={3}
          value={description}
          onChange={setDescription}
          placeholder="O que o Toph desta conversa precisa saber."
        />
        <div className="flex flex-col gap-1">
          <p className="text-caption-1-medium text-text-primary">Toph</p>
          {memberTophs.map((toph) => (
            <div key={toph.id} className="flex min-w-0 items-center gap-2.5 rounded-xl bg-background-secondary-default px-2 py-1.5">
              <BotAvatar bot={toph} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-caption-1-medium text-text-primary">{toph.name}</span>
                <span className="block truncate text-caption-2-regular text-text-tertiary">{toph.role || "Toph"}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
