import { chatSessionTitle, type ProjectChats, type TophChat } from "./store";

/** One row of the Toph screen: a task and everything the list says about it. */
export interface SessionEntry {
  chat: TophChat;
  title: string;
  /** The last message's time, or when the session was last opened while empty. */
  activityAt: number;
  messageCount: number;
  running: boolean;
  unread: boolean;
}

type SessionNotification = { read: boolean; projectId?: string; chatId?: string };

/**
 * Every session of the project, newest activity first. A running message makes
 * the session running; a notification still unread marks it unread.
 */
export function projectSessions(
  project: ProjectChats | undefined,
  notifications: ReadonlyArray<SessionNotification>,
  projectId: string,
  activeChatIds: ReadonlySet<string> = new Set(),
): SessionEntry[] {
  if (!project) return [];
  const activity = new Map<string, { count: number; last: number }>();
  for (const message of project.messages) {
    const current = activity.get(message.chatId) ?? { count: 0, last: 0 };
    current.count += 1;
    current.last = Math.max(current.last, message.createdAt);
    activity.set(message.chatId, current);
  }
  const unread = new Set(
    notifications
      .filter((notification) => !notification.read && notification.projectId === projectId && notification.chatId)
      .map((notification) => notification.chatId!),
  );
  return project.chats
    .map((chat) => {
      const info = activity.get(chat.id);
      return {
        chat,
        title: chatSessionTitle(project, chat),
        activityAt: Math.max(chat.updatedAt, info?.last ?? 0),
        messageCount: info?.count ?? 0,
        running: activeChatIds.has(chat.id),
        unread: unread.has(chat.id),
      };
    })
    .sort((a, b) => b.activityAt - a.activityAt || a.chat.id.localeCompare(b.chat.id));
}

/** A session's time: the clock while it is today, the date before that. */
export function sessionWhen(value: number, now = new Date()): string {
  const date = new Date(value);
  const today =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (today) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString(
    "pt-BR",
    date.getFullYear() === now.getFullYear()
      ? { day: "2-digit", month: "short" }
      : { day: "2-digit", month: "2-digit", year: "numeric" },
  );
}

/** "Sem mensagens", "1 mensagem", "12 mensagens". */
export function sessionMessages(count: number): string {
  if (count === 0) return "Sem mensagens";
  return count === 1 ? "1 mensagem" : `${count} mensagens`;
}
