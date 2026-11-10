import { useEffect } from "react";
import { MessageSquarePlus } from "@toph/icons";
import { chatDisplayName, chatSessionTitle, chatTophs, type ChatToph, type ProjectChats, type TophChat } from "../store";
import TophStack from "../../agents/components/TophStack";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Modal } from "@/shared/boardui/base/modal/modal";
import { useApp } from "../../../app/store";
import { ensureChatSubjects } from "../subjects";

interface Props {
  open: boolean;
  projectId: string;
  toph: ChatToph | null;
  projectChats: ProjectChats | undefined;
  chats: TophChat[];
  onClose: () => void;
  onOpen: (chatId: string) => void;
  onNew: () => void;
}

function when(value: number): string {
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Every task a Toph is part of. The sidebar lists Tophs; this is their history. */
export default function TophTasksSheet({ open, projectId, toph, projectChats, chats, onClose, onOpen, onNew }: Props) {
  const notifications = useApp((state) => state.notifications);
  useEffect(() => {
    if (open) void ensureChatSubjects(projectId, chats);
  }, [open, projectId, chats]);
  const unreadFor = (chatId: string) => notifications.some((notification) => !notification.read && notification.chatId === chatId);
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Tarefas de ${toph?.name ?? "Toph"}`}
      description="Cada tarefa tem histórico e sessão próprios. Abra uma ou comece outra."
      size="md"
      footer={<Button leadingIcon={MessageSquarePlus} onClick={onNew}>Nova tarefa</Button>}
    >
      <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
        {chats.length === 0 ? <p className="py-6 text-center text-caption-1-regular text-text-tertiary">Nenhuma tarefa ainda.</p> : null}
        {chats.map((chat) => {
          const members = chatTophs(projectChats, chat.id);
          const title = chatSessionTitle(projectChats, chat);
          const participants = chatDisplayName(projectChats, chat);
          const unread = unreadFor(chat.id);
          return (
            <button
              key={chat.id}
              type="button"
              onClick={() => onOpen(chat.id)}
              className="flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 text-start transition-colors hover:bg-background-primary-hover"
            >
              <TophStack tophs={members} size={30} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-caption-1-medium text-text-primary">{title}</span>
                  {unread ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-accent-500"
                      title="Resposta não lida"
                      aria-label="Resposta não lida"
                    />
                  ) : null}
                </span>
                <span className="truncate text-caption-2-regular text-text-tertiary">
                  {participants !== title ? `${participants} · ` : ""}{when(chat.updatedAt)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
