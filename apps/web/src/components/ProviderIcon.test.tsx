import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProviderIcon from "./ProviderIcon";

describe("ProviderIcon", () => {
  it("renders the official OpenCode mark", () => {
    const { container } = render(<ProviderIcon provider="opencode-go" />);
    const path = container.querySelector("path");
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 24 24");
    expect(path).toHaveAttribute("d", "M16 6H8v12h8V6zm4 16H4V2h16v20z");
  });

  it("keeps the brand colors for DeepSeek and Claude", () => {
    const { container: deepseek } = render(<ProviderIcon provider="deepseek" />);
    expect(deepseek.querySelector("path")).toHaveAttribute("fill", "#4D6BFE");

    const { container: claude } = render(<ProviderIcon provider="claude" />);
    expect(claude.querySelector("path")).toHaveAttribute("fill", "#D97757");
  });
});
