import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SessionRow from "./SessionRow";

afterEach(cleanup);

describe("SessionRow", () => {
  it("shows the running state in the row and for screen readers", () => {
    render(<SessionRow title="Revisar login" activityAt={Date.now()} messageCount={3} running onOpen={() => undefined} />);

    expect(screen.getByText("Rodando agora")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revisar login. Rodando agora" })).toBeInTheDocument();
  });

  it("shows the message count and marks an unread answer", () => {
    render(<SessionRow title="Ajustar o build" activityAt={Date.now()} messageCount={2} unread onOpen={() => undefined} />);

    expect(screen.getByText("2 mensagens")).toBeInTheDocument();
    expect(screen.getByLabelText("Resposta não lida")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajustar o build. 2 mensagens. Resposta não lida" })).toBeInTheDocument();
  });
});
