import { describe, expect, it } from "vitest";
import { modelDisplay, modelGroup } from "./store";

describe("provider connection labels", () => {
  it("shows the real connection name instead of the protocol", () => {
    const model = { id: "default::deepseek-v4.1-flash", label: "deepseek-v4.1-flash", provider: "custom", connectionLabel: "OpenCode Go" };
    expect(modelGroup(model)).toBe("OpenCode Go");
    expect(modelDisplay(model)).toBe("OpenCode Go · deepseek-v4.1-flash");
  });

  it("falls back to the protocol only when no connection name exists", () => {
    expect(modelDisplay({ id: "openai::gpt-6-astra", label: "gpt-6-astra", provider: "openai" })).toBe("OpenAI · gpt-6-astra");
  });
});
