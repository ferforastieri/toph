import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PetSprite from "./PetSprite";
import { PET_OPTIONS } from "../pet";

describe("PetSprite", () => {
  it("uses an existing generated Toph asset as the independent user avatar", () => {
    const { container } = render(<PetSprite kind="toph-prism" animate={false} />);
    expect(container.querySelector("img")).toHaveAttribute("src", `${import.meta.env.BASE_URL}tophs/toph-prism.png`);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("offers all twenty Toph visuals without coupling them to agent instances", () => {
    expect(PET_OPTIONS).toHaveLength(20);
    expect(new Set(PET_OPTIONS.map((option) => option.kind)).size).toBe(20);
  });
});
