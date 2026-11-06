import { describe, expect, it } from "vitest";
import { restoredUserText } from "./history";

describe("restoredUserText", () => {
  it("preserves the first user message embedded in a priming prompt", () => {
    const prompt = "Você é Toph.\n\nSua função: ajudar.\n\nMensagem atual:\nMinha primeira mensagem\n\nResponda apenas como Toph, de forma útil e direta.";
    expect(restoredUserText(prompt)).toBe("Minha primeira mensagem");
  });
});
