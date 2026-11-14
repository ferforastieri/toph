import { useApp } from "../../app/store";

export function chatTabId(projectId: string, chatId: string): string {
  return `ai:${projectId}:${chatId}`;
}

/** Opens or focuses a conversation tab in the active project. */
export function openChatTab(projectId: string, chatId: string, title: string): void {
  useApp.getState().openTab({
    id: chatTabId(projectId, chatId),
    kind: "ai",
    title,
    projectId,
    chatId,
  });
}

/** Lets the workbench switch projects and hydrate the conversation list first. */
export function requestOpenChat(projectId: string, chatId: string, title = "Conversa"): void {
  window.dispatchEvent(new CustomEvent("toph:open-chat", { detail: { projectId, chatId, title } }));
}
