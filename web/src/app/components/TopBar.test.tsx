import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useApp } from "../store";
import { useSettings } from "../../features/settings/store";
import TopBar from "./TopBar";

const project = (id: string, name: string) => ({
  id,
  name,
  root: `/work/${name.toLowerCase()}`,
  color: "#FFB547",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

beforeEach(() => {
  useSettings.getState().setTheme("dark");
  useApp.setState({
    projects: [project("a", "Alpha"), project("b", "Beta")],
    openProjectIds: ["a"],
    activeProjectId: "a",
    notifications: [{
      id: "n1",
      kind: "ai",
      title: "Pronto",
      body: "Resposta concluída",
      createdAt: 1,
      read: false,
      projectId: "a",
    }],
  });
});

afterEach(cleanup);

describe("TopBar", () => {
  it("lists open projects and marks their notifications as read", () => {
    const open = vi.fn();
    render(<TopBar onOpenProject={open} onCloseProject={() => undefined} onGoHome={() => undefined} onQuickOpen={() => undefined} />);

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    expect(useApp.getState().notifications[0].read).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(useApp.getState().notifications[0].read).toBe(true);
    expect(open).toHaveBeenCalledWith("a");
  });

  it("opens the project picker with only projects that are not open", () => {
    const open = vi.fn();
    render(<TopBar onOpenProject={open} onCloseProject={() => undefined} onGoHome={() => undefined} onQuickOpen={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir projeto" }));
    const dialog = screen.getByRole("dialog");
    expect(screen.getByPlaceholderText("Pesquisar repositório")).toBeInTheDocument();
    expect(within(dialog).getByText("Beta")).toBeInTheDocument();
    expect(within(dialog).queryByText("Alpha")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByText("Beta"));
    expect(open).toHaveBeenCalledWith("b");
  });

  it("toggles the theme next to the Toph mark", () => {
    render(<TopBar onOpenProject={() => undefined} onCloseProject={() => undefined} onGoHome={() => undefined} onQuickOpen={() => undefined} />);
    const toggle = screen.getByRole("button", { name: "Ativar modo claro" });
    fireEvent.click(toggle);
    expect(useSettings.getState().theme).toBe("light");
    expect(screen.getByRole("button", { name: "Ir para o Toph" })).toBeInTheDocument();
  });

  it("keeps the workspace actions in the header", () => {
    render(<TopBar onOpenProject={() => undefined} onCloseProject={() => undefined} onGoHome={() => undefined} onQuickOpen={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Databases" }));
    expect(useApp.getState().sidebar).toBe("db");
    expect(screen.getByPlaceholderText("Buscar por nome ou conteúdo...")).toBeInTheDocument();
  });
});
