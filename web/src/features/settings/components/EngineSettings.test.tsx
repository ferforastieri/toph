import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EngineSettings from "./EngineSettings";
import { engineApi, type EngineInfo } from "../../agents/api";

const opencode: EngineInfo = {
  id: "opencode",
  label: "OpenCode",
  binary: "opencode",
  installed: true,
  path: "/home/me/.opencode/bin/opencode",
  login: "opencode auth login",
  install: "curl -fsSL https://opencode.ai/v2/install | bash",
  site: "https://opencode.ai",
  supported: true,
};
const claude: EngineInfo = {
  id: "claude",
  label: "Claude Code",
  binary: "claude",
  installed: false,
  login: "claude auth login",
  install: "curl -fsSL https://claude.ai/install.sh | bash",
  site: "https://code.claude.com",
  supported: false,
};

beforeEach(() => {
  vi.spyOn(engineApi, "list").mockResolvedValue([opencode, claude]);
  vi.spyOn(engineApi, "test").mockResolvedValue({
    ok: true,
    installed: true,
    path: opencode.path,
    version: "opencode v2.2.5",
    message: "OpenCode respondeu e listou 42 modelos.",
    modelCount: 42,
  });
  vi.spyOn(engineApi, "install").mockResolvedValue({
    ok: true,
    installed: true,
    already: false,
    path: "/home/me/.local/bin/claude",
    output: "installed",
    message: "Claude Code instalado.",
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EngineSettings", () => {
  it("shows installed and missing CLIs with an install command", async () => {
    render(<EngineSettings />);
    expect(await screen.findByText("OpenCode")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("instalado")).toBeInTheDocument();
    expect(screen.getByText("não instalado")).toBeInTheDocument();
    expect(screen.getByText(claude.install)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Instalar/ })).toBeInTheDocument();
  });

  it("tests an installed CLI and shows the model count", async () => {
    render(<EngineSettings />);
    await screen.findByText("OpenCode");
    fireEvent.click(screen.getAllByRole("button", { name: "Testar" })[0]);
    expect(await screen.findByText(/42 modelos/)).toBeInTheDocument();
    expect(engineApi.test).toHaveBeenCalledWith("opencode");
  });

  it("installs a missing CLI and refreshes its status", async () => {
    render(<EngineSettings />);
    await screen.findByText("Claude Code");
    fireEvent.click(screen.getByRole("button", { name: /Instalar/ }));
    await waitFor(() => expect(engineApi.install).toHaveBeenCalledWith("claude"));
    expect(await screen.findByText("installed")).toBeInTheDocument();
  });
});
