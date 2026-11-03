import type { BotMessage } from "./bots";

export function recoverBotReply(messages: BotMessage[], botId: string, channel: string, startedAt: number): BotMessage | undefined {
  return [...messages].reverse().find((message) => message.role === "assistant"
    && message.botId === botId
    && message.channel === channel
    && message.createdAt >= startedAt
    && Boolean(message.content.trim()));
}
