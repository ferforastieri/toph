import { useEffect, useMemo } from "react";
import { api, type WorkspaceLayout } from "../../../shared/api";
import { useChats } from "../../conversations/store";
import type { Tab } from "../../../app/store";

/** Editor text/dirty state belongs to the editor, not to the layout payload. */
export function useLayoutTabs(tabs: Tab[]): unknown[] {
  const serialized = JSON.stringify(tabs.map(({ content: _content, hash: _hash, dirty: _dirty, autoRun: _autoRun, ...layout }) => layout));
  return useMemo(() => JSON.parse(serialized) as unknown[], [serialized]);
}

export function useWorkspacePersistence(
  projectId: string | null,
  ready: boolean,
  layout: WorkspaceLayout,
  epoch: number,
): void {
  const { tabs, activeTabId, sidebar, terminalOpen } = layout;
  useEffect(() => {
    if (!projectId || !ready) return;
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void api.saveLayout(projectId, {
          tabs, activeTabId, sidebar, terminalOpen,
          chats: useChats.getState().snapshot(projectId),
        }).catch(() => undefined);
      }, 500);
    };
    schedule();
    const unsubscribe = useChats.subscribe((state, previous) => {
      const current = state.byProject[projectId];
      const before = previous.byProject[projectId];
      if (current === before || (current?.chat === before?.chat
        && current?.tophs === before?.tophs)) return;
      schedule();
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [projectId, ready, tabs, activeTabId, sidebar, terminalOpen, epoch]);
}
