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
  engine: "opencode",
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
  it("renders messages and activity in seq order without tool cards", () => {
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
    const read = screen.getByText("leu `src/a.ts`");
    const third = screen.getByText("terceira resposta");
    expect(first.compareDocumentPosition(read) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(read.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText("Beto").length).toBeGreaterThan(0);
  });

  it("renders agent replies as plain markdown, without a speech bubble", () => {
    render(
      <ChatMessages
        messages={[{ id: "reply", chatId: "chat", tophId: "toph", role: "assistant", content: "**Resposta** do agente", status: "complete", createdAt: 1, seq: 10 }]}
        tophs={[toph]}
        runs={[]}
        models={[]}
        defaultModel=""
        project={project}
        mobile={false}
      />,
    );

    const agent = screen.getByTestId("chat-agent-message");
    expect(agent).toHaveTextContent("Resposta do agente");
    expect(agent.querySelector(".md")).not.toBeNull();
    expect(agent.querySelector("[data-transcript-bubble]")).toBeNull();
  });

  it("renders the user on the right in the neutral chat bubble", () => {
    render(
      <ChatMessages
        messages={[{ id: "mine", chatId: "chat", role: "user", content: "Olá", status: "complete", createdAt: 1, seq: 10 }]}
        tophs={[toph]}
        runs={[]}
        models={[]}
        defaultModel=""
        project={project}
        mobile={false}
      />,
    );

    const mine = screen.getByTestId("chat-user-message");
    expect(mine).toHaveClass("justify-end");
    expect(mine.querySelector("p")).toHaveClass("bg-background-tertiary-default");
  });

  it("never shows a raw shell command", () => {
    const messages: NativeMessage[] = [
      { id: "shell", chatId: "chat", tophId: "toph", role: "tool", title: "shell", content: JSON.stringify({ command: "rm -rf /" }), status: "complete", createdAt: 1, seq: 10 },
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

    expect(screen.getByText("executou um comando no projeto")).toBeInTheDocument();
    expect(screen.queryByText(/rm -rf/)).not.toBeInTheDocument();
  });
});
