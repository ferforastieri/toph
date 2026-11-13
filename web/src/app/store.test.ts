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

  it("stores terminal ids per project", () => {
    useApp.getState().setTerminalId("p1", "t1");
    useApp.getState().setTerminalId("p2", "t2");
    expect(useApp.getState().terminalIds).toEqual({ p1: "t1", p2: "t2" });
  });

  it("keeps every open project", () => {
    useApp.setState({ openProjectIds: [], activeProjectId: null });
    for (let index = 0; index < 8; index += 1) {
      useApp.getState().setActiveProject(`p${index}`);
    }
    expect(useApp.getState().openProjectIds).toHaveLength(8);
    expect(useApp.getState().activeProjectId).toBe("p7");
  });
});
