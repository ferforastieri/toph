import { useApp } from "../../app/store";
import { api } from "../../shared/api";
import { playBotResponseSound } from "../conversations/sound";
import { isNotificationRedundant } from "./suppress";
import { currentConversationView } from "./view";

/** Completion payload as sent by the server stream and by the native push bridge. */
export interface AiCompletionPayload {
  title?: string;
  body?: string;
  notificationId?: string;
  projectId?: string;
  projectName?: string;
  botId?: string;
  botName?: string;
  botRole?: string;
  sessionId?: string;
  chatId?: string;
  tabId?: string;
}

/**
 * Registers an answer that finished in the background. When the user is already
 * watching that conversation the answer is on screen, so neither the in-app
 * notification nor its sound is wanted.
 */
export function handleAiCompletion(payload: AiCompletionPayload): void {
  const state = useApp.getState();
  const projectId = payload.projectId || state.activeProjectId || undefined;
  if (!projectId) return;
  if (isNotificationRedundant(
    { projectId, chatId: payload.chatId, botId: payload.botId },
    currentConversationView(),
  )) {
    // The answer is already on screen here, so it was not shown. The server
    // still stores it for the other devices: mark it read so this client does
    // not resurrect it on the next hydration.
    if (payload.notificationId) {
      void api.markNotificationsRead({ ids: [payload.notificationId] }).catch(() => undefined);
    }
    return;
  }
  const added = state.addNotification({
    kind: "ai",
    title: payload.botName?.trim() || payload.title?.trim() || "Resposta da IA",
    body: payload.body?.trim() || "A IA terminou de responder.",
    projectId,
    projectName: payload.projectName?.trim() || state.projects.find((project) => project.id === projectId)?.name,
    tabId: payload.tabId || `bots:${projectId}`,
    chatId: payload.chatId,
    sessionId: payload.sessionId,
    notificationId: payload.notificationId,
    botId: payload.botId,
    botName: payload.botName,
    botRole: payload.botRole,
  });
  // Duplicated deliveries (stream plus push) must not beep twice.
  if (added) playBotResponseSound();
}
