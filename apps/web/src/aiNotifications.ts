import { api } from "./api";
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
  botId?: string;
  botName?: string;
  botRole?: string;
  text?: string;
}): void {
  const state = useApp.getState();
  const visible =
    typeof document !== "undefined" &&
    document.visibilityState === "visible" &&
    document.hasFocus() &&
    state.sidebar === "bots" &&
    state.activeProjectId === input.projectId;
  if (visible) return;

  const notificationId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const title = input.botName?.trim() || "Resposta da IA";
  const messages = state.aiMessages[input.tabId] ?? [];
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.text.trim());
  const body = preview(input.text || lastAssistant?.text);
  state.addNotification({
    kind: "ai",
    title,
    body,
    projectId: input.projectId,
    tabId: input.tabId,
    sessionId: input.sessionId,
    notificationId,
    botId: input.botId,
    botName: input.botName,
    botRole: input.botRole,
  });

  if (input.botId) {
    void api.notifyBot({
      notificationId,
      projectId: input.projectId,
      botId: input.botId,
      botName: title,
      botRole: input.botRole,
      sessionId: input.sessionId,
      tabId: input.tabId,
      title,
      body,
    }).catch(() => undefined);
  }
}
