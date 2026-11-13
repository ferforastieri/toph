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
  it("fuses voice and send into a single action button", () => {
    const { rerender } = render(
      <AgentComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        busy={false}
        placeholder="Mensagem"
      />,
    );

    expect(screen.getByRole("button", { name: "Gravar áudio" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Enviar" })).not.toBeInTheDocument();

    rerender(
      <AgentComposer
        value="Olá"
        onChange={vi.fn()}
        onSend={vi.fn()}
        busy={false}
        placeholder="Mensagem"
      />,
    );

    const send = screen.getByRole("button", { name: "Enviar" });
    expect(send).toHaveClass("ac-btn--primary");
    expect(screen.queryByRole("button", { name: "Gravar áudio" })).not.toBeInTheDocument();
  });

  it("keeps the fused action button last, after attachments", () => {
    render(
      <AgentComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        busy={false}
        placeholder="Mensagem"
      />,
    );

    const attach = screen.getByRole("button", { name: "Anexar arquivo" });
    const action = screen.getByRole("button", { name: "Gravar áudio" });
    expect(attach.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("fuses the stop action into the same button while a run is active", () => {
    const onStop = vi.fn();
    const onSend = vi.fn();
    render(
      <AgentComposer
        value=""
        onChange={vi.fn()}
        onSend={onSend}
        onStop={onStop}
        busy
        placeholder="Mensagem"
      />,
    );

    expect(screen.queryByRole("button", { name: "Enviar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    expect(onStop).toHaveBeenCalledOnce();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("turns the stop button into queue-send once there is a draft", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    render(
      <AgentComposer
        value="rascunho"
        onChange={vi.fn()}
        onSend={onSend}
        onStop={onStop}
        busy
        placeholder="Mensagem"
      />,
    );

    expect(screen.queryByRole("button", { name: "Parar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enfileirar mensagem" }));
    expect(onSend).toHaveBeenCalledWith("rascunho", []);
    expect(onStop).not.toHaveBeenCalled();
  });

  it("queues the next message on Enter while a run is active", () => {
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

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Mensagem para o agente" }), { key: "Enter" });
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
