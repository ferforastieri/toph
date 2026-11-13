import { useEffect, useMemo } from "react";
import { MessageSquarePlus } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { useChats } from "../../../features/conversations/store";
import { projectSessions } from "../../../features/conversations/sessions";
import { ensureChatSubjects } from "../../../features/conversations/subjects";
import { ensureToph } from "../../../features/agents/default-toph";
import { useActiveSessionIds } from "../../../features/agents/useActiveSessionIds";
import SessionRow from "../../../features/conversations/components/SessionRow";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Modal } from "@/shared/boardui/base/modal/modal";
import { useApp } from "../../store";

interface Props {
  open: boolean;
  project: Project;
  onClose: () => void;
  onSelected: () => void;
}

/** Mobile sessions sheet: every task of the project's Toph, newest first. */
export default function MobileConversationsSheet({ open, project, onClose, onSelected }: Props) {
  const chats = useChats((state) => state.byProject[project.id]);
  const ensure = useChats((state) => state.ensure);
  const createConversation = useChats((state) => state.createConversation);
  const notifications = useApp((state) => state.notifications);
  const activeSessions = useActiveSessionIds(project.id);
  const sessions = useMemo(
    () => projectSessions(chats, notifications, project.id, activeSessions),
    [activeSessions, chats, notifications, project.id],
  );

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  useEffect(() => {
    if (chats?.hydrated) void ensureChatSubjects(project.id, chats.chats);
  }, [chats?.hydrated, chats?.chats, project.id]);

  function select(chatId: string) {
    useApp.getState().markChatNotificationsRead(chatId);
    useChats.getState().setActiveChat(project.id, chatId);
    useChats.getState().touchConversation(project.id, chatId);
    onClose();
    onSelected();
  }

  function newTask() {
    const toph = ensureToph(project.id);
    if (!toph) return;
    const created = createConversation(project.id, [toph.id], { name: toph.name });
    if (created) select(created.id);
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Sessões"
      description="As tarefas do Toph neste projeto, a mais recente primeiro."
      placement="bottom"
      size="sm"
      bodyClassName="p-2"
      swipeToClose
    >
      <div className="flex gap-2 px-1 pb-2">
        <Button size="small" leadingIcon={MessageSquarePlus} className="flex-1 justify-center" disabled={!chats?.hydrated} onClick={newTask}>
          Nova tarefa
        </Button>
      </div>
      <div className="flex max-h-[min(60dvh,500px)] flex-col gap-0.5 overflow-y-auto">
        {!chats?.hydrated ? (
          <div className="flex items-center justify-center gap-2 py-8 text-caption-1-regular text-text-tertiary">
            <span className="size-3 animate-spin rounded-full border-2 border-text-tertiary/30 border-t-text-tertiary" />
            Carregando...
          </div>
        ) : null}
        {chats?.hydrated && sessions.length === 0 ? (
          <button type="button" onClick={newTask} className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-border-button-default px-2.5 py-3 text-start text-caption-1-medium text-text-secondary">
            <span className="flex size-8 items-center justify-center rounded-full bg-background-secondary-default text-accent-500"><MessageSquarePlus size={14} /></span>
            Começar a primeira tarefa
          </button>
        ) : null}
        {sessions.length > 0 ? (
          <ul className="flex flex-col gap-0.5" aria-label="Sessões">
            {sessions.map((session) => (
              <li key={session.chat.id}>
                <SessionRow
                  title={session.title}
                  activityAt={session.activityAt}
                  messageCount={session.messageCount}
                  running={session.running}
                  unread={session.unread}
                  selected={session.chat.id === chats?.activeChatId}
                  onOpen={() => select(session.chat.id)}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Modal>
  );
}
