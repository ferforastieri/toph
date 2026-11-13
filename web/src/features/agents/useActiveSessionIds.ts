import { useMemo } from "react";
import { useAgentActivity } from "./activity";

/**
 * The chats with a run in flight, fed by the project activity bridge. Hooks
 * that need the full details (messages, questions) still read the chat
 * snapshot; this one only answers "is it running?".
 */
export function useActiveSessionIds(projectId: string | undefined): ReadonlySet<string> {
  const running = useAgentActivity((state) => (projectId ? state.byProject[projectId]?.running : undefined));
  return useMemo(() => new Set(running ?? []), [running]);
}
