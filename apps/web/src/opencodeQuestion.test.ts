import { describe, expect, it, vi } from "vitest";
import { answerOpenCodeQuestion } from "./opencodeQuestion";

describe("answerOpenCodeQuestion", () => {
  it("backgrounds the blocking tool and steers the same turn", async () => {
    const background = vi.fn().mockResolvedValue(undefined);
    const prompt = vi.fn().mockResolvedValue(undefined);

    await answerOpenCodeQuestion({ session: { background, prompt } }, "ses_test", "Minha resposta");

    expect(background).toHaveBeenCalledWith({ sessionID: "ses_test" });
    expect(prompt).toHaveBeenCalledWith({ sessionID: "ses_test", text: "Minha resposta", delivery: "steer" });
  });
});
