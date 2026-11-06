import { describe, expect, it } from "vitest";
import { mergeNativeMessages, mergeNativeRuns } from "./useAgentChat";
import type { NativeMessage, AgentRun } from "./api";

describe("native conversation reconciliation", () => {
  it("deduplicates live events and snapshots without regressing a completed answer", () => {
    const completed: NativeMessage = { id: "answer", chatId: "chat", role: "assistant", content: "Final answer", status: "complete", createdAt: 2, seq: 3 };
    const earlier: NativeMessage = { id: "user", chatId: "chat", role: "user", content: "Question", createdAt: 1, seq: 2 };
    const stale = { ...completed, content: "Final", status: "running" as const };
    expect(mergeNativeMessages([completed], [earlier, stale, completed])).toEqual([earlier, completed]);
  });
  it("does not regress terminal runs when a reconnect snapshot races with completion", () => {
    const run: AgentRun = { id: "run", sessionId: "session", agentId: "agent", chatId: "chat", state: "completed", error: "", createdAt: 1, finishedAt: 2 };
    expect(mergeNativeRuns([run], [{ ...run, state: "running" }])).toEqual([run]);
  });
});
