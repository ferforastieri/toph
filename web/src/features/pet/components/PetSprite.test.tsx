import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PetSprite from "./PetSprite";
import { PET_OPTIONS } from "../store";
import { BOT_AVATARS } from "../../agents/avatars";

describe("PetSprite", () => {
  it("uses an existing generated Toph asset as the independent user avatar", () => {
    const { container } = render(<PetSprite kind="toph-prism" animate={false} />);
    expect(container.querySelector("img")).toHaveAttribute("src", `${import.meta.env.BASE_URL}tophs/toph-prism-eyeless.png?v=4`);
    expect(container.querySelector("[data-toph-eyes]")).toHaveAttribute("data-toph-eyes", "toph-prism");
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("offers every Toph visual without coupling them to agent instances", () => {
    expect(PET_OPTIONS).toHaveLength(BOT_AVATARS.length);
    expect(new Set(PET_OPTIONS.map((option) => option.kind)).size).toBe(BOT_AVATARS.length);
  });
});
