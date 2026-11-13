import { useEffect, useMemo, type ReactNode } from "react";
import { Bot, MessageSquare, MessageSquarePlus, Plus } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { useChats } from "../../conversations/store";
import { openChatTab } from "../../conversations/navigation";
import { projectSessions } from "../../conversations/sessions";
import { ensureChatSubjects } from "../../conversations/subjects";
import { Button } from "@toph/ui/app";
import SidebarHeader from "../../../app/components/SidebarHeader";
import { useApp } from "../../../app/store";
import { ensureToph } from "../default-toph";
import { useActiveSessionIds } from "../useActiveSessionIds";
import SessionRow from "../../conversations/components/SessionRow";

interface Props {
  project: Project;
  headerControl?: ReactNode;
  onSelectChat?: () => void;
}

/** The project's one Toph: every task is a session here, the newest first. */
export default function BotsSidebar({ project, headerControl, onSelectChat }: Props) {
  const chats = useChats((state) => state.byProject[project.id]);
  const ensure = useChats((state) => state.ensure);
  const createConversation = useChats((state) => state.createConversation);
  const notifications = useApp((state) => state.notifications);

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  useEffect(() => {
    if (chats?.hydrated) void ensureChatSubjects(project.id, chats.chats);
  }, [chats?.hydrated, chats?.chats, project.id]);

  const toph = chats?.tophs[0] ?? null;
  const activeSessions = useActiveSessionIds(project.id);
  const sessions = useMemo(
    () => projectSessions(chats, notifications, project.id, activeSessions),
    [activeSessions, chats, notifications, project.id],
  );

  function openTask(chatId: string) {
    const current = useChats.getState().byProject[project.id];
    const chat = current?.chats.find((item) => item.id === chatId);
    if (!chat) return;
    useApp.getState().markChatNotificationsRead(chatId);
    useChats.getState().setActiveChat(project.id, chatId);
    useChats.getState().touchConversation(project.id, chatId);
    openChatTab(project.id, chatId, "Toph");
    onSelectChat?.();
  }

  function newTask() {
    const active = ensureToph(project.id);
    if (!active) return;
    const created = createConversation(project.id, [active.id], { name: active.name });
    if (created) openTask(created.id);
  }

  function openSession() {
    const latest = sessions[0]?.chat;
    if (latest) {
      openTask(latest.id);
      return;
    }
    newTask();
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-primary-default">
      <SidebarHeader
        control={headerControl}
        icon={<Bot size={15} className="text-accent-500" />}
        title="Toph"
        count={
          sessions.length > 0 ? (
            <span
              className="rounded-full bg-background-tertiary-default px-1.5 text-caption-2-regular text-text-tertiary"
              title={sessions.length === 1 ? "1 sessão" : `${sessions.length} sessões`}
            >
              {sessions.length}
            </span>
          ) : undefined
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              leadingIcon={MessageSquare}
              aria-label="Abrir sessão"
              title="Abrir a sessão mais recente"
              disabled={!chats?.hydrated}
              onClick={openSession}
            />
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              leadingIcon={MessageSquarePlus}
              aria-label="Nova tarefa"
              title="Começar nova tarefa"
              disabled={!chats?.hydrated}
              onClick={newTask}
            />
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5 pt-1">
        {!chats?.hydrated ? (
          <div className="flex items-center justify-center gap-2 py-8 text-caption-1-regular text-text-tertiary">
            <span className="size-3 animate-spin rounded-full border-2 border-text-tertiary/30 border-t-text-tertiary" />
            Carregando...
          </div>
        ) : null}
        {chats?.hydrated && !toph ? (
          <button
            type="button"
            onClick={newTask}
            className="mt-1 flex w-full flex-col items-start gap-2 rounded-2xl border border-dashed border-border-button-default px-3 py-4 text-start transition-colors hover:bg-background-primary-hover"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-background-secondary-default text-accent-500"><Plus size={16} /></span>
            <span className="text-caption-1-semibold text-text-primary">Criar o Toph</span>
            <span className="text-caption-2-regular text-text-tertiary">Um Toph por projeto, conectado aos harnesses.</span>
          </button>
        ) : null}
        {chats?.hydrated && toph && sessions.length === 0 ? (
          <button
            type="button"
            onClick={newTask}
            className="mt-1 flex w-full flex-col items-start gap-2 rounded-2xl border border-dashed border-border-button-default px-3 py-4 text-start transition-colors hover:bg-background-primary-hover"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-background-secondary-default text-accent-500"><MessageSquarePlus size={16} /></span>
            <span className="text-caption-1-semibold text-text-primary">Começar a primeira tarefa</span>
            <span className="text-caption-2-regular text-text-tertiary">O Toph abre uma sessão nova para você.</span>
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
                  onOpen={() => openTask(session.chat.id)}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
