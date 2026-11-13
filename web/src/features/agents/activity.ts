import { useEffect } from "react";
import { create } from "zustand";
import { agentApi, isActive, type PendingQuestion } from "./api";
import { playQuestionSound } from "../conversations/sound";

interface ProjectActivity {
  /** Chat ids with a run queued, running or waiting for an answer. */
  running: string[];
  /** ask_user calls waiting for the user, across every chat of the project. */
  questions: PendingQuestion[];
}

interface AgentActivityState {
  byProject: Record<string, ProjectActivity>;
  setRunning: (projectId: string, chats: string[]) => void;
  setQuestions: (projectId: string, questions: PendingQuestion[]) => void;
  /** Returns true when the question was not known yet. */
  addQuestion: (projectId: string, question: PendingQuestion) => boolean;
  removeQuestion: (projectId: string, id: string) => void;
}

const EMPTY: ProjectActivity = { running: [], questions: [] };

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export const useAgentActivity = create<AgentActivityState>((set, get) => ({
  byProject: {},

  setRunning: (projectId, chats) =>
    set((state) => {
      const current = state.byProject[projectId] ?? EMPTY;
      if (sameList(current.running, chats)) return state;
      return { byProject: { ...state.byProject, [projectId]: { ...current, running: chats } } };
    }),

  setQuestions: (projectId, questions) =>
    set((state) => {
      const current = state.byProject[projectId] ?? EMPTY;
      if (sameList(current.questions.map((item) => item.id), questions.map((item) => item.id))) return state;
      return { byProject: { ...state.byProject, [projectId]: { ...current, questions } } };
    }),

  addQuestion: (projectId, question) => {
    const current = get().byProject[projectId] ?? EMPTY;
    if (current.questions.some((item) => item.id === question.id)) return false;
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: { ...(state.byProject[projectId] ?? EMPTY), questions: [...current.questions, question] },
      },
    }));
    return true;
  },

  removeQuestion: (projectId, id) =>
    set((state) => {
      const current = state.byProject[projectId];
      if (!current || !current.questions.some((item) => item.id === id)) return state;
      return {
        byProject: {
          ...state.byProject,
          [projectId]: { ...current, questions: current.questions.filter((item) => item.id !== id) },
        },
      };
    }),
}));

export function useProjectRunning(projectId: string | undefined): boolean {
  return useAgentActivity((state) => Boolean(projectId && (state.byProject[projectId]?.running.length ?? 0) > 0));
}

export function useChatRunning(projectId: string | undefined, chatId: string | undefined): boolean {
  return useAgentActivity((state) => Boolean(projectId && chatId && state.byProject[projectId]?.running.includes(chatId)));
}

export function useProjectQuestion(projectId: string | undefined): PendingQuestion | null {
  return useAgentActivity((state) => (projectId ? state.byProject[projectId]?.questions[0] ?? null : null));
}

// A refresh plus an event can discover the same question; one alert is enough.
let lastQuestionSound = 0;
function alertQuestion(): void {
  const now = Date.now();
  if (now - lastQuestionSound < 1_200) return;
  lastQuestionSound = now;
  playQuestionSound();
}

/**
 * Watches every open project: active runs feed the running dots and ask_user
 * calls become the question badge and its own sound. One event stream per
 * project, plus a slow poll that repairs dropped streams.
 */
export function useAgentActivityBridge(projectIds: string[]): void {
  const key = projectIds.filter(Boolean).join("|");
  useEffect(() => {
    const ids = key ? key.split("|") : [];
    const cleanups = ids.map(watchProject);
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [key]);
}

function watchProject(projectId: string): () => void {
  let stopped = false;
  let primed = false;
  let refreshing = false;
  let questionEpoch = 0;
  let stream: EventSource | undefined;

  const refresh = async () => {
    if (refreshing || stopped) return;
    refreshing = true;
    const epoch = questionEpoch;
    try {
      const runs = await agentApi.activeRuns(projectId).catch(() => null);
      const questions = await agentApi.pendingQuestions(projectId).catch(() => null);
      if (stopped) return;
      const store = useAgentActivity.getState();
      if (runs) {
        const running = [...new Set(runs.filter(isActive).map((run) => run.chatId))];
        store.setRunning(projectId, running);
      }
      // An approval event that landed while this request was in flight is
      // newer than the snapshot; keep it and let the next poll reconcile.
      if (questions && epoch === questionEpoch) {
        const known = new Set((store.byProject[projectId]?.questions ?? []).map((item) => item.id));
        const fresh = questions.filter((item) => !known.has(item.id));
        store.setQuestions(projectId, questions);
        if (primed && fresh.length > 0) alertQuestion();
        primed = true;
      }
    } catch {
      // Offline: keep the last state; the next event or poll tries again.
    } finally {
      refreshing = false;
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
        const event = JSON.parse((raw as MessageEvent).data) as { chatId?: string; type?: string; data?: unknown };
        if (event.type === "run") {
          void refresh();
          return;
        }
        if (event.type === "approval" && (event.data as { kind?: string } | null)?.kind === "question") {
          const data = event.data as { id?: string; runId?: string; agentId?: string };
          if (!data?.id || !event.chatId) return;
          questionEpoch += 1;
          const added = useAgentActivity.getState().addQuestion(projectId, {
            id: data.id,
            chatId: event.chatId,
            runId: data.runId ?? "",
            agentId: data.agentId ?? "",
          });
          if (added) alertQuestion();
          return;
        }
        if (event.type === "approval.resolved") {
          const id = (event.data as { id?: unknown } | null)?.id;
          if (typeof id === "string") {
            questionEpoch += 1;
            useAgentActivity.getState().removeQuestion(projectId, id);
          }
        }
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
}
