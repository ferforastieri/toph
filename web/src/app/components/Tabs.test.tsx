import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useApp, type Tab } from "../store";
import { useSettings } from "../../features/settings/store";
import { ConfirmProvider } from "../../shared/ui/confirm";
import Tabs from "./Tabs";

function tab(id: string, title: string): Tab {
  return {
    id,
    kind: "editor",
    title,
    projectId: "p",
    path: `src/${title}`,
  };
}

beforeEach(() => {
  useSettings.setState({ confirmClose: true });
  useApp.setState({
    tabs: [tab("a", "a.ts"), tab("b", "b.ts"), tab("c", "c.ts")],
    activeTabId: "b",
  });
});

afterEach(cleanup);

describe("Tabs context menu", () => {
  it("closes only the tabs to the right of the clicked tab", () => {
    render(<ConfirmProvider><Tabs /></ConfirmProvider>);

    fireEvent.contextMenu(screen.getByText("b.ts"), { clientX: 20, clientY: 20 });
    expect(screen.getByText("Fechar abas à direita")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Fechar abas à direita"));

    expect(useApp.getState().tabs.map((item) => item.title)).toEqual(["a.ts", "b.ts"]);
    expect(screen.queryByText("Fechar abas à direita")).not.toBeInTheDocument();
  });

  it("closes every tab except the clicked one", () => {
    render(<ConfirmProvider><Tabs /></ConfirmProvider>);

    fireEvent.contextMenu(screen.getByText("b.ts"), { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByText("Fechar outras abas"));

    expect(useApp.getState().tabs.map((item) => item.title)).toEqual(["b.ts"]);
    expect(useApp.getState().activeTabId).toBe("b");
  });

  it("closes saved tabs and keeps dirty tabs", () => {
    useApp.setState({ tabs: [tab("a", "a.ts"), tab("b", "b.ts"), { ...tab("c", "c.ts"), dirty: true }] });
    render(<ConfirmProvider><Tabs /></ConfirmProvider>);

    fireEvent.contextMenu(screen.getByText("a.ts"), { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByText("Fechar abas salvas"));

    expect(useApp.getState().tabs.map((item) => item.title)).toEqual(["c.ts"]);
    expect(useApp.getState().activeTabId).toBe("c");
  });
});
