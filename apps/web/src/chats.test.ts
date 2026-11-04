import { beforeEach, describe, expect, it } from "vitest";
import { chatCoordinator, chatTophs, useChats, type ChatMessage, type TophPreset } from "./chats";

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
  it("creates chats with their own Tophs and keeps one coordinator", () => {
    const projectId = "p";
    const chat = useChats.getState().createChat(projectId, "checkout", "pagamentos");
    const first = useChats.getState().addToph(projectId, chat.id, preset("Leo", "Dev"));
    const second = useChats.getState().addToph(projectId, chat.id, preset("Nico", "Revisor"));

    expect(first?.coordinator).toBe(true);
    expect(second?.coordinator).toBe(false);

    useChats.getState().updateToph(projectId, second!.id, { coordinator: true });
    const state = useChats.getState().byProject[projectId];
    const members = chatTophs(state, chat.id);
    expect(members.filter((toph) => toph.coordinator)).toHaveLength(1);
    expect(chatCoordinator(members)?.name).toBe("Nico");
  });

  it("keeps messages in the chat and removes them with their Toph", () => {
    const projectId = "p";
    const chat = useChats.getState().createChat(projectId, "checkout");
    const toph = useChats.getState().addToph(projectId, chat.id, preset("Leo", "Dev"))!;
    const message: ChatMessage = {
      id: "m1",
      chatId: chat.id,
      tophId: toph.id,
      role: "assistant",
      content: "feito",
      createdAt: 1,
    };

    useChats.getState().addMessage(projectId, message);
    expect(useChats.getState().byProject[projectId].messages).toHaveLength(1);
    expect(useChats.getState().snapshot(projectId)).not.toHaveProperty("messages");

    useChats.getState().removeToph(projectId, toph.id);
    expect(useChats.getState().byProject[projectId].messages).toHaveLength(0);
  });

  it("keeps a single Toph per role in the chat", () => {
    const projectId = "p";
    const chat = useChats.getState().createChat(projectId, "checkout");
    expect(useChats.getState().addToph(projectId, chat.id, preset("Leo", "Dev"))).not.toBeNull();
    expect(useChats.getState().addToph(projectId, chat.id, preset("Outro", "Dev"))).toBeNull();
  });

  it("marks a project loaded from the server as hydrated", () => {
    useChats.getState().load("p", {
      version: 1,
      chats: [],
      tophs: [],
      messages: [],
      activeChatId: null,
    });
    expect(useChats.getState().byProject.p.hydrated).toBe(true);
  });

  it("replaces the coordinator when the current one leaves", () => {
    const projectId = "p";
    const chat = useChats.getState().createChat(projectId, "checkout");
    const first = useChats.getState().addToph(projectId, chat.id, preset("Leo", "Dev"))!;
    useChats.getState().addToph(projectId, chat.id, preset("Nico", "Revisor"));

    useChats.getState().removeToph(projectId, first.id);

    const members = chatTophs(useChats.getState().byProject[projectId], chat.id);
    expect(members).toHaveLength(1);
    expect(members[0].coordinator).toBe(true);
  });
});
