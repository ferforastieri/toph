import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import BotStudioTab from "./BotStudioTab";
import { TOPH_PRESETS, useChats } from "../store";
import { useAI } from "../../providers/store";
import { useTophDrafts } from "../../agents/drafts";
import { agentApi } from "../../agents/api";
import type { Project } from "../../../shared/api";

const native = vi.hoisted(() => ({
  messages: [] as unknown[], drafts: [], runs: [], approvals: [], questions: [] as unknown[], hasMore: false, cursor: null,
  error: "", setError: vi.fn(), loading: false, older: vi.fn(), refresh: vi.fn(), compacting: false, busy: false,
  usage: { inputTokens: 100, outputTokens: 20, cachedTokens: 40, calls: 1, byAgent: [], contextTokens: 3000, contextBudget: 12000 },
}));
vi.mock("../../agents/useAgentChat", () => ({ useAgentChat: () => native }));
vi.mock("../../agents/components/BotConfig", () => ({ default: ({ bot }: { bot: { name: string } }) => <div data-testid="toph-config">Configuração de {bot.name}</div> }));
vi.mock("./TophSessionsSheet", () => ({ default: ({ toph }: { toph: { name: string } }) => <div data-testid="toph-sessions">Sessões de {toph.name}</div> }));

const project: Project = { id: "project", name: "Project", root: "/project", color: "#FFB547", createdAt: "", updatedAt: "" };
let coordinatorId: string;
let memberId: string;
let chatId: string;
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  useChats.setState({ byProject: {}, messageWrites: {} });
  useChats.getState().load(project.id);
  chatId = useChats.getState().byProject[project.id].chats.find((chat) => chat.kind === "team")!.id;
  useChats.getState().setActiveChat(project.id, chatId);
  useChats.getState().updateChat(project.id, chatId, { description: "Preservar os contratos da equipe" });
  coordinatorId = useChats.getState().addToph(project.id, chatId, { ...TOPH_PRESETS[0], name: "Fernando", coordinator: true, model: "go::deepseek", agentMode: "build" })!.id;
  memberId = useChats.getState().addToph(project.id, chatId, { ...TOPH_PRESETS[1], name: "Beto", coordinator: false, model: "openai::review", agentMode: "build" })!.id;
  useAI.setState({ config: null, error: "", models: [{ id: "go::deepseek", label: "DeepSeek", provider: "custom" }, { id: "openai::gpt", label: "GPT", provider: "openai" }, { id: "openai::review", label: "Review", provider: "openai" }] });
  useTophDrafts.setState({ drafts: {} });
  native.refresh.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Toph chat controls", () => {
  it.each([false, true])("shows the model, mode and chat usage controls (mobile=%s)", (mobile) => {
    render(<BotStudioTab project={project} mobile={mobile} />);
    expect(screen.getByRole("button", { name: "Modelo e esforço" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Modo do agente" })).toHaveTextContent("Build");
    expect(screen.getByRole("button", { name: "Consumo do modelo" })).toBeVisible();
    expect(screen.queryByText("Harness Toph · execução no servidor")).not.toBeInTheDocument();
  });

  it("changes only the coordinator mode and sends each Toph's own settings", async () => {
    const start = vi.spyOn(agentApi, "start").mockResolvedValue({ id: "run", sessionId: "session", agentId: coordinatorId, chatId, state: "queued", error: "", createdAt: 1 });
    render(<BotStudioTab project={project} />);
    fireEvent.click(screen.getByRole("button", { name: "Modo do agente" }));
    fireEvent.click(await screen.findByRole("button", { name: "Plano" }));
    expect(screen.getByRole("button", { name: "Modo do agente" })).toHaveTextContent("Plano");
    const members = useChats.getState().byProject[project.id].tophs;
    expect(members.find((a) => a.id === coordinatorId)?.agentMode).toBe("plan");
    expect(members.find((a) => a.id === memberId)).toMatchObject({ model: "openai::review", agentMode: "build" });
    fireEvent.change(screen.getByRole("textbox", { name: "Mensagem para o agente" }), { target: { value: "Revise o projeto" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(start).toHaveBeenCalledOnce());
    const input = start.mock.calls[0][1];
    expect(input.agentId).toBe(coordinatorId);
    expect(input.chatDescription).toBe("Preservar os contratos da equipe");
    expect(input.agents.find((a) => a.id === coordinatorId)).toMatchObject({ agentMode: "plan", model: "go::deepseek" });
    expect(input.agents.find((a) => a.id === memberId)).toMatchObject({ agentMode: "build", model: "openai::review", coordinator: false });
  });

  it("changes the coordinator model without overwriting a teammate's model", async () => {
    render(<BotStudioTab project={project} />);
    fireEvent.click(screen.getByRole("button", { name: "Modelo e esforço" }));
    const dialog = await screen.findByRole("dialog", { name: "Modelo e esforço" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^OpenAI/ }));
    fireEvent.click(within(dialog).getByText("GPT", { exact: true }).closest("button")!);
    const agents = useChats.getState().byProject[project.id].tophs;
    expect(agents.find((a) => a.id === coordinatorId)?.model).toBe("openai::gpt");
    expect(agents.find((a) => a.id === memberId)?.model).toBe("openai::review");
  });

  it("uses the Toph identity as the chat title instead of the individual container", () => {
    const individual = useChats.getState().createChat(project.id, "Toph");
    useChats.getState().addToph(project.id, individual.id, { ...TOPH_PRESETS[1], name: "Leo", role: "Dev" });
    useChats.getState().setActiveChat(project.id, individual.id);

    render(<BotStudioTab project={project} />);

    expect(screen.getByText("Leo")).toBeVisible();
    expect(screen.queryByText("Conversa individual")).not.toBeInTheDocument();
    expect(screen.queryByText("Individual")).not.toBeInTheDocument();
  });

  it("opens the selected Toph from the sidebar action event", async () => {
    render(<BotStudioTab project={project} />);
    act(() => window.dispatchEvent(new CustomEvent("toph:toph-action", { detail: { action: "config", tophId: memberId } })));
    expect(await screen.findByTestId("toph-config")).toHaveTextContent("Configuração de Beto");
  });

  it("shows chat totals and the breakdown for individual Tophs", async () => {
    render(<BotStudioTab project={project} />);
    fireEvent.click(screen.getByRole("button", { name: "Consumo do modelo" }));
    const dialog = await screen.findByRole("dialog", { name: "Consumo do modelo" });
    expect(within(dialog).getByText("Por Toph")).toBeVisible();
    expect(within(dialog).getByText("Fernando · coordenador")).toBeVisible();
    expect(within(dialog).getByText("Beto")).toBeVisible();
    expect(within(dialog).getByText("100")).toBeVisible();
  });

  it("renders a blocking question inside the conversation and answers it", async () => {
    const answer = vi.spyOn(agentApi, "answer").mockResolvedValue({ ok: true });
    native.questions = [{
      id: "call-question", runId: "run", agentId: coordinatorId, name: "ask_user", arguments: "{}",
      questions: [{ header: "Escopo", question: "Qual escopo devo usar?", options: [{ label: "Tudo" }, { label: "Só o backend" }] }],
    }];
    render(<BotStudioTab project={project} />);
    expect(screen.getByText("O agente precisa da sua resposta")).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: /Só o backend/ }));
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    await waitFor(() => expect(answer).toHaveBeenCalledOnce());
    expect(answer.mock.calls[0][1]).toBe("call-question");
    expect(answer.mock.calls[0][2]).toContain("Só o backend");
    native.questions = [];
  });

  it("no longer renders the standalone Apresentação panel", () => {
    render(<BotStudioTab project={project} />);
    expect(screen.queryByText("Apresentação")).not.toBeInTheDocument();
    expect(screen.queryByText("O que o agente quer mostrar")).not.toBeInTheDocument();
  });
});
