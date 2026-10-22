import { beforeEach, describe, expect, it } from "vitest";
import { useApp, type Tab } from "./store";

function tab(id: string, kind: Tab["kind"] = "editor"): Tab {
  return { id, kind, title: id, projectId: "p" };
}

describe("workbench store", () => {
  beforeEach(() => {
    useApp.setState({
      tabs: [],
      activeTabId: null,
      aiMessages: {},
      aiStreaming: {},
      terminalIds: {},
      toasts: [],
    });
  });

  it("opens a tab once and activates the existing tab", () => {
    useApp.getState().openTab(tab("editor:one"));
    useApp.getState().openTab(tab("editor:two"));
    useApp.getState().openTab(tab("editor:one"));
    const state = useApp.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe("editor:one");
  });

  it("selects a neighbor when the active tab closes", () => {
    useApp.getState().openTab(tab("a"));
    useApp.getState().openTab(tab("b"));
    useApp.getState().openTab(tab("c"));
    useApp.getState().setActiveTab("b");
    useApp.getState().closeTab("b");
    expect(useApp.getState().tabs.map((item) => item.id)).toEqual(["a", "c"]);
    expect(useApp.getState().activeTabId).toBe("c");
  });

  it("appends streaming AI text to the right message", () => {
    useApp.getState().addAiMessage("ai:1", {
      id: "assistant-1",
      role: "assistant",
      text: "",
      createdAt: 1,
    });
    useApp.getState().appendAiText("ai:1", "assistant-1", "hello");
    useApp.getState().appendAiText("ai:1", "assistant-1", " world");
    expect(useApp.getState().aiMessages["ai:1"][0].text).toBe("hello world");
  });

  it("stores terminal ids per project", () => {
    useApp.getState().setTerminalId("p1", "t1");
    useApp.getState().setTerminalId("p2", "t2");
    expect(useApp.getState().terminalIds).toEqual({ p1: "t1", p2: "t2" });
  });
});
