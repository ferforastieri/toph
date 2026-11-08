import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../../shared/api";
import type { Tab } from "../../../app/store";
import { useChats } from "../../conversations/store";
import { useLayoutTabs, useWorkspacePersistence } from "./useWorkspacePersistence";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  useChats.setState({ byProject: {}, messageWrites: {} });
});

it("persists layout changes without writing layout for typing or message streaming", async () => {
  vi.useFakeTimers();
  const save = vi.spyOn(api, "saveLayout").mockResolvedValue(undefined);
  useChats.getState().load("p");
  const chat = useChats.getState().byProject.p.chat;
  const tab = { id: "file", kind: "editor", projectId: "p", path: "main.rs", title: "main.rs", content: "a" } as Tab;
  const { rerender, unmount } = renderHook(({ tabs }) => {
    const layoutTabs = useLayoutTabs(tabs);
    useWorkspacePersistence("p", true, { tabs: layoutTabs, activeTabId: "file", sidebar: "files", terminalOpen: false }, 1);
  }, { initialProps: { tabs: [tab] } });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(save).toHaveBeenCalledTimes(1);
  act(() => {
    useChats.getState().addMessage("p", { id: "answer", chatId: chat.id, role: "assistant", content: "one", createdAt: 1 });
    useChats.getState().appendMessage("p", "answer", " two");
  });
  rerender({ tabs: [{ ...tab, content: "edited", dirty: true }] });
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(save).toHaveBeenCalledTimes(1);
  act(() => useChats.getState().updateChat("p", chat.id, { name: "Renamed" }));
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(save).toHaveBeenCalledTimes(2);
  unmount();
});
