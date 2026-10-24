import { create } from "zustand";
import { api, type AIConfig, type AIModel } from "./api";

interface AIState {
  config: AIConfig | null;
  models: AIModel[];
  loading: boolean;
  loadingModels: boolean;
  load: () => Promise<void>;
  loadModels: () => Promise<void>;
  setConfig: (config: AIConfig | null) => void;
}

export const useAI = create<AIState>((set) => ({
  config: null,
  models: [],
  loading: false,
  loadingModels: false,
  async load() {
    set({ loading: true });
    try {
      set({ config: await api.aiConfig(), loading: false });
    } catch {
      set({ loading: false });
    }
  },
  async loadModels() {
    set({ loadingModels: true });
    try {
      set({ models: (await api.aiModels()).models, loadingModels: false });
    } catch {
      set({ models: [], loadingModels: false });
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
