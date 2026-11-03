import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AgentTranscript from "./AgentTranscript";

afterEach(cleanup);

describe("AgentTranscript artifacts", () => {
  it("shows an expanded real diff without an extra tool-group card", () => {
    render(
      <AgentTranscript
        streaming={false}
        toolsExpanded
        messages={[{
          id: "edit-1",
          role: "tool",
          title: "Tool · edit",
          text: JSON.stringify({ path: "src/app.ts", oldString: "const before = 1;", newString: "const after = 2;" }),
          status: "complete",
          createdAt: 1,
        }]}
      />,
    );

    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("const before = 1;")).toBeInTheDocument();
    expect(screen.getByText("const after = 2;")).toBeInTheDocument();
    expect(screen.queryByText("Used")).not.toBeInTheDocument();
  });

  it("renders image file parts returned by an agent tool", () => {
    const uri = "data:image/png;base64,YWJj";
    render(
      <AgentTranscript
        streaming={false}
        toolsExpanded
        messages={[{
          id: "image-1",
          role: "tool",
          title: "Tool · browser.screenshot",
          text: "{}",
          detail: JSON.stringify([{ type: "file", uri, mime: "image/png", name: "screen.png" }]),
          status: "complete",
          createdAt: 1,
        }]}
      />,
    );

    expect(screen.getByRole("img", { name: "screen.png" })).toHaveAttribute("src", uri);
  });

  it("renders question tools as an answerable form", () => {
    const answer = vi.fn();
    render(
      <AgentTranscript
        streaming={false}
        toolsExpanded
        onQuestion={answer}
        messages={[{
          id: "question-1",
          role: "tool",
          title: "Tool · question",
          text: JSON.stringify({ questions: [{ header: "Direção", question: "Qual caminho?", options: [{ label: "Primeiro", description: "Opção recomendada" }, { label: "Segundo" }], multiple: false }] }),
          detail: "{}",
          status: "running",
          createdAt: 1,
        }]}
      />,
    );

    fireEvent.click(screen.getByText("Primeiro"));
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    expect(answer).toHaveBeenCalledWith("question-1", expect.stringContaining("Direção: Primeiro"));
    expect(screen.queryByText("{}")).not.toBeInTheDocument();
  });

  it("does not offer an answer for an interrupted question", () => {
    render(
      <AgentTranscript
        streaming={false}
        toolsExpanded
        messages={[{
          id: "question-error",
          role: "tool",
          title: "Tool · question",
          text: JSON.stringify({ questions: [{ header: "Direção", question: "Qual caminho?", options: [{ label: "Primeiro" }] }] }),
          status: "error",
          createdAt: 1,
        }]}
      />,
    );

    expect(screen.getByText("Esta pergunta foi encerrada antes de receber uma resposta.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Responder" })).not.toBeInTheDocument();
  });
});
