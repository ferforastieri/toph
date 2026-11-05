import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AgentActivity from "./AgentActivity";

afterEach(cleanup);

describe("AgentActivity", () => {
  it("shows the current tool and the live steps of the turn", () => {
    render(
      <AgentActivity
        state="working"
        startedAt={Date.now() - 5_000}
        messages={[
          {
            id: "reason-1",
            role: "reasoning",
            title: "Thought",
            text: "Vou ler o arquivo e rodar os testes.",
            status: "complete",
            createdAt: 1,
          },
          {
            id: "tool-1",
            role: "tool",
            title: "Tool · bash",
            text: JSON.stringify({ command: "npm test" }),
            status: "running",
            createdAt: 2,
          },
        ]}
      />,
    );

    expect(screen.getByText("Trabalhando")).toBeInTheDocument();
    expect(screen.getAllByText("Shell").length).toBeGreaterThan(0);
    expect(screen.getAllByText("npm test").length).toBeGreaterThan(0);
    expect(screen.getByText("Thought")).toBeInTheDocument();
  });

  it("falls back to the latest reasoning line while waiting for the first tool", () => {
    render(
      <AgentActivity
        state="thinking"
        startedAt={Date.now() - 2_000}
        messages={[{
          id: "reason-2",
          role: "reasoning",
          title: "Thought",
          text: "Primeira linha.\nAnalisando o repositório agora.",
          status: "running",
          createdAt: 1,
        }]}
      />,
    );

    expect(screen.getByText("Pensando")).toBeInTheDocument();
    expect(screen.getByText("Analisando o repositório agora.")).toBeInTheDocument();
  });
});
