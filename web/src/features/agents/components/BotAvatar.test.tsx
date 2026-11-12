import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BotAvatar from "./BotAvatar";

describe("BotAvatar", () => {
  it("uses the logo's Toph for every agent", () => {
    const { container } = render(<BotAvatar bot={{ name: "Toph", color: "#7FD4E8", avatar: "toph-logo" }} size={40} />);
    expect(container.querySelector("img")).toHaveAttribute("src", `${import.meta.env.BASE_URL}tophs/toph-logo-eyeless.png?v=5`);
    expect(container.querySelector("[data-avatar-color]")).toHaveStyle({ backgroundColor: "#7FD4E8" });
  });

  it("renders independent eye layers and leaves the body still", () => {
    const { container } = render(<BotAvatar bot={{ name: "Toph", color: "#7FD4E8", avatar: "toph-logo" }} size={40} />);
    const eyes = container.querySelectorAll("[data-toph-eyes]");
    expect(eyes).toHaveLength(1);
    expect(eyes[0]).toHaveAttribute("data-toph-eyes", "toph-logo");
    expect(eyes[0].querySelector("img")).toHaveAttribute("src", `${import.meta.env.BASE_URL}tophs/toph-logo-eyes.png?v=1`);
    expect(container.querySelector("img")?.parentElement).not.toHaveAttribute("style");
  });
});
