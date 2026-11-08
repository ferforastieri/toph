import { beforeEach, describe, expect, it } from "vitest";
import {
  activeChat,
  chatForToph,
  chatTophs,
  messagesForChat,
  messagesForToph,
  tophForChat,
  useChats,
  type ChatMessage,
  type ChatToph,
  type TophPreset,
} from "./store";

const preset = (name: string, role: string): TophPreset => ({
  name,
  role,
  description: "",
  personality: "",
  prompt: "",
  color: "#FFB547",
  avatar: "toph-core",
});

const legacyToph = (id: string, chatId: string, name: string): ChatToph => ({
  id,
  chatId,
  name,
  handle: name.toLowerCase(),
  role: "Dev",
  description: "",
  personality: "",
  prompt: "",
  model: "",
  engine: "opencode",
  effort: "",
  agentMode: "build",
  permissionMode: "yolo",
  mcpServers: [],
  skills: [],
  emailAccountIds: [],
  tools: [],
  language: "auto",
  color: "#FFB547",
  avatar: "toph-core",
  notifications: true,
  createdAt: 1,
});

beforeEach(() => {
  useChats.setState({ byProject: {}, messageWrites: {} });
});

describe("useChats", () => {
  it("starts every project with one normal team conversation", () => {
    const project = useChats.getState().ensure("p");
    expect(project.version).toBe(4);
    expect(project.chats).toHaveLength(1);
    expect(project.chats[0].name).toBe("Equipe");
    expect(project.tophs).toHaveLength(0);
    expect(activeChat(project)?.id).toBe(project.chats[0].id);
  });

  it("merges the old individual and team chats into one team", () => {
    useChats.getState().load("p", {
      version: 2,
      chats: [
        { id: "individual", name: "Leo", description: "", kind: "individual", createdAt: 1, updatedAt: 1 },
        { id: "team", name: "Equipe", description: "time", kind: "team", createdAt: 2, updatedAt: 2 },
      ],
      tophs: [legacyToph("t1", "individual", "Leo"), legacyToph("t2", "team", "Nico")],
      messages: [
        { id: "m1", chatId: "individual", role: "user", content: "oi", createdAt: 1 },
        { id: "m2", chatId: "team", tophId: "t2", role: "assistant", content: "olá", createdAt: 2 },
      ],
      activeChatId: "individual",
    } as never);

    const project = useChats.getState().byProject.p;
    expect(project.version).toBe(4);
    expect(project.chats).toHaveLength(1);
    expect(project.chats[0].name).toBe("Equipe");
    expect(project.tophs).toHaveLength(2);
    expect(project.tophs.every((toph) => toph.chatId === project.chats[0].id)).toBe(true);
    expect(project.messages).toHaveLength(2);
    expect(project.messages.every((message) => message.chatId === project.chats[0].id)).toBe(true);
  });

  it("creates the normal team when an old layout has no team", () => {
    useChats.getState().load("p", {
      version: 2,
      chats: [{ id: "individual", name: "Leo", description: "", kind: "individual", createdAt: 1, updatedAt: 1 }],
      tophs: [legacyToph("t1", "individual", "Leo")],
      messages: [{ id: "m1", chatId: "individual", tophId: "t1", role: "assistant", content: "oi", createdAt: 1 }],
      activeChatId: "individual",
    } as never);

    const project = useChats.getState().byProject.p;
    expect(project.chats).toHaveLength(1);
    expect(project.chats[0].name).toBe("Equipe");
    expect(project.tophs[0].chatId).toBe(project.chats[0].id);
    expect(project.messages[0].chatId).toBe(project.chats[0].id);
  });

  it("creates teams and keeps each team's Tophs separate", () => {
    const first = useChats.getState().ensure("p").chats[0];
    const second = useChats.getState().createChat("p", "Produto");
    useChats.getState().addToph("p", first.id, preset("Leo", "Dev"));
    useChats.getState().addToph("p", second.id, preset("Nico", "Revisor"));

    let project = useChats.getState().byProject.p;
    expect(project.chats).toHaveLength(2);
    expect(chatTophs(project, first.id)).toHaveLength(1);
    expect(chatTophs(project, second.id)).toHaveLength(1);
    expect(chatTophs(project, first.id)[0].name).toBe("Leo");
    expect(chatTophs(project, second.id)[0].name).toBe("Nico");

    useChats.getState().setActiveChat("p", second.id);
    expect(activeChat(useChats.getState().byProject.p)?.id).toBe(second.id);

    const nico = chatTophs(project, second.id)[0];
    useChats.getState().removeToph("p", nico.id);
    project = useChats.getState().byProject.p;
    expect(chatTophs(project, first.id)).toHaveLength(1);
    expect(chatTophs(project, second.id)).toHaveLength(0);
  });

  it("keeps messages in their team and removes them with their Toph", () => {
    const project = useChats.getState().ensure("p");
    const chat = project.chats[0];
    const toph = useChats.getState().addToph("p", chat.id, preset("Leo", "Dev"))!;
    const message: ChatMessage = {
      id: "m1",
      chatId: chat.id,
      tophId: toph.id,
      role: "assistant",
      content: "feito",
      createdAt: 1,
    };

    useChats.getState().addMessage("p", message);
    expect(useChats.getState().byProject.p.messages).toHaveLength(1);
    expect(useChats.getState().snapshot("p")).not.toHaveProperty("messages");

    useChats.getState().removeToph("p", toph.id);
    expect(useChats.getState().byProject.p.messages).toHaveLength(0);
  });

  it("resolves a Toph to its team", () => {
    const project = useChats.getState().ensure("p");
    const chat = project.chats[0];
    const toph = useChats.getState().addToph("p", chat.id, preset("Leo", "Dev"))!;
    expect(chatForToph(useChats.getState().byProject.p, toph.id)?.id).toBe(chat.id);
    expect(tophForChat(useChats.getState().byProject.p, chat.id)?.id).toBe(toph.id);
  });

  it("hydrates a server snapshot with the multi-team model", () => {
    useChats.getState().load("p", {
      version: 4,
      chats: [{ id: "chat", name: "Equipe", description: "", createdAt: 1, updatedAt: 1 }],
      tophs: [],
      messages: [],
      activeChatId: "chat",
    });
    const project = useChats.getState().byProject.p;
    expect(project.hydrated).toBe(true);
    expect(project.chats[0].id).toBe("chat");
    expect(project.activeChatId).toBe("chat");
  });

  it("keeps shared user messages but gives a reset Toph a clean prompt", () => {
    const project = useChats.getState().ensure("p");
    const chat = project.chats[0];
    const first = useChats.getState().addToph("p", chat.id, preset("Leo", "Dev"))!;
    const second = useChats.getState().addToph("p", chat.id, preset("Nico", "Revisor"))!;
    const oldAt = Date.now() - 5_000;
    useChats.getState().addMessage("p", { id: "u1", chatId: chat.id, role: "user", content: "contexto compartilhado", createdAt: oldAt });
    useChats.getState().addMessage("p", { id: "a1", chatId: chat.id, tophId: first.id, role: "assistant", content: "resposta do primeiro", createdAt: oldAt + 1 });
    useChats.getState().addMessage("p", { id: "a2", chatId: chat.id, tophId: second.id, role: "assistant", content: "resposta do segundo", createdAt: oldAt + 2 });

    const reset = useChats.getState().resetTophSession("p", first.id)!;
    expect(reset.clearChat).toBe(false);
    expect(messagesForChat(useChats.getState().byProject.p, chat.id).map((message) => message.id)).toEqual(["u1", "a2"]);
    expect(messagesForToph(useChats.getState().byProject.p, chat.id, first.id)).toHaveLength(0);
  });
});
