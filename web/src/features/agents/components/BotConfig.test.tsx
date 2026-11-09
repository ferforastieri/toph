import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import BotConfig from "./BotConfig";
import { TOPH_PRESETS, useChats } from "../../conversations/store";
import { useAI } from "../../providers/store";
import { agentApi } from "../api";
import { skillApi } from "../../skills/api";
import { api } from "../../../shared/api";

const projectId = "project";
const projectRoot = "/project";

function Harness({ id }: { id: string }) {
  const bot = useChats((state) => state.byProject[projectId].tophs.find((item) => item.id === id));
  if (!bot) return null;
  return <BotConfig projectId={projectId} projectRoot={projectRoot} bot={bot} />;
}

let tophId = "";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  useChats.setState({ byProject: {}, messageWrites: {} });
  useChats.getState().load(projectId);
  tophId = useChats.getState().createToph(projectId, {
    ...TOPH_PRESETS[0],
    name: "Toph",
    model: "openai::gpt",
    tools: [],
    mcpServers: [],
    emailAccountIds: [],
  })!.id;
  useAI.setState({
    config: null,
    models: [
      { id: "openai::gpt", label: "GPT", provider: "openai" },
      { id: "openai::review", label: "Review", provider: "openai" },
    ],
  });
  vi.spyOn(agentApi, "mcpServers").mockResolvedValue([
    { id: "chrome", name: "Chrome DevTools", transport: "stdio", url: "", command: [], hasToken: false },
  ]);
  vi.spyOn(skillApi, "list").mockResolvedValue([]);
  vi.spyOn(api, "emailAccounts").mockResolvedValue([
    {
      id: "work",
      name: "Trabalho",
      email: "work@example.com",
      imapHost: "",
      imapPort: 993,
      imapUser: "",
      imapTls: true,
      smtpHost: "",
      smtpPort: 587,
      smtpUser: "",
      smtpTls: true,
      createdAt: "",
    },
  ]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function currentBot() {
  return useChats.getState().byProject[projectId].tophs.find((item) => item.id === tophId)!;
}

describe("BotConfig", () => {
  it("uses the project accordion/chevron instead of tab sections", async () => {
    render(<Harness id={tophId} />);

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByText("Ferramentas deste Toph")).not.toBeInTheDocument();
    expect(screen.queryByText("Modelo e provedor deste Toph")).not.toBeInTheDocument();

    const capabilities = screen.getByRole("button", { name: /Capacidades/ });
    expect(capabilities).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(capabilities);
    await waitFor(() => expect(capabilities).toHaveAttribute("aria-expanded", "false"));
  });

  it("shows model selection and lets the Toph switch models", async () => {
    render(<Harness id={tophId} />);

    const trigger = screen.getByRole("button", { name: "Modelo e esforço" });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Modelo e esforço" });
    const review = await within(dialog).findByText("Review", { exact: true });
    fireEvent.click(review.closest("button")!);

    await waitFor(() => expect(currentBot().model).toBe("openai::review"));
  });

  it("selects capabilities without exposing connection setup", async () => {
    render(<Harness id={tophId} />);

    expect(await screen.findByRole("checkbox", { name: /Gerar imagens/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Gerar imagens/ }));
    await waitFor(() => expect(currentBot().tools).toContain("generate_image"));

    fireEvent.click(await screen.findByRole("checkbox", { name: "Chrome DevTools" }));
    await waitFor(() => expect(currentBot().mcpServers).toContain("chrome"));

    fireEvent.click(await screen.findByRole("checkbox", { name: /Trabalho.*work@example.com/ }));
    await waitFor(() => expect(currentBot().emailAccountIds).toContain("work"));

    expect(screen.queryByText(/Conectar|API key|Adicionar MCP|Nova conta/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Configurações → Conexões/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Configurações → Email/).length).toBeGreaterThan(0);
  });
});
