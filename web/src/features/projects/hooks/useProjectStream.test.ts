import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useApp } from "../../../app/store";
import { PROJECT_EVENT } from "../events";
import { useProjectStream } from "./useProjectStream";

class Socket {
  static instances: Socket[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  close = vi.fn();
  constructor() { Socket.instances.push(this); }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Socket.instances = [];
  useApp.setState({ activeProjectId: null });
});

it("shares the event connection across projects and closes it on unmount", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
  useApp.setState({ activeProjectId: "first" });
  const received = vi.fn();
  window.addEventListener(PROJECT_EVENT, received);
  const { rerender, unmount } = renderHook(() => useProjectStream(true));
  expect(Socket.instances).toHaveLength(1);
  act(() => useApp.setState({ activeProjectId: "second" }));
  rerender();
  expect(Socket.instances).toHaveLength(1);
  const socket = Socket.instances[0];
  act(() => {
    socket.onmessage?.({ data: JSON.stringify({ type: "files", projectId: "first" }) });
    socket.onmessage?.({ data: JSON.stringify({ type: "files", projectId: "second", path: "a" }) });
    socket.onmessage?.({ data: JSON.stringify({ type: "files", projectId: "second", path: "b" }) });
  });
  await act(() => vi.advanceTimersByTimeAsync(140));
  expect(received).toHaveBeenCalledTimes(1);
  expect((received.mock.calls[0][0] as CustomEvent).detail.path).toBe("b");
  unmount();
  expect(socket.close).toHaveBeenCalledTimes(1);
  window.removeEventListener(PROJECT_EVENT, received);
});
