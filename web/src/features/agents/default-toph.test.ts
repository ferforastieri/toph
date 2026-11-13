import { beforeEach, describe, expect, it } from "vitest";
import { useChats } from "../conversations/store";
import { DEFAULT_TOPH, ensureSingleToph } from "./default-toph";

beforeEach(() => {
  useChats.setState({ byProject: {}, messageWrites: {} });
  useChats.getState().load("p");
});

describe("ensureSingleToph", () => {
  it("creates the fixed logo Toph when the project has none", () => {
    const { toph, removedIds } = ensureSingleToph("p");

    expect(removedIds).toEqual([]);
    expect(toph).not.toBeNull();
    expect(toph?.name).toBe("Toph");
    expect(toph?.handle).toBe("toph");
    expect(toph?.avatar).toBe("toph-logo");
    expect(useChats.getState().byProject.p.tophs).toHaveLength(1);
  });

  it("keeps one Toph, drops the extras and resets it to the fixed identity", () => {
    const first = useChats.getState().createToph("p", {
      ...DEFAULT_TOPH,
      name: "Leo",
      role: "Dev",
      prompt: "custom",
      model: "openai::gpt",
      mcpServers: ["chrome"],
      emailAccountIds: ["work"],
      tools: [],
    })!;
    const second = useChats.getState().createToph("p", { ...DEFAULT_TOPH, name: "Nico" })!;
    const solo = useChats.getState().createConversation("p", [first.id])!;
    const extra = useChats.getState().createConversation("p", [second.id])!;
    const group = useChats.getState().createConversation("p", [first.id, second.id])!;

    const { toph, removedIds } = ensureSingleToph("p");
    const project = useChats.getState().byProject.p;

    expect(removedIds).toEqual([second.id]);
    expect(project.tophs).toHaveLength(1);
    expect(project.tophs[0].id).toBe(first.id);
    expect(project.tophs[0].name).toBe("Toph");
    expect(project.tophs[0].handle).toBe("toph");
    expect(project.tophs[0].role).toBe("Toph");
    expect(project.tophs[0].prompt).toBe("");
    expect(project.tophs[0].model).toBe("");
    expect(project.tophs[0].mcpServers).toEqual([]);
    expect(project.tophs[0].emailAccountIds).toEqual([]);
    expect(project.tophs[0].tools).toEqual(["generate_image"]);
    expect(toph?.id).toBe(first.id);
    expect(project.chats.map((chat) => chat.id)).toEqual([solo.id, group.id]);
    expect(project.chats.find((chat) => chat.id === group.id)?.participantIds).toEqual([first.id]);
    expect(project.chats.some((chat) => chat.id === extra.id)).toBe(false);
  });
});
