import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../../shared/api";
import { useApp, type AppNotification } from "../../../app/store";
import { useAgentActivity } from "../activity";
import { useChats } from "../../conversations/store";
import { DEFAULT_TOPH } from "../default-toph";
import BotsSidebar from "./BotsSidebar";

const project: Project = {
  id: "project",
  name: "Projeto",
  root: "/project",
  color: "#FFB547",
  createdAt: "2026-11-13T10:00:00.000Z",
  updatedAt: "2026-11-13T10:00:00.000Z",
};

beforeEach(() => {
  useChats.setState({ byProject: {}, messageWrites: {} });
  useApp.setState({ notifications: [] });
  useChats.getState().load(project.id);
  const toph = useChats.getState().createToph(project.id, DEFAULT_TOPH)!;
  const older = useChats.getState().createConversation(project.id, [toph.id], { name: toph.name })!;
  useChats.getState().updateChat(project.id, older.id, { subject: "Ajustar o build" });
  useChats.getState().addMessage(project.id, {
    id: "m-1",
    chatId: older.id,
    role: "assistant",
    content: "",
    status: "running",
    createdAt: Date.now(),
  });
  const newer = useChats.getState().createConversation(project.id, [toph.id], { name: toph.name })!;
  useChats.getState().updateChat(project.id, newer.id, { subject: "Revisar login" });
  const notification: AppNotification = {
    id: "n-1",
    kind: "ai",
    title: "Toph respondeu",
    body: "Pronto",
    createdAt: Date.now(),
    read: false,
    projectId: project.id,
    chatId: newer.id,
  };
  useApp.setState({ notifications: [notification] });
  useAgentActivity.setState({
    byProject: {
      [project.id]: {
        running: [older.id],
        questions: [],
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BotsSidebar", () => {
  it("lists every session and keeps only the new-task action in the header", async () => {
    render(<BotsSidebar project={project} />);

    expect(screen.getByRole("button", { name: "Nova tarefa" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir sessão" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Sessões" })).toBeInTheDocument();
    expect(screen.getByText("Ajustar o build")).toBeInTheDocument();
    expect(screen.getByText("Revisar login")).toBeInTheDocument();
    expect(screen.getByLabelText("Resposta não lida")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ajustar o build\. Rodando agora/ })).toBeInTheDocument();
    expect(screen.queryByText("Configurar Toph")).not.toBeInTheDocument();
    expect(screen.queryByText("Conversas do Toph")).not.toBeInTheDocument();
  });
});
