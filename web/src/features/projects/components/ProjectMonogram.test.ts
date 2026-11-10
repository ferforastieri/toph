import { describe, expect, it } from "vitest";
import { projectInitials } from "./ProjectMonogram";

describe("projectInitials", () => {
  it("always uses two letters for a single word", () => {
    expect(projectInitials("toph")).toBe("TO");
    expect(projectInitials("repos")).toBe("RE");
    expect(projectInitials("blog")).toBe("BL");
  });

  it("uses the initials of the first two words", () => {
    expect(projectInitials("Mimelie Painel")).toBe("MP");
    expect(projectInitials("infra-pessoal")).toBe("IP");
    expect(projectInitials("a b c")).toBe("AB");
  });

  it("keeps a single-letter name readable", () => {
    expect(projectInitials("a")).toBe("A");
    expect(projectInitials("")).toBe("?");
  });
});
