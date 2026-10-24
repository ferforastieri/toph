import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Login from "./Login";

describe("Login", () => {
  it("renders the self-hosted sign-in form", () => {
    render(<Login />);
    expect(screen.getByRole("heading", { name: "Toph" })).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveValue("admin");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(screen.getByText(/self-hosted/i)).toBeInTheDocument();
  });
});
