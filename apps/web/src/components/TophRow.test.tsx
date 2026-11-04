import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatToph } from "../chats";
import TophRow from "./TophRow";

afterEach(cleanup);

const toph = {
  id: "toph-nova",
  name: "Nova",
  role: "Produto",
  color: "#e83e8c",
  avatar: "toph-nova",
  coordinator: false,
} as ChatToph;

describe("TophRow", () => {
  it("opens the Toph profile from the row and sessions from the side action", () => {
    const onOpen = vi.fn();
    const onSessions = vi.fn();
    render(<TophRow toph={toph} onOpen={onOpen} onSessions={onSessions} />);

    fireEvent.click(screen.getByRole("button", { name: /^Nova/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sessões de Nova" }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onSessions).toHaveBeenCalledTimes(1);
  });
});
