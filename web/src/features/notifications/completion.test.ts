import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../conversations/sound", () => ({
  playBotResponseSound: vi.fn(),
  unlockBotSound: vi.fn(),
}));

import { useApp } from "../../app/store";
import { useChats } from "../conversations/store";
import { playBotResponseSound } from "../conversations/sound";
import { handleAiCompletion } from "./completion";

const sound = vi.mocked(playBotResponseSound);

function focusWindow(): void {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  document.hasFocus = () => true;
}

function desktopViewport(): void {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function seedProject(activeTabChatId: string | null): void {
  useApp.setState({
    projects: [],
    activeProjectId: "p1",
    tabs: activeTabChatId
      ? [{ id: `ai:p1:${activeTabChatId}`, kind: "ai", title: "Toph", projectId: "p1", chatId: activeTabChatId }]
      : [{ id: "files:p1", kind: "editor", title: "arquivo.ts", projectId: "p1" }],
    activeTabId: activeTabChatId ? `ai:p1:${activeTabChatId}` : "files:p1",
    mobileScreen: "bots",
    notifications: [],
  });
  useChats.setState({
    byProject: {
      p1: {
        version: 5,
        chats: [{ id: "c1", name: "", description: "", participantIds: ["bot1"], createdAt: 1, updatedAt: 1 }],
        tophs: [],
        messages: [],
        activeChatId: "c1",
        hydrated: true,
      },
    },
    messageWrites: {},
  });
}

beforeEach(() => {
  focusWindow();
  desktopViewport();
  sound.mockClear();
});

describe("handleAiCompletion", () => {
  it("stays silent while the answered conversation is on screen", () => {
    seedProject("c1");
    handleAiCompletion({ projectId: "p1", chatId: "c1", botName: "Leo", body: "feito" });
    expect(useApp.getState().notifications).toHaveLength(0);
    expect(sound).not.toHaveBeenCalled();
  });

  it("notifies and beeps for an answer outside the visible conversation", () => {
    seedProject("c2");
    handleAiCompletion({ projectId: "p1", chatId: "c1", botName: "Leo", body: "feito", notificationId: "n1" });
    const notifications = useApp.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ projectId: "p1", chatId: "c1", title: "Leo" });
    expect(sound).toHaveBeenCalledTimes(1);
  });

  it("does not beep twice for duplicated deliveries", () => {
    seedProject("c2");
    handleAiCompletion({ projectId: "p1", chatId: "c1", body: "feito", notificationId: "n1" });
    handleAiCompletion({ projectId: "p1", chatId: "c1", body: "feito", notificationId: "n1" });
    expect(useApp.getState().notifications).toHaveLength(1);
    expect(sound).toHaveBeenCalledTimes(1);
  });
});
