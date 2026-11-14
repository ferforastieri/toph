import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MessageSquarePlus } from "@toph/icons";
import BrandMark from "@toph/brand";
import type { Project } from "../../../shared/api";
import { useChats } from "../../conversations/store";
import { chatTabId, openChatTab } from "../../conversations/navigation";
import { chatSessionTitle } from "../../conversations/store";
import { projectSessions } from "../../conversations/sessions";
import { ensureChatSubjects } from "../../conversations/subjects";
import { Button } from "@toph/ui/app";
import SidebarHeader from "../../../app/components/SidebarHeader";
import { useApp } from "../../../app/store";
import { ensureToph } from "../default-toph";
import { useActiveSessionIds } from "../useActiveSessionIds";
import SessionRow from "../../conversations/components/SessionRow";
import { agentApi, type HarnessSession } from "../api";
import { useConfirm } from "../../../shared/ui/confirm";

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
  const notify = useApp((state) => state.notify);
  const confirm = useConfirm();

  async function removeConversation(chatId: string, title: string) {
    const ok = await confirm({
      title: "Apagar conversa?",
      message: `“${title}” sai deste projeto. O harness decide se a sessão também é apagada.`,
      confirmLabel: "Apagar conversa",
      danger: true,
    });
    if (!ok) return;
    try {
      await agentApi.deleteChat(project.id, chatId);
      useChats.getState().deleteConversation(project.id, chatId);
      useApp.getState().closeTab(chatTabId(project.id, chatId));
    } catch {
      notify("error", "O harness não deixou apagar esta conversa.");
    }
  }

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  useEffect(() => {
    if (chats?.hydrated) void ensureChatSubjects(project.id, chats.chats);
  }, [chats?.hydrated, chats?.chats, project.id]);

  const toph = chats?.tophs[0] ?? null;
  const activeSessions = useActiveSessionIds(project.id);
  // The live harness sessions: the list shows what the installed CLI knows, not chats of our own.
  const [harness, setHarness] = useState<HarnessSession[] | null>(null);
  const sessionCount = chats?.chats.length ?? 0;
  useEffect(() => {
    let cancelled = false;
    void agentApi
      .harnessSessions(project.id)
      .then((items) => {
        if (!cancelled) setHarness(items);
      })
      .catch(() => {
        if (!cancelled) setHarness(null);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, sessionCount, activeSessions]);
  const allSessions = useMemo(
    () => projectSessions(chats, notifications, project.id, activeSessions),
    [activeSessions, chats, notifications, project.id],
  );
  // Every conversation is a message list entry; the harness only enriches it
  // with the title and time it knows. It never hides a conversation.
  const sessions = useMemo(() => {
    if (!harness) return allSessions;
    const byChat = new Map(harness.map((item) => [item.chatId, item]));
    return allSessions.map((session) => {
      const item = byChat.get(session.chat.id);
      return item
        ? { ...session, title: item.title || session.title, activityAt: item.updatedAt || session.activityAt }
        : session;
    });
  }, [allSessions, harness]);

  function openTask(chatId: string) {
    const current = useChats.getState().byProject[project.id];
    const chat = current?.chats.find((item) => item.id === chatId);
    if (!chat) return;
    useApp.getState().markChatNotificationsRead(chatId);
    useChats.getState().setActiveChat(project.id, chatId);
    useChats.getState().touchConversation(project.id, chatId);
    openChatTab(project.id, chatId, chatSessionTitle(chats, chat));
    onSelectChat?.();
  }

  function newTask() {
    const active = ensureToph(project.id);
    if (!active) return;
    const created = createConversation(project.id, [active.id]);
    if (created) openTask(created.id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-primary-default">
      <SidebarHeader
        control={headerControl}
        icon={<BrandMark size="small" className="size-4" />}
        title="Mensagens"
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
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5 pt-1">
        {!chats?.hydrated ? (
          <div className="flex items-center justify-center gap-2 py-8 text-caption-1-regular text-text-tertiary">
            <span className="size-3 animate-spin rounded-full border-2 border-text-tertiary/30 border-t-text-tertiary" />
            Carregando...
          </div>
        ) : null}
        {chats?.hydrated && toph && sessions.length === 0 ? (
          <button
            type="button"
            onClick={newTask}
            className="mt-1 flex w-full flex-col items-start gap-2 rounded-2xl border border-dashed border-border-button-default px-3 py-4 text-start transition-colors hover:bg-background-primary-hover"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-background-secondary-default text-accent-500"><MessageSquarePlus size={16} /></span>
            <span className="text-caption-1-semibold text-text-primary">Começar a primeira tarefa</span>
            <span className="text-caption-2-regular text-text-tertiary">A conversa abre uma sessão nova para você.</span>
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
                  onDelete={() => void removeConversation(session.chat.id, session.title)}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
