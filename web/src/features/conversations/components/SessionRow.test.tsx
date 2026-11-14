import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SessionRow from "./SessionRow";

afterEach(cleanup);

describe("SessionRow", () => {
  it("shows the running state in the row and for screen readers", () => {
    render(<SessionRow title="Revisar login" activityAt={Date.now()} running onOpen={() => undefined} />);

    expect(screen.getByRole("button", { name: "Revisar login. Rodando agora" })).toBeInTheDocument();
  });

  it("marks an unread answer", () => {
    render(<SessionRow title="Ajustar o build" activityAt={Date.now()} unread onOpen={() => undefined} />);

    expect(screen.getByLabelText("Resposta não lida")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajustar o build. Resposta não lida" })).toBeInTheDocument();
  });
});
