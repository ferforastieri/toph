import { beforeEach, describe, expect, it } from "vitest";
import { activeChat, chatCoordinator, chatTophs, messagesForChat, messagesForToph, useChats, type ChatMessage, type TophPreset } from "./chats";

const preset = (name: string, role: string): TophPreset => ({
  name,
  role,
  description: "",
  personality: "",
  prompt: "",
  color: "#FFB547",
  avatar: "toph-core",
});

beforeEach(() => {
  useChats.setState({ byProject: {}, messageWrites: {} });
});

describe("useChats", () => {
  it("creates one individual and one team chat per project", () => {
    const project = useChats.getState().ensure("p");
    expect(project.chats).toHaveLength(2);
    expect(project.chats.filter((chat) => chat.kind === "individual")).toHaveLength(1);
    expect(project.chats.filter((chat) => chat.kind === "team")).toHaveLength(1);

    const individual = project.chats.find((chat) => chat.kind === "individual")!;
    const team = project.chats.find((chat) => chat.kind === "team")!;
    expect(chatTophs(project, individual.id)).toHaveLength(0);
    expect(chatTophs(project, team.id)).toHaveLength(0);
    expect(activeChat(project)?.kind).toBe("individual");
  });

  it("keeps exactly one Toph in the individual chat", () => {
    const project = useChats.getState().ensure("p");
    const individual = project.chats.find((chat) => chat.kind === "individual")!;
    expect(useChats.getState().addToph("p", individual.id, preset("Leo", "Dev"))).not.toBeNull();
    expect(useChats.getState().addToph("p", individual.id, preset("Nico", "Revisor"))).toBeNull();
  });

  it("keeps messages in the chat and removes them with their Toph", () => {
    const project = useChats.getState().ensure("p");
    const team = project.chats.find((chat) => chat.kind === "team")!;
    const toph = useChats.getState().addToph("p", team.id, preset("Leo", "Dev"))!;
    const message: ChatMessage = {
      id: "m1",
      chatId: team.id,
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

  it("lets the user create Tophs with any role", () => {
    const project = useChats.getState().ensure("p");
    const team = project.chats.find((chat) => chat.kind === "team")!;
    expect(useChats.getState().addToph("p", team.id, preset("Leo", "Dev"))).not.toBeNull();
    expect(useChats.getState().addToph("p", team.id, preset("Outro", "Dev"))).not.toBeNull();
  });

  it("marks a project loaded from the server as hydrated", () => {
    useChats.getState().load("p", {
      version: 2,
      chats: [],
      tophs: [],
      messages: [],
      activeChatId: null,
    });
    expect(useChats.getState().byProject.p.hydrated).toBe(true);
    expect(useChats.getState().byProject.p.chats).toHaveLength(2);
  });

  it("replaces the coordinator when the current one leaves", () => {
    const project = useChats.getState().ensure("p");
    const team = project.chats.find((chat) => chat.kind === "team")!;
    useChats.getState().addToph("p", team.id, preset("Leo", "Dev"));
    useChats.getState().addToph("p", team.id, preset("Nico", "Revisor"));
    const coordinator = chatCoordinator(chatTophs(useChats.getState().byProject.p, team.id))!;

    useChats.getState().removeToph("p", coordinator.id);

    const members = chatTophs(useChats.getState().byProject.p, team.id);
    expect(members.length).toBeGreaterThan(0);
    expect(members.filter((member) => member.coordinator)).toHaveLength(1);
  });

  it("clears user messages and hides stale history after a new individual session", () => {
    const project = useChats.getState().ensure("p");
    const individual = project.chats.find((chat) => chat.kind === "individual")!;
    const toph = useChats.getState().addToph("p", individual.id, preset("Leo", "Dev"))!;
    const oldAt = Date.now() - 5_000;
    useChats.getState().addMessage("p", { id: "u1", chatId: individual.id, role: "user", content: "pergunta antiga", createdAt: oldAt });
    useChats.getState().addMessage("p", { id: "a1", chatId: individual.id, tophId: toph.id, role: "assistant", content: "resposta antiga", createdAt: oldAt + 1 });

    const reset = useChats.getState().resetTophSession("p", toph.id)!;
    expect(reset.clearChat).toBe(true);
    expect(messagesForChat(useChats.getState().byProject.p, individual.id)).toHaveLength(0);

    // A late history load (or a slow server delete) must not leak rows from
    // the previous session back into the fresh conversation.
    useChats.getState().mergeMessages("p", [
      { id: "u1", chatId: individual.id, role: "user", content: "pergunta antiga", createdAt: oldAt },
      { id: "a1", chatId: individual.id, tophId: toph.id, role: "assistant", content: "resposta antiga", createdAt: oldAt + 1 },
    ]);
    expect(messagesForChat(useChats.getState().byProject.p, individual.id)).toHaveLength(0);

    useChats.getState().addMessage("p", { id: "u2", chatId: individual.id, role: "user", content: "pergunta nova", createdAt: Date.now() });
    expect(messagesForChat(useChats.getState().byProject.p, individual.id).map((message) => message.id)).toEqual(["u2"]);
  });

  it("keeps shared team messages but gives the reset Toph a clean prompt", () => {
    const project = useChats.getState().ensure("p");
    const team = project.chats.find((chat) => chat.kind === "team")!;
    const first = useChats.getState().addToph("p", team.id, preset("Leo", "Dev"))!;
    const second = useChats.getState().addToph("p", team.id, preset("Nico", "Revisor"))!;
    const oldAt = Date.now() - 5_000;
    useChats.getState().addMessage("p", { id: "u1", chatId: team.id, role: "user", content: "contexto compartilhado", createdAt: oldAt });
    useChats.getState().addMessage("p", { id: "a1", chatId: team.id, tophId: first.id, role: "assistant", content: "resposta do primeiro", createdAt: oldAt + 1 });
    useChats.getState().addMessage("p", { id: "a2", chatId: team.id, tophId: second.id, role: "assistant", content: "resposta do segundo", createdAt: oldAt + 2 });

    const reset = useChats.getState().resetTophSession("p", first.id)!;
    expect(reset.clearChat).toBe(false);
    expect(messagesForChat(useChats.getState().byProject.p, team.id).map((message) => message.id)).toEqual(["u1", "a2"]);
    expect(messagesForToph(useChats.getState().byProject.p, team.id, first.id)).toHaveLength(0);
  });
});
