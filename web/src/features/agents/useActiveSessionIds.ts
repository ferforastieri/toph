import { useEffect, useState } from "react";
import { agentApi, isActive } from "./api";

/**
 * The chats with a run in flight. The project's event stream says when one
 * starts or ends; a slow poll repairs anything a dropped stream lost.
 */
export function useActiveSessionIds(projectId: string | undefined): ReadonlySet<string> {
  const [active, setActive] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (!projectId) return;
    let stopped = false;
    let stream: EventSource | undefined;
    const refresh = async () => {
      try {
        const runs = await agentApi.activeRuns(projectId);
        if (stopped) return;
        setActive(new Set(runs.filter(isActive).map((run) => run.chatId)));
      } catch {
        // Offline: keep the last answer; the next event or poll tries again.
      }
    };
    void refresh();
    if (typeof EventSource !== "undefined") {
      stream = new EventSource(agentApi.events(projectId), { withCredentials: true });
      stream.addEventListener("resync", () => { void refresh(); });
      stream.onerror = () => { void refresh(); };
      stream.addEventListener("agent", (raw) => {
        if (stopped) return;
        try {
          const event = JSON.parse((raw as MessageEvent).data) as { type?: string };
          if (event.type === "run") void refresh();
        } catch {
          // A malformed event doesn't change what the last snapshot said.
        }
      });
    }
    const poll = window.setInterval(() => { void refresh(); }, 15_000);
    return () => {
      stopped = true;
      stream?.close();
      window.clearInterval(poll);
    };
  }, [projectId]);

  return active;
}
