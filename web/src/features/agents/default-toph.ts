import { useChats, type ChatToph, type TophPreset } from "../conversations/store";

/** The one Toph a project has: the logo's mascot, ready for its first task. */
export const DEFAULT_TOPH: TophPreset = {
  name: "Toph",
  role: "Toph",
  description: "",
  personality: "",
  prompt: "",
  color: "#FFB547",
  avatar: "toph-logo",
  agentMode: "build",
  permissionMode: "yolo",
  mcpServers: [],
  emailAccountIds: [],
  tools: ["generate_image"],
  language: "auto",
};

/** The project's Toph, created with the defaults when the project has none. */
export function ensureToph(projectId: string): ChatToph | null {
  const project = useChats.getState().ensure(projectId);
  const existing = project.tophs[0];
  if (existing) return existing;
  return useChats.getState().createToph(projectId, DEFAULT_TOPH);
}
