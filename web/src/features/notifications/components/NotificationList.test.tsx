import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useApp } from "../../../app/store";
import type { Project } from "../../../shared/api";
import NotificationList from "./NotificationList";

const project: Project = { id: "p", name: "Projeto Toph", root: "/projeto", color: "#FFB547", createdAt: "", updatedAt: "" };

beforeEach(() => {
  useApp.setState({
    projects: [project],
    notifications: [{
      id: "n1",
      kind: "ai",
      title: "Beto",
      body: "Terminei a implementação da tela de Tophs.",
      createdAt: Date.now() - 60_000,
      read: false,
      projectId: "p",
      projectName: "Projeto Toph",
      botId: "toph-1",
      botName: "Beto",
      botRole: "Dev",
      chatId: "chat-1",
    }],
  });
});

afterEach(() => {
  cleanup();
  useApp.setState({ notifications: [], projects: [] });
});

describe("NotificationList", () => {
  it("shows the project, Toph and response content, then opens the chat", () => {
    const open = vi.fn();
    window.addEventListener("toph:open-bot", open as EventListener);
    render(<NotificationList />);

    expect(screen.getByText("Beto")).toBeInTheDocument();
    expect(screen.getByText("Projeto Toph")).toBeInTheDocument();
    expect(screen.getByText("Terminei a implementação da tela de Tophs.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Beto/ }));
    expect(useApp.getState().notifications[0].read).toBe(true);
    expect(open).toHaveBeenCalledOnce();
    const detail = (open.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toMatchObject({ projectId: "p", botId: "toph-1", chatId: "chat-1" });
    window.removeEventListener("toph:open-bot", open as EventListener);
  });
});
