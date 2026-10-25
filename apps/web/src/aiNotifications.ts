import { useApp } from "./store";

function preview(text?: string): string {
  if (!text) return "A IA terminou de responder.";
  const clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "A IA terminou de responder.";
  return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
}

export function notifyAiResponse(input: {
  projectId: string;
  tabId: string;
  sessionId?: string;
  text?: string;
}): void {
  const state = useApp.getState();
  const visible =
    (state.aiPanelOpen && state.aiDockTab?.id === input.tabId) ||
    (state.activeTabId === input.tabId);
  if (visible) return;

  const messages = state.aiMessages[input.tabId] ?? [];
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.text.trim());
  state.addNotification({
    kind: "ai",
    title: "Resposta da IA",
    body: preview(input.text || lastAssistant?.text),
    projectId: input.projectId,
    tabId: input.tabId,
    sessionId: input.sessionId,
  });
}
