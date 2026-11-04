import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BotAvatar from "./BotAvatar";

describe("BotAvatar", () => {
  it("uses the generated image asset for the selected Toph", () => {
    const { container } = render(<BotAvatar bot={{ name: "Toph Prisma", color: "#7FD4E8", avatar: "toph-prism" }} size={40} />);
    expect(container.querySelector("img")).toHaveAttribute("src", `${import.meta.env.BASE_URL}tophs/toph-prism.png`);
    expect(container.querySelector("[data-avatar-color]")).toHaveStyle({ backgroundColor: "#7FD4E8" });
  });

  it("renders independent eye layers and leaves the body still", () => {
    const { container } = render(<BotAvatar bot={{ name: "Toph Prisma", color: "#7FD4E8", avatar: "toph-prism" }} size={40} />);
    expect(container.querySelectorAll("[data-toph-eye]")).toHaveLength(2);
    expect(container.querySelector("img")?.parentElement).not.toHaveAttribute("style");
  });
});
