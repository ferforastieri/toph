import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import TophSettings from "./TophSettings";
import { useApp } from "../../../app/store";
import { useSettings } from "../store";
import { usePet } from "../../pet/store";
import { api } from "../../../shared/api";

vi.mock("../../providers/components/ConnectionsHub", () => ({
  default: () => <div data-testid="connections-hub">Conexões de modelos e MCP</div>,
}));
vi.mock("../../integrations/components/EmailPanel", () => ({
  default: () => <div data-testid="email-panel">Contas de email</div>,
}));
vi.mock("./WorkspaceSettings", () => ({
  default: () => <div data-testid="workspace-settings">Workspace</div>,
}));
vi.mock("../../pet/components/PetSprite", () => ({
  default: () => <span data-testid="pet-sprite">pet</span>,
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
});

beforeEach(() => {
  useApp.setState({ setUser: vi.fn(), notify: vi.fn() });
  useSettings.setState({
    projectBar: "header",
    workspaceFeatures: {
      tabs: true,
      terminal: true,
      files: true,
      sourceControl: true,
      databases: true,
      bots: true,
      debug: true,
      webApps: true,
    },
    update: vi.fn(),
  });
  usePet.setState({ kind: "toph", commits: 0, choose: vi.fn() } as never);
  vi.spyOn(api, "version").mockResolvedValue({ version: "0.85.0", buildId: "test-build" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TophSettings", () => {
  it("keeps model/MCP connections and email in Settings", async () => {
    render(<TophSettings user={{ id: 1, username: "admin", createdAt: "" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir configurações" }));
    expect(await screen.findByText("Configurações")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Conexões" }));
    expect(await screen.findByTestId("connections-hub")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Email" }));
    expect(await screen.findByTestId("email-panel")).toBeInTheDocument();
  });
});
