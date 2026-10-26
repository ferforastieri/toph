import { useEffect, useRef } from "react";

export interface ProjectEvent {
  type: string;
  projectId: string;
  path?: string;
  at: number;
}

export const PROJECT_EVENT = "toph:project-event";

/**
 * Subscribes a component to live project changes. The single WebSocket is
 * owned by Workbench; components only listen to its in-app event stream.
 */
export function useProjectEvents(
  projectId: string | null | undefined,
  types: string[],
  handler: (event: ProjectEvent) => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const typeKey = types.join(",");

  useEffect(() => {
    if (!projectId) return;
    const allowed = typeKey ? typeKey.split(",") : [];
    const listener = (raw: Event) => {
      const event = (raw as CustomEvent<ProjectEvent>).detail;
      if (!event || event.projectId !== projectId) return;
      if (event.type !== "sync" && allowed.length > 0 && !allowed.includes(event.type)) {
        return;
      }
      handlerRef.current(event);
    };
    window.addEventListener(PROJECT_EVENT, listener);
    return () => window.removeEventListener(PROJECT_EVENT, listener);
  }, [projectId, typeKey]);
}
