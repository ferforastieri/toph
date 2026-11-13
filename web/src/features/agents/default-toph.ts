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

function fixedTophPatch(toph: ChatToph): Partial<ChatToph> {
  const patch: Partial<ChatToph> = {};
  if (toph.name !== DEFAULT_TOPH.name || toph.handle !== "toph") patch.name = DEFAULT_TOPH.name;
  if (toph.role !== DEFAULT_TOPH.role) patch.role = DEFAULT_TOPH.role;
  if (toph.description !== DEFAULT_TOPH.description) patch.description = DEFAULT_TOPH.description;
  if (toph.personality !== DEFAULT_TOPH.personality) patch.personality = DEFAULT_TOPH.personality;
  if (toph.prompt !== DEFAULT_TOPH.prompt) patch.prompt = DEFAULT_TOPH.prompt;
  if (toph.model !== "") patch.model = "";
  if (toph.effort !== "") patch.effort = "";
  if (toph.mcpServers.length > 0) patch.mcpServers = [];
  if (toph.emailAccountIds.length > 0) patch.emailAccountIds = [];
  if (toph.tools.length !== 1 || toph.tools[0] !== "generate_image") patch.tools = [...(DEFAULT_TOPH.tools ?? [])];
  if (toph.color !== DEFAULT_TOPH.color) patch.color = DEFAULT_TOPH.color;
  if (toph.avatar !== DEFAULT_TOPH.avatar) patch.avatar = DEFAULT_TOPH.avatar;
  return patch;
}

/**
 * Keeps exactly one Toph per project: the logo's mascot. Extra Tophs and the
 * tasks that belonged only to them are removed, and the kept Toph is reset to
 * the fixed identity so the global model, MCP and email settings apply.
 */
export function ensureSingleToph(projectId: string): { toph: ChatToph | null; removedIds: string[] } {
  const project = useChats.getState().ensure(projectId);
  if (!project.hydrated) return { toph: project.tophs[0] ?? null, removedIds: [] };

  const keep = project.tophs.find((toph) => toph.avatar === DEFAULT_TOPH.avatar) ?? project.tophs[0] ?? null;
  if (!keep) return { toph: ensureToph(projectId), removedIds: [] };

  const removedIds = project.tophs.filter((toph) => toph.id !== keep.id).map((toph) => toph.id);
  for (const id of removedIds) useChats.getState().removeToph(projectId, id);

  const patch = fixedTophPatch(keep);
  if (Object.keys(patch).length > 0) useChats.getState().updateToph(projectId, keep.id, patch);

  return {
    toph: useChats.getState().byProject[projectId]?.tophs.find((toph) => toph.id === keep.id) ?? null,
    removedIds,
  };
}
