import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Project } from "../../../shared/api";
import type { ChatToph } from "../store";
import type { NativeMessage } from "../../agents/api";
import ChatMessages from "./ChatMessages";

const project: Project = { id: "p", name: "Projeto", root: "/projeto", color: "#FFB547", createdAt: "", updatedAt: "" };
const toph: ChatToph = {
  id: "toph",
  chatId: "chat",
  name: "Beto",
  handle: "beto",
  role: "Dev",
  description: "",
  personality: "",
  prompt: "",
  model: "openai::gpt",
  effort: "",
  agentMode: "build",
  permissionMode: "yolo",
  mcpServers: [],
  skills: [],
  emailAccountIds: [],
  tools: [],
  language: "auto",
  color: "#8FB5F5",
  avatar: "toph-forge",
  notifications: true,
  coordinator: true,
  createdAt: 1,
};

afterEach(cleanup);

describe("ChatMessages timeline", () => {
  it("renders messages and tool steps in seq order instead of grouped under a thinking card", () => {
    const messages: NativeMessage[] = [
      { id: "third", chatId: "chat", tophId: "toph", role: "assistant", content: "terceira resposta", status: "complete", createdAt: 3, seq: 30 },
      { id: "first", chatId: "chat", tophId: "toph", role: "assistant", content: "primeira resposta", status: "complete", createdAt: 1, seq: 10 },
      { id: "tool", chatId: "chat", tophId: "toph", role: "tool", title: "read_file", content: JSON.stringify({ path: "src/a.ts" }), status: "complete", createdAt: 2, seq: 20 },
    ];

    render(
      <ChatMessages
        messages={messages}
        tophs={[toph]}
        runs={[]}
        models={[]}
        defaultModel=""
        project={project}
        mobile={false}
      />,
    );

    const first = screen.getByText("primeira resposta");
    const read = screen.getByText("Read");
    const third = screen.getByText("terceira resposta");
    expect(first.compareDocumentPosition(read) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(read.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Beto")).toBeInTheDocument();
  });
});
