import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import BotStudioTab from "./BotStudioTab";
import { TOPH_PRESETS, useChats } from "../store";
import { useAI } from "../../providers/store";
import { useTophDrafts } from "../../agents/drafts";
import { agentApi, engineApi } from "../../agents/api";
import type { Project } from "../../../shared/api";

const native = vi.hoisted(() => ({
  messages: [] as unknown[], drafts: [], runs: [], approvals: [], questions: [] as unknown[], hasMore: false, cursor: null,
  error: "", setError: vi.fn(), loading: false, older: vi.fn(), refresh: vi.fn(), compacting: false, busy: false,
  usage: { inputTokens: 100, outputTokens: 20, cachedTokens: 40, calls: 1, byAgent: [] },
}));
vi.mock("../../agents/useAgentChat", () => ({ useAgentChat: () => native }));


const project: Project = { id: "project", name: "Project", root: "/project", color: "#FFB547", createdAt: "", updatedAt: "" };
let firstId: string;
let memberId: string;
let chatId: string;
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  useChats.setState({ byProject: {}, messageWrites: {} });
  useChats.getState().load(project.id);
  firstId = useChats.getState().createToph(project.id, { ...TOPH_PRESETS[0], name: "Fernando", model: "go::deepseek", agentMode: "build" })!.id;
  memberId = useChats.getState().createToph(project.id, { ...TOPH_PRESETS[1], name: "Beto", model: "openai::review", agentMode: "build" })!.id;
  chatId = useChats.getState().createConversation(project.id, [firstId, memberId], { description: "Preservar os contratos da tarefa" })!.id;
  useAI.setState({ config: null, error: "", models: [{ id: "go::deepseek", label: "DeepSeek", provider: "custom" }, { id: "openai::gpt", label: "GPT", provider: "openai" }, { id: "openai::review", label: "Review", provider: "openai" }] });
  useTophDrafts.setState({ drafts: {} });
  native.refresh.mockResolvedValue(undefined);
  vi.spyOn(engineApi, "limits").mockResolvedValue({
    ok: true,
    data: {
      workspace: { id: "org", name: "Personal", usageURL: "https://opencode.ai/console/org/activity" },
      go: {
        rolling: { percent: 0, limited: false, resetsAt: 1794120416000 },
        weekly: { percent: 55, limited: false, resetsAt: 1794182400000 },
        monthly: { percent: 27, limited: false, resetsAt: 1796349235000 },
      },
    },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Toph chat controls", () => {
  it.each([false, true])("uses the compact chat composer with only the plan limit (mobile=%s)", (mobile) => {
    render(<BotStudioTab project={project} conversationId={chatId} mobile={mobile} />);
    expect(screen.getByRole("button", { name: "Consumo do plano" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Modelo e esforço" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modo do agente" })).not.toBeInTheDocument();
    expect(screen.queryByText("Harness Toph · execução no servidor")).not.toBeInTheDocument();
  });

  it("sends each Toph's own settings", async () => {
    const start = vi.spyOn(agentApi, "start").mockResolvedValue({ id: "run", sessionId: "session", agentId: firstId, chatId, state: "queued", error: "", createdAt: 1 });
    useChats.getState().updateToph(project.id, firstId, { agentMode: "plan" });
    render(<BotStudioTab project={project} conversationId={chatId} />);
    const members = useChats.getState().byProject[project.id].tophs;
    expect(members.find((a) => a.id === firstId)?.agentMode).toBe("plan");
    expect(members.find((a) => a.id === memberId)).toMatchObject({ model: "openai::review", agentMode: "build" });
    fireEvent.change(screen.getByRole("textbox", { name: "Mensagem para o agente" }), { target: { value: "Revise o projeto" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(start).toHaveBeenCalledOnce());
    const input = start.mock.calls[0][1];
    expect(input.agentId).toBe("router");
    expect(input.chatDescription).toBe("Preservar os contratos da tarefa");
    expect(input.agents.find((a) => a.id === firstId)).toMatchObject({ agentMode: "plan", model: "go::deepseek" });
    expect(input.agents.find((a) => a.id === memberId)).toMatchObject({ agentMode: "build", model: "openai::review" });
  });

  it("shows only the conversation, without a chat header", () => {
    render(<BotStudioTab project={project} conversationId={chatId} />);

    expect(screen.queryByText("Equipe", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configurar Beto" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Mensagem para o agente" })).toBeVisible();
  });

  it("opens the task participants from the composer", async () => {
    render(<BotStudioTab project={project} conversationId={chatId} />);
    fireEvent.click(screen.getByRole("button", { name: "Participantes da conversa" }));
    const dialog = await screen.findByRole("dialog", { name: "Conversa" });
    expect(within(dialog).getByText("Fernando")).toBeVisible();
    expect(within(dialog).getByText("Beto")).toBeVisible();
  });

  it("shows how much of the plan limit is left", async () => {
    render(<BotStudioTab project={project} conversationId={chatId} />);
    fireEvent.click(screen.getByRole("button", { name: "Consumo do plano" }));
    const dialog = await screen.findByRole("dialog", { name: "Consumo do plano" });
    expect(within(dialog).getByText("Semana")).toBeVisible();
    expect(within(dialog).getByText("45% restante")).toBeVisible();
    expect(within(dialog).getByText("Mês")).toBeVisible();
    expect(within(dialog).getByText("73% restante")).toBeVisible();
    expect(within(dialog).getByText(/Personal/)).toBeVisible();
  });

  it("renders a blocking question inside the conversation and answers it", async () => {
    const answer = vi.spyOn(agentApi, "answer").mockResolvedValue({ ok: true });
    native.questions = [{
      id: "call-question", runId: "run", agentId: firstId, name: "ask_user", arguments: "{}",
      questions: [{ header: "Escopo", question: "Qual escopo devo usar?", options: [{ label: "Tudo" }, { label: "Só o backend" }] }],
    }];
    render(<BotStudioTab project={project} conversationId={chatId} />);
    expect(screen.getByText("O agente precisa da sua resposta")).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: /Só o backend/ }));
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    await waitFor(() => expect(answer).toHaveBeenCalledOnce());
    expect(answer.mock.calls[0][1]).toBe("call-question");
    expect(answer.mock.calls[0][2]).toContain("Só o backend");
    native.questions = [];
  });

  it("no longer renders the standalone Apresentação panel", () => {
    render(<BotStudioTab project={project} conversationId={chatId} />);
    expect(screen.queryByText("Apresentação")).not.toBeInTheDocument();
    expect(screen.queryByText("O que o agente quer mostrar")).not.toBeInTheDocument();
  });
});
