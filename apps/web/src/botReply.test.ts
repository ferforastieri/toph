import { describe, expect, it } from "vitest";
import { recoverBotReply } from "./botReply";
import type { BotMessage } from "./bots";

describe("recoverBotReply", () => {
  it("uses a streamed answer instead of showing a false timeout error", () => {
    const messages: BotMessage[] = [
      { id: "old", role: "assistant", botId: "bot", channel: "solo", content: "antiga", createdAt: 1 },
      { id: "current", role: "assistant", botId: "bot", channel: "solo", content: "resposta entregue", status: "complete", createdAt: 20 },
    ];

    expect(recoverBotReply(messages, "bot", "solo", 10)?.id).toBe("current");
  });
});
