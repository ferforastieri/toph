import { describe, expect, it } from "vitest";
import { recoverBotReply } from "./botReply";
import type { ChatMessage } from "./chats";

describe("recoverBotReply", () => {
  it("uses a streamed answer instead of showing a false timeout error", () => {
    const messages: ChatMessage[] = [
      { id: "old", chatId: "chat", role: "assistant", tophId: "toph", content: "antiga", createdAt: 1 },
      { id: "current", chatId: "chat", role: "assistant", tophId: "toph", content: "resposta entregue", status: "complete", createdAt: 20 },
    ];

    expect(recoverBotReply(messages, "toph", "chat", 10)?.id).toBe("current");
  });
});
