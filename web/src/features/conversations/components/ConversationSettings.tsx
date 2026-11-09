import { useEffect, useState } from "react";
import { Check, Trash2, X } from "@toph/icons";
import type { Project } from "../../../shared/api";
import type { ChatToph, ProjectChats, TophChat } from "../store";
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
import { cx } from "@/shared/boardui/utils/cx";

interface Props {
  open: boolean;
  project: Project;
  chat: TophChat | null;
  projectChats: ProjectChats | undefined;
  onClose: () => void;
}

/** Participants and shared context of one task. */
export default function ConversationSettings({ open, project, chat, projectChats, onClose }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    if (!open || !chat) return;
    setName(chat.name);
    setDescription(chat.description);
    setParticipants(chat.participantIds);
  }, [open, chat?.id, chat?.name, chat?.description, chat?.participantIds]);

  if (!chat) return null;
  const conversation = chat;
  const allTophs = projectChats?.tophs ?? [];
  const memberTophs = chatTophs(projectChats, conversation.id);
  const available = allTophs.filter((toph) => !memberTophs.some((member) => member.id === toph.id));

  function toggle(toph: ChatToph) {
    setParticipants((current) => current.includes(toph.id)
      ? current.filter((id) => id !== toph.id)
      : [...current, toph.id]);
  }

  async function save() {
    if (participants.length === 0 || busy) return;
    setBusy(true);
    const previous = new Set(conversation.participantIds);
    const next = new Set(participants);
    const removed = [...previous].filter((id) => !next.has(id));
    const added = [...next].filter((id) => !previous.has(id));
    try {
      await Promise.all(removed.map((id) => agentApi.deleteChatToph(project.id, conversation.id, id).catch(() => undefined)));
      useChats.getState().updateChat(project.id, conversation.id, { name, description });
      for (const id of removed) useChats.getState().removeParticipant(project.id, conversation.id, id);
      for (const id of added) useChats.getState().addParticipant(project.id, conversation.id, id);
      if (removed.length > 0) window.dispatchEvent(new CustomEvent("toph:refresh-chat"));
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function removeConversation() {
    const ok = await confirm({
      title: "Apagar conversa?",
      message: "As mensagens e as sessões desta tarefa serão removidas. Os Tophs continuam no projeto.",
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
      description="Participantes e contexto compartilhado desta tarefa."
      placement="center"
      size="md"
      bodyClassName="p-4"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="small" leadingIcon={Trash2} className="text-status-rose-text" onClick={() => void removeConversation()}>Apagar conversa</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" disabled={participants.length === 0 || busy} onClick={() => void save()}>Salvar</Button>
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
          placeholder="O que todos os Tophs desta conversa precisam saber."
        />
        <div className="flex flex-col gap-1">
          <p className="text-caption-1-medium text-text-primary">Participantes</p>
          {memberTophs.map((toph) => (
            <button
              key={toph.id}
              type="button"
              onClick={() => toggle(toph)}
              className="flex min-w-0 items-center gap-2.5 rounded-xl bg-background-secondary-default px-2 py-1.5 text-start transition-colors hover:bg-background-primary-hover"
            >
              <BotAvatar bot={toph} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-caption-1-medium text-text-primary">{toph.name}</span>
                <span className="block truncate text-caption-2-regular text-text-tertiary">{toph.role || "Toph"}</span>
              </span>
              <span className={cx("flex size-5 items-center justify-center rounded-md", participants.includes(toph.id) ? "bg-accent-500 text-text-on-accent" : "bg-background-tertiary-default text-text-tertiary")}>
                {participants.includes(toph.id) ? <Check size={12} /> : <X size={12} />}
              </span>
            </button>
          ))}
          <p className="text-caption-2-regular text-text-tertiary">
            {memberTophs.length === 1
              ? "Adicione outro Toph para transformar esta tarefa em grupo."
              : "Remover um participante apaga o histórico dele nesta tarefa."}
          </p>
        </div>
        {available.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="text-caption-1-medium text-text-primary">Adicionar Toph</p>
            {available.map((toph) => (
              <button
                key={toph.id}
                type="button"
                onClick={() => toggle(toph)}
                className={cx("flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 text-start transition-colors", participants.includes(toph.id) ? "bg-accent-500/10" : "hover:bg-background-primary-hover")}
              >
                <BotAvatar bot={toph} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-caption-1-medium text-text-primary">{toph.name}</span>
                  <span className="block truncate text-caption-2-regular text-text-tertiary">{toph.role || "Toph"}</span>
                </span>
                <span className={cx("flex size-5 items-center justify-center rounded-md border", participants.includes(toph.id) ? "border-accent-500 bg-accent-500 text-text-on-accent" : "border-border-button-default")}>
                  {participants.includes(toph.id) ? <Check size={12} /> : null}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
