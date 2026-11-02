import { beforeEach, describe, expect, it } from "vitest";
import { useBots, type BotMessage, type BotWorkspace, type MiniBot } from "./bots";

function bot(id: string, overrides: Partial<MiniBot> = {}): MiniBot {
  return {
    id,
    name: "Toph",
    handle: "toph",
    role: "Assistente",
    description: "",
    personality: "",
    model: "",
    language: "auto",
    color: "#FFB547",
    avatar: "mark-smile",
    notifications: true,
    coordinator: false,
    createdAt: 1,
    ...overrides,
  };
}

function message(id: string, channel: string, mode: "solo" | "team", createdAt: number): BotMessage {
  return { id, role: channel === "solo" || channel.startsWith("worker:") ? "assistant" : "user", content: id, channel, mode, createdAt };
}

function workspace(messages: BotMessage[]): BotWorkspace {
  return {
    version: 4,
    mode: "solo",
    modeExplicit: true,
    bots: [bot("bot-1", { sessionId: "old-session" })],
    messages,
    activeBotId: "bot-1",
  };
}

describe("Toph workspace sessions", () => {
  beforeEach(() => {
    useBots.setState({ byProject: {} });
  });

  it("switches the session and channel messages in a single update", () => {
    useBots.getState().load("p", workspace([
      message("old-solo", "solo", "solo", 1),
      message("old-worker", "worker:bot-1", "solo", 2),
      message("old-team", "team", "team", 3),
    ]));
    const next = message("new-solo", "solo", "solo", 4);
    useBots.getState().setBotSession("p", "bot-1", "new-session", {
      sessionPrimed: true,
      channel: "solo",
      messages: [next],
    });
    const state = useBots.getState().byProject.p;
    expect(state.bots[0].sessionId).toBe("new-session");
    expect(state.bots[0].sessionPrimed).toBe(true);
    expect(state.messages.map((item) => item.id)).toEqual(["old-worker", "old-team", "new-solo"]);
  });

  it("replaces a channel with an empty array for an empty session", () => {
    useBots.getState().load("p", workspace([
      message("old-solo", "solo", "solo", 1),
      message("old-worker", "worker:bot-1", "solo", 2),
    ]));
    useBots.getState().setBotSession("p", "bot-1", "empty-session", {
      sessionPrimed: true,
      channel: "solo",
      messages: [],
    });
    const state = useBots.getState().byProject.p;
    expect(state.messages.map((item) => item.id)).toEqual(["old-worker"]);
  });

  it("normalizes removed avatar ids to the current mark", () => {
    useBots.getState().load("p", {
      ...workspace([]),
      bots: [bot("bot-1", { avatar: "logo-smile" as MiniBot["avatar"] })],
    });
    expect(useBots.getState().byProject.p.bots[0].avatar).toBe("mark-smile");
  });
});
