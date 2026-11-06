import type { ChatMessage } from "./store";

export function recoverBotReply(messages: ChatMessage[], tophId: string, chatId: string, startedAt: number): ChatMessage | undefined {
  return [...messages].reverse().find((message) => message.role === "assistant"
    && message.tophId === tophId
    && message.chatId === chatId
    && message.createdAt >= startedAt
    && Boolean(message.content.trim()));
}
