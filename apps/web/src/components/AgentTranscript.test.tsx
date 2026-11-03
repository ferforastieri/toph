import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AgentTranscript from "./AgentTranscript";

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
});
