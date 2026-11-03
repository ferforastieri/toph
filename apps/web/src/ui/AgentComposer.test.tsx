import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AgentComposer } from "./AgentComposer";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  globalThis.ResizeObserver = class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("AgentComposer actions", () => {
  it("uses BoardUI buttons for audio and send", () => {
    render(
      <AgentComposer
        value="Olá"
        onChange={vi.fn()}
        onSend={vi.fn()}
        busy={false}
        models={[]}
        model=""
        onModelChange={vi.fn()}
        effort=""
        efforts={[]}
        onEffortChange={vi.fn()}
        placeholder="Mensagem"
      />,
    );

    const audio = screen.getByRole("button", { name: "Gravar áudio" });
    const send = screen.getByRole("button", { name: "Enviar" });
    expect(audio).toHaveClass("border-border-button-default");
    expect(send).toHaveClass("bg-button-primary");
  });
});
