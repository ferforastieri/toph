import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Login from "./Login";

afterEach(cleanup);

describe("Login", () => {
  it("renders the self-hosted sign-in form", () => {
    render(<Login />);
    expect(screen.getByRole("heading", { name: "Toph" })).toBeInTheDocument();
    expect(screen.getByLabelText("Usuário")).toHaveValue("admin");
    expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
    expect(screen.getByText(/self-hosted/i)).toBeInTheDocument();
  });

  it("returns to the desktop launcher when the client offers it", () => {
    const onOpenLauncher = vi.fn();
    render(<Login onOpenLauncher={onOpenLauncher} />);

    fireEvent.click(screen.getByRole("button", { name: "Voltar ao launcher" }));
    expect(onOpenLauncher).toHaveBeenCalledOnce();
  });

  it("hides the launcher shortcut outside the desktop client", () => {
    render(<Login />);
    expect(screen.queryByRole("button", { name: "Voltar ao launcher" })).not.toBeInTheDocument();
  });
});
