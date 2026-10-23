import { create } from "zustand";
import { api, type AIConfig } from "./api";

interface AIState {
  config: AIConfig | null;
  loading: boolean;
  load: () => Promise<void>;
  setConfig: (config: AIConfig | null) => void;
}

export const useAI = create<AIState>((set) => ({
  config: null,
  loading: false,
  async load() {
    set({ loading: true });
    try {
      set({ config: await api.aiConfig(), loading: false });
    } catch {
      set({ loading: false });
    }
  },
  setConfig: (config) => set({ config }),
}));

export function providerLabel(provider?: string): string {
  switch (provider) {
    case "openai": return "OpenAI";
    case "codex": return "Codex";
    case "claude":
    case "anthropic": return "Claude";
    case "ollama": return "Ollama";
    case "custom": return "Custom AI";
    case "opencode": return "OpenCode";
    default: return "Agent";
  }
}
