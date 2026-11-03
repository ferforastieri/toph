import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

afterEach(cleanup);

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

  it("shows a preview when an image is pasted", async () => {
    render(
      <AgentComposer
        value=""
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
    const image = new File([new Uint8Array([137, 80, 78, 71])], "colada.png", { type: "image/png" });
    fireEvent.paste(screen.getByRole("textbox", { name: "Mensagem para o agente" }), {
      clipboardData: { files: [image], items: [] },
    });

    expect(await screen.findByRole("img", { name: "colada.png" })).toHaveAttribute("src", expect.stringMatching(/^data:image\/png;base64,/));
  });

  it("stops the running agent without submitting the draft", () => {
    const onStop = vi.fn();
    const onSend = vi.fn();
    render(
      <AgentComposer
        value="rascunho que não deve ser enviado"
        onChange={vi.fn()}
        onSend={onSend}
        onStop={onStop}
        busy
        models={[]}
        model=""
        onModelChange={vi.fn()}
        effort=""
        efforts={[]}
        onEffortChange={vi.fn()}
        placeholder="Mensagem"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    expect(onStop).toHaveBeenCalledOnce();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("submits the message on the first click", () => {
    const onSend = vi.fn();
    render(
      <AgentComposer
        value="enviar agora"
        onChange={vi.fn()}
        onSend={onSend}
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

    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledWith("enviar agora", []);
  });

  it("recovers the latest sent message with ArrowUp", () => {
    const onChange = vi.fn();
    render(
      <AgentComposer
        value=""
        onChange={onChange}
        onSend={vi.fn()}
        busy={false}
        models={[]}
        model=""
        onModelChange={vi.fn()}
        effort=""
        efforts={[]}
        onEffortChange={vi.fn()}
        placeholder="Mensagem"
        history={["mensagem anterior"]}
      />,
    );

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Mensagem para o agente" }), { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith("mensagem anterior");
  });
});
