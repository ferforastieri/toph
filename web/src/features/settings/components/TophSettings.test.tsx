import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import TophSettings from "./TophSettings";
import { useApp } from "../../../app/store";
import { defaultWorkspaceFeatures, useSettings } from "../store";
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
vi.mock("./HarnessSettings", () => ({
  default: () => <div><span data-testid="engine-settings">Motores</span><span data-testid="connections-hub">Modelos e MCP</span></div>,
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
    workspaceFeatures: defaultWorkspaceFeatures,
    update: vi.fn(),
  });
  vi.spyOn(api, "version").mockResolvedValue({ name: "toph", version: "0.85.0", buildId: "test-build" });
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

    fireEvent.click(screen.getByRole("button", { name: "Harness" }));
    expect(await screen.findByTestId("engine-settings")).toBeInTheDocument();
    expect(await screen.findByTestId("connections-hub")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Email" }));
    expect(await screen.findByTestId("email-panel")).toBeInTheDocument();
  });
});
