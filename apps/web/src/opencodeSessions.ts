import { OpenCode } from "@opencode/client";
import { openCodeBase } from "./api";

export interface OpenCodeSessionSummary {
  id: string;
  title?: string;
  time?: {
    created?: number;
    updated?: number;
    idle?: number;
  };
}

export async function listOpenCodeSessions(
  projectRoot: string,
  limit = 50,
): Promise<OpenCodeSessionSummary[]> {
  const client = OpenCode.make({ baseUrl: openCodeBase() });
  const response = await client.session.list({
    directory: projectRoot,
    limit,
    order: "desc",
  } as never);
  return response.data as OpenCodeSessionSummary[];
}
