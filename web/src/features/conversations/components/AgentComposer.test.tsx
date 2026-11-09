import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
        placeholder="Mensagem"
      />,
    );

    const audio = screen.getByRole("button", { name: "Gravar áudio" });
    const send = screen.getByRole("button", { name: "Enviar" });
    expect(audio).toBeVisible();
    expect(send).toHaveClass("bg-button-primary");
  });

  it("keeps the microphone next to the send button", () => {
    render(
      <AgentComposer
        value="Olá"
        onChange={vi.fn()}
        onSend={vi.fn()}
        busy={false}
        placeholder="Mensagem"
      />,
    );

    const attach = screen.getByRole("button", { name: "Anexar arquivo" });
    const audio = screen.getByRole("button", { name: "Gravar áudio" });
    const send = screen.getByRole("button", { name: "Enviar" });
    expect(attach.compareDocumentPosition(audio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(audio.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows a preview when an image is pasted", async () => {
    render(
      <AgentComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        busy={false}
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
        placeholder="Mensagem"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    expect(onStop).toHaveBeenCalledOnce();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("queues the next message while a run is active", () => {
    const onSend = vi.fn();
    render(
      <AgentComposer
        value="enviar mesmo executando"
        onChange={vi.fn()}
        onSend={onSend}
        onStop={vi.fn()}
        busy
        placeholder="Mensagem"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enfileirar mensagem" }));
    expect(onSend).toHaveBeenCalledWith("enviar mesmo executando", []);
  });

  it("sends a dropped image together with the message", async () => {
    const onSend = vi.fn();
    render(
      <AgentComposer
        value="descreva a imagem"
        onChange={vi.fn()}
        onSend={onSend}
        busy={false}
        placeholder="Mensagem"
      />,
    );
    const image = new File([new Uint8Array([137, 80, 78, 71])], "drop.png", { type: "image/png" });
    fireEvent.drop(screen.getByRole("textbox", { name: "Mensagem para o agente" }).closest("form")!, {
      dataTransfer: { files: [image] },
    });

    expect(await screen.findByRole("img", { name: "drop.png" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledOnce());
    expect(onSend.mock.calls[0][1][0]).toMatchObject({ name: "drop.png", mime: "image/png", size: 4 });
  });

  it("submits the message on the first click", () => {
    const onSend = vi.fn();
    render(
      <AgentComposer
        value="enviar agora"
        onChange={vi.fn()}
        onSend={onSend}
        busy={false}
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
        placeholder="Mensagem"
        history={["mensagem anterior"]}
      />,
    );

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Mensagem para o agente" }), { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith("mensagem anterior");
  });
});
