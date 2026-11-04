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
  it("opens the Toph profile when the row is clicked", () => {
    const onOpen = vi.fn();
    render(<TophRow toph={toph} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: /^Nova/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
