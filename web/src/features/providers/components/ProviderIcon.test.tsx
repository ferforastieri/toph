import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProviderIcon from "./ProviderIcon";

describe("ProviderIcon", () => {
  it("renders an OpenAI provider mark", () => {
    const { container } = render(<ProviderIcon provider="openai" />);
    const path = container.querySelector("path");
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 24 24");
    expect(path?.getAttribute("d")).toBeTruthy();
  });

  it("keeps the brand colors for DeepSeek and Claude", () => {
    const { container: deepseek } = render(<ProviderIcon provider="deepseek" />);
    expect(deepseek.querySelector("path")).toHaveAttribute("fill", "#4D6BFE");

    const { container: claude } = render(<ProviderIcon provider="claude" />);
    expect(claude.querySelector("path")).toHaveAttribute("fill", "#D97757");
  });

  it("uses the OpenCode mark for OpenCode Go connections", () => {
    const { container } = render(<ProviderIcon provider="OpenCode Go" />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });
});
