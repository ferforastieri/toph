import { describe, expect, it } from "vitest";
import { isNotificationRedundant, type ConversationView } from "./suppress";

const view = (patch: Partial<ConversationView> = {}): ConversationView => ({
  focused: true,
  chatsVisible: true,
  activeProjectId: "p1",
  activeChatId: "c1",
  activeChatParticipantIds: ["bot1"],
  ...patch,
});

describe("isNotificationRedundant", () => {
  it("drops the notification for the conversation on screen", () => {
    expect(isNotificationRedundant({ projectId: "p1", chatId: "c1" }, view())).toBe(true);
  });

  it("keeps notifications for another conversation in the same project", () => {
    expect(isNotificationRedundant({ projectId: "p1", chatId: "c2" }, view())).toBe(false);
  });

  it("keeps notifications for another project", () => {
    expect(isNotificationRedundant({ projectId: "p2", chatId: "c1" }, view())).toBe(false);
  });

  it("keeps notifications when the window is not in the foreground", () => {
    expect(isNotificationRedundant({ projectId: "p1", chatId: "c1" }, view({ focused: false }))).toBe(false);
  });

  it("keeps notifications when the chat surface is off screen", () => {
    expect(isNotificationRedundant({ projectId: "p1", chatId: "c1" }, view({ chatsVisible: false, activeChatId: null }))).toBe(false);
  });

  it("keeps notifications with no chat open", () => {
    expect(isNotificationRedundant({ projectId: "p1", chatId: "c1" }, view({ activeChatId: null }))).toBe(false);
  });

  it("falls back to the answering Toph when the payload carries no chat id", () => {
    expect(isNotificationRedundant({ projectId: "p1", botId: "bot1" }, view())).toBe(true);
    expect(isNotificationRedundant({ projectId: "p1", botId: "bot2" }, view())).toBe(false);
  });

  it("accepts payloads without an identity hint when a conversation is open", () => {
    expect(isNotificationRedundant({ projectId: "p1" }, view())).toBe(true);
    expect(isNotificationRedundant({ projectId: "p1" }, view({ activeChatId: null }))).toBe(false);
  });

  it("never drops a notification without a project", () => {
    expect(isNotificationRedundant({}, view())).toBe(false);
  });
});
