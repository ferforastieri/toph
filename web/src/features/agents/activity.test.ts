import { beforeEach, describe, expect, it } from "vitest";
import { useAgentActivity } from "./activity";

beforeEach(() => {
  useAgentActivity.setState({ byProject: {} });
});

describe("useAgentActivity", () => {
  it("tracks the chats running in a project", () => {
    useAgentActivity.getState().setRunning("p", ["c1", "c2"]);
    expect(useAgentActivity.getState().byProject.p.running).toEqual(["c1", "c2"]);

    useAgentActivity.getState().setRunning("p", ["c1"]);
    expect(useAgentActivity.getState().byProject.p.running).toEqual(["c1"]);
  });

  it("keeps pending questions unique and removes them when answered", () => {
    const store = useAgentActivity.getState();
    const question = { id: "q1", chatId: "c1", runId: "r1", agentId: "t1" };

    expect(store.addQuestion("p", question)).toBe(true);
    expect(useAgentActivity.getState().addQuestion("p", question)).toBe(false);
    expect(useAgentActivity.getState().byProject.p.questions).toEqual([question]);

    useAgentActivity.getState().removeQuestion("p", "q1");
    expect(useAgentActivity.getState().byProject.p.questions).toEqual([]);
  });
});
