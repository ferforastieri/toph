import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MiniBot } from "../bots";
import TophRow from "./TophRow";

afterEach(cleanup);

const bot = {
  id: "bot-nova",
  name: "Nova",
  role: "Especialista",
  color: "#e83e8c",
  avatar: "toph-nova",
  coordinator: false,
} as MiniBot;

describe("TophRow", () => {
  it("keeps settings and sessions on each Toph row", () => {
    const onSelect = vi.fn();
    const onConfig = vi.fn();
    const onSessions = vi.fn();
    render(<TophRow bot={bot} active onSelect={onSelect} onConfig={onConfig} onSessions={onSessions} />);

    const select = screen.getByRole("button", { name: /^Nova/ });
    expect(select).toHaveAttribute("aria-current", "true");

    fireEvent.click(select);
    fireEvent.click(screen.getByRole("button", { name: "Configurar Nova" }));
    fireEvent.click(screen.getByRole("button", { name: "Sessões de Nova" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onConfig).toHaveBeenCalledTimes(1);
    expect(onSessions).toHaveBeenCalledTimes(1);
  });
});
