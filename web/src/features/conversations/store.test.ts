import { beforeEach, describe, expect, it } from "vitest";
import {
  activeChat,
  chatSessionTitle,
  chatDisplayName,
  chatsForToph,
  chatTophs,
  latestChatForToph,
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

const legacyToph = (id: string, chatId: string, name: string): ChatToph & { chatId: string } => ({
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

describe("useChats v5", () => {
  it("starts a project empty, with Tophs as the root", () => {
    const project = useChats.getState().ensure("p");
    expect(project.version).toBe(5);
    expect(project.chats).toHaveLength(0);
    expect(project.tophs).toHaveLength(0);
    expect(activeChat(project)).toBeNull();
  });

  it("migrates v4 teams into conversations with project Tophs", () => {
    useChats.getState().load("p", {
      version: 4,
      chats: [
        { id: "team-a", name: "Equipe", description: "time", createdAt: 2, updatedAt: 2 },
        { id: "team-b", name: "Produto", description: "", createdAt: 3, updatedAt: 3 },
      ],
      tophs: [legacyToph("t1", "team-a", "Leo"), legacyToph("t2", "team-a", "Nico"), legacyToph("t3", "team-b", "Bia")],
      messages: [
        { id: "m1", chatId: "team-a", tophId: "t1", role: "assistant", content: "oi", createdAt: 1 },
        { id: "m2", chatId: "team-b", tophId: "t3", role: "assistant", content: "olá", createdAt: 2 },
      ],
      activeChatId: "team-a",
    } as never);

    const project = useChats.getState().byProject.p;
    expect(project.version).toBe(5);
    expect(project.tophs).toHaveLength(3);
    expect(project.tophs.every((toph) => !("chatId" in toph))).toBe(true);
    expect(project.chats).toHaveLength(2);
    expect(project.chats[0]).toMatchObject({ id: "team-a", name: "", participantIds: ["t1", "t2"] });
    expect(project.chats[1]).toMatchObject({ id: "team-b", name: "Produto", participantIds: ["t3"] });
    expect(project.messages.every((message) => message.chatId.startsWith("team-"))).toBe(true);
  });

  it("preserves individual and team histories from old layouts", () => {
    useChats.getState().load("p", {
      version: 2,
      chats: [
        { id: "individual", name: "Leo", description: "", kind: "individual", createdAt: 1, updatedAt: 1 },
        { id: "team", name: "Equipe", description: "time", kind: "team", createdAt: 2, updatedAt: 2 },
      ],
      tophs: [legacyToph("t1", "individual", "Leo"), legacyToph("t2", "team", "Nico")],
      messages: [
        { id: "m1", chatId: "individual", tophId: "t1", role: "assistant", content: "oi", createdAt: 1 },
        { id: "m2", chatId: "team", tophId: "t2", role: "assistant", content: "olá", createdAt: 2 },
      ],
      activeChatId: "individual",
    } as never);

    const project = useChats.getState().byProject.p;
    expect(project.chats).toHaveLength(2);
    expect(project.chats.map((chat) => chat.participantIds)).toEqual([["t1"], ["t2"]]);
    expect(project.messages).toHaveLength(2);
  });

  it("creates project Tophs and reuses one in many tasks", () => {
    const leo = useChats.getState().createToph("p", preset("Leo", "Dev"))!;
    const nico = useChats.getState().createToph("p", preset("Nico", "Revisor"))!;
    const individual = useChats.getState().createConversation("p", [leo.id], { name: "Leo" })!;
    const group = useChats.getState().createConversation("p", [leo.id, nico.id], { description: "Juntos" })!;

    const project = useChats.getState().byProject.p;
    expect(project.tophs).toHaveLength(2);
    expect(chatsForToph(project, leo.id).map((chat) => chat.id)).toEqual([group.id, individual.id]);
    expect(latestChatForToph(project, leo.id)?.id).toBe(group.id);
    expect(chatTophs(project, group.id).map((toph) => toph.name)).toEqual(["Leo", "Nico"]);
    expect(chatDisplayName(project, group)).toBe("Leo + Nico");
  });

  it("keeps unique handles across the project", () => {
    const first = useChats.getState().createToph("p", preset("Leo", "Dev"))!;
    const second = useChats.getState().createToph("p", preset("Leo", "QA"))!;
    expect(first.handle).toBe("leo");
    expect(second.handle).toBe("leo-2");
    useChats.getState().updateToph("p", second.id, { name: "Leo" });
    expect(useChats.getState().byProject.p.tophs.find((toph) => toph.id === second.id)?.handle).toBe("leo-2");
  });

  it("adds and removes participants without deleting the Toph", () => {
    const leo = useChats.getState().createToph("p", preset("Leo", "Dev"))!;
    const nico = useChats.getState().createToph("p", preset("Nico", "Revisor"))!;
    const chat = useChats.getState().createConversation("p", [leo.id])!;
    useChats.getState().addParticipant("p", chat.id, nico.id);
    expect(chatTophs(useChats.getState().byProject.p, chat.id)).toHaveLength(2);

    useChats.getState().removeParticipant("p", chat.id, nico.id);
    const project = useChats.getState().byProject.p;
    expect(project.tophs.map((toph) => toph.id)).toContain(nico.id);
    expect(chatTophs(project, chat.id).map((toph) => toph.id)).toEqual([leo.id]);
  });

  it("deleting a conversation keeps its Tophs", () => {
    const leo = useChats.getState().createToph("p", preset("Leo", "Dev"))!;
    const chat = useChats.getState().createConversation("p", [leo.id])!;
    useChats.getState().addMessage("p", {
      id: "m1",
      chatId: chat.id,
      tophId: leo.id,
      role: "assistant",
      content: "feito",
      createdAt: 1,
    });

    useChats.getState().deleteConversation("p", chat.id);
    const project = useChats.getState().byProject.p;
    expect(project.tophs).toHaveLength(1);
    expect(project.chats).toHaveLength(0);
    expect(project.messages).toHaveLength(0);
    expect(project.activeChatId).toBeNull();
  });

  it("removing a Toph removes it from every task and deletes empty tasks", () => {
    const leo = useChats.getState().createToph("p", preset("Leo", "Dev"))!;
    const nico = useChats.getState().createToph("p", preset("Nico", "Revisor"))!;
    const individual = useChats.getState().createConversation("p", [leo.id])!;
    const group = useChats.getState().createConversation("p", [leo.id, nico.id])!;
    useChats.getState().addMessage("p", {
      id: "m1",
      chatId: individual.id,
      tophId: leo.id,
      role: "assistant",
      content: "feito",
      createdAt: 1,
    });

    useChats.getState().removeToph("p", leo.id);
    const project = useChats.getState().byProject.p;
    expect(project.tophs.map((toph) => toph.id)).toEqual([nico.id]);
    expect(project.chats.map((chat) => chat.id)).toEqual([group.id]);
    expect(chatTophs(project, group.id).map((toph) => toph.id)).toEqual([nico.id]);
    expect(project.messages).toHaveLength(0);
  });

  it("hydrates and snapshots the v5 model", () => {
    useChats.getState().load("p", {
      version: 5,
      chats: [{ id: "chat", name: "", subject: "", description: "", participantIds: [], createdAt: 1, updatedAt: 1 }],
      tophs: [],
      messages: [],
      activeChatId: "chat",
    });
    const project = useChats.getState().byProject.p;
    expect(project.hydrated).toBe(true);
    expect(project.chats[0].id).toBe("chat");

    const snapshot = useChats.getState().snapshot("p")!;
    expect(snapshot.version).toBe(5);
    expect(snapshot).not.toHaveProperty("messages");
  });

  it("titles a session by its subject instead of the Toph names", () => {
    const leo = useChats.getState().createToph("p", preset("Leo", "Dev"))!;
    const chat = useChats.getState().createConversation("p", [leo.id], { name: "Leo" })!;
    expect(chatSessionTitle(useChats.getState().byProject.p, chat)).toBe("Leo");
    useChats.getState().updateChat("p", chat.id, { subject: "Ajustar o login" });
    const updated = useChats.getState().byProject.p.chats.find((item) => item.id === chat.id)!;
    expect(chatSessionTitle(useChats.getState().byProject.p, updated)).toBe("Ajustar o login");
  });

  it("keeps an explicit session title and falls back to the description", () => {
    const leo = useChats.getState().createToph("p", preset("Leo", "Dev"))!;
    const named = useChats.getState().createConversation("p", [leo.id], { name: "Revisão do checkout" })!;
    expect(chatSessionTitle(useChats.getState().byProject.p, named)).toBe("Revisão do checkout");
    const described = useChats.getState().createConversation("p", [leo.id], { description: "Planejar a migração" })!;
    expect(chatSessionTitle(useChats.getState().byProject.p, described)).toBe("Planejar a migração");
  });

  it("keeps messages in their task and removes them with the task", () => {
    const leo = useChats.getState().createToph("p", preset("Leo", "Dev"))!;
    const chat = useChats.getState().createConversation("p", [leo.id])!;
    const message: ChatMessage = {
      id: "m1",
      chatId: chat.id,
      tophId: leo.id,
      role: "assistant",
      content: "feito",
      createdAt: 1,
    };
    useChats.getState().addMessage("p", message);
    expect(useChats.getState().byProject.p.messages).toHaveLength(1);

    useChats.getState().deleteConversation("p", chat.id);
    expect(useChats.getState().byProject.p.messages).toHaveLength(0);
  });
});
