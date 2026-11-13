import { describe, expect, it } from "vitest";
import type { ChatToph, ProjectChats } from "./store";
import { projectSessions, sessionMessages, sessionWhen } from "./sessions";

const toph: ChatToph = {
  id: "toph-1",
  name: "Toph",
  handle: "toph",
  role: "Toph",
  description: "",
  personality: "",
  prompt: "",
  model: "",
  engine: "opencode",
  effort: "",
  agentMode: "build",
  permissionMode: "yolo",
  mcpServers: [],
  emailAccountIds: [],
  tools: [],
  language: "auto",
  color: "#FFB547",
  avatar: "toph-logo",
  notifications: true,
  createdAt: 1,
};

function project(overrides: Partial<ProjectChats> = {}): ProjectChats {
  return {
    version: 5,
    chats: [],
    tophs: [toph],
    messages: [],
    activeChatId: null,
    hydrated: true,
    ...overrides,
  };
}

describe("projectSessions", () => {
  it("lists every session newest first, with message time, count and running state", () => {
    const sessions = projectSessions(
      project({
        chats: [
          { id: "older", name: "", subject: "Ajustar o build", description: "", participantIds: [toph.id], createdAt: 1, updatedAt: 10 },
          { id: "newer", name: "", subject: "Revisar login", description: "", participantIds: [toph.id], createdAt: 2, updatedAt: 20 },
        ],
        messages: [
          { id: "m1", chatId: "older", role: "assistant", content: "feito", createdAt: 30 },
          { id: "m2", chatId: "older", role: "assistant", content: "ainda", status: "running", createdAt: 40 },
          { id: "m3", chatId: "newer", role: "user", content: "oi", createdAt: 5 },
        ],
      }),
      [{ read: false, projectId: "p", chatId: "newer" }],
      "p",
      new Set(["older"]),
    );

    expect(sessions.map((session) => session.title)).toEqual(["Ajustar o build", "Revisar login"]);
    expect(sessions[0]).toMatchObject({ messageCount: 2, running: true, unread: false, activityAt: 40 });
    expect(sessions[1]).toMatchObject({ messageCount: 1, running: false, unread: true, activityAt: 20 });
  });

  it("keeps only this project's unread notifications, and falls back to the session time when empty", () => {
    const sessions = projectSessions(
      project({
        chats: [
          { id: "chat", name: "", subject: "", description: "", participantIds: [toph.id], createdAt: 1, updatedAt: 12 },
        ],
      }),
      [
        { read: false, projectId: "other", chatId: "chat" },
        { read: true, projectId: "p", chatId: "chat" },
      ],
      "p",
    );

    expect(sessions[0]).toMatchObject({ activityAt: 12, messageCount: 0, unread: false });
  });
});

describe("sessionWhen", () => {
  it("shows the clock today and the date before that", () => {
    const now = new Date(2026, 10, 13, 15, 0);
    expect(sessionWhen(new Date(2026, 10, 13, 9, 30).getTime(), now)).toBe("09:30");
    expect(sessionWhen(new Date(2026, 9, 2, 9, 30).getTime(), now)).toContain("02");
  });
});

describe("sessionMessages", () => {
  it("counts the session's messages in words", () => {
    expect(sessionMessages(0)).toBe("Sem mensagens");
    expect(sessionMessages(1)).toBe("1 mensagem");
    expect(sessionMessages(12)).toBe("12 mensagens");
  });
});
