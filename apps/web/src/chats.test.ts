import { beforeEach, describe, expect, it } from "vitest";
import { activeChat, chatCoordinator, chatTophs, useChats, type ChatMessage, type TophPreset } from "./chats";

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
    expect(chatTophs(project, individual.id)).toHaveLength(1);
    expect(chatTophs(project, individual.id)[0].coordinator).toBe(true);
    expect(chatTophs(project, team.id).length).toBeGreaterThanOrEqual(2);
    expect(chatTophs(project, team.id).filter((toph) => toph.coordinator)).toHaveLength(1);
    expect(activeChat(project)?.kind).toBe("individual");
  });

  it("keeps exactly one Toph in the individual chat", () => {
    const project = useChats.getState().ensure("p");
    const individual = project.chats.find((chat) => chat.kind === "individual")!;
    expect(useChats.getState().addToph("p", individual.id, preset("Leo", "Dev"))).toBeNull();
  });

  it("keeps messages in the chat and removes them with their Toph", () => {
    const project = useChats.getState().ensure("p");
    const team = project.chats.find((chat) => chat.kind === "team")!;
    const toph = chatTophs(project, team.id).find((member) => !member.coordinator)!;
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

  it("keeps a single Toph per role in the team", () => {
    const project = useChats.getState().ensure("p");
    const team = project.chats.find((chat) => chat.kind === "team")!;
    expect(useChats.getState().addToph("p", team.id, preset("Leo", "Dev"))).not.toBeNull();
    expect(useChats.getState().addToph("p", team.id, preset("Outro", "Dev"))).toBeNull();
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
    const coordinator = chatCoordinator(chatTophs(project, team.id))!;

    useChats.getState().removeToph("p", coordinator.id);

    const members = chatTophs(useChats.getState().byProject.p, team.id);
    expect(members.length).toBeGreaterThan(0);
    expect(members.filter((member) => member.coordinator)).toHaveLength(1);
  });
});
