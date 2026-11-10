/** What a completion notification is about. */
export interface AiCompletion {
  projectId?: string | null;
  /** Conversation that received the answer, when the client knows it. */
  chatId?: string | null;
  /** Toph that answered, used when the payload carries no conversation id. */
  botId?: string | null;
}

/** What the user is looking at right now. */
export interface ConversationView {
  /** Window is visible and focused, so the user can actually see the answer. */
  focused: boolean;
  /** The conversational surface is on screen (mobile Toph screen; always true on desktop). */
  chatsVisible: boolean;
  activeProjectId: string | null;
  /** Conversation rendered by the conversational surface, when one is open. */
  activeChatId: string | null;
  /** Participants of `activeChatId`. */
  activeChatParticipantIds?: readonly string[];
}

/**
 * A completion is redundant when the user is already watching the conversation
 * that produced it. In that case the answer appears on screen and an in-app
 * notification would only add noise, so callers skip it.
 */
export function isNotificationRedundant(completion: AiCompletion, view: ConversationView): boolean {
  if (!view.focused || !view.chatsVisible) return false;
  const projectId = completion.projectId?.trim();
  if (!projectId || view.activeProjectId !== projectId) return false;
  const chatId = completion.chatId?.trim();
  if (chatId) return chatId === view.activeChatId;
  const botId = completion.botId?.trim();
  if (botId) {
    // Older payloads carry no conversation id: the open conversation counts only
    // when the Toph that answered takes part in it.
    return Boolean(view.activeChatId && view.activeChatParticipantIds?.includes(botId));
  }
  return view.activeChatId !== null;
}
