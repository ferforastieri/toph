import { agentApi } from "../agents/api";
import { sessionSubject, useChats, type TophChat } from "./store";

const attempted = new Set<string>();

/**
 * Sessions created before subjects existed only know their Toph names. Read
 * their first user message once and remember it as the session subject, so
 * lists and tabs say what the conversation is about.
 */
export async function ensureChatSubjects(projectId: string, chats: TophChat[]): Promise<void> {
  const pending = chats.filter((chat) => !chat.subject?.trim() && !attempted.has(`${projectId}:${chat.id}`)).slice(0, 30);
  await Promise.all(
    pending.map(async (chat) => {
      attempted.add(`${projectId}:${chat.id}`);
      try {
        const snapshot = await agentApi.snapshot(projectId, chat.id);
        const first = snapshot.messages.find((message) => message.role === "user" && message.content.trim());
        if (!first) return;
        const subject = sessionSubject(first.content);
        if (!subject) return;
        const current = useChats.getState().byProject[projectId]?.chats.find((item) => item.id === chat.id);
        if (!current || current.subject?.trim()) return;
        useChats.getState().updateChat(projectId, chat.id, { subject });
      } catch {
        // Best effort: without a session the participants' names stay.
      }
    }),
  );
}
