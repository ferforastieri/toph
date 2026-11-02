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
      let config = await api.aiConfig();
      if (!config.autocomplete && !localStorage.getItem("toph_autocomplete_enabled_v1")) {
        config = await api.saveAIConfig({
          provider: config.provider,
          baseUrl: config.baseUrl,
          model: config.model,
          autocompleteModel: config.autocompleteModel,
          maxTokens: config.maxTokens,
          weeklyTokenLimit: config.weeklyTokenLimit,
          temperature: config.temperature,
          autocomplete: true,
          systemPrompt: config.systemPrompt,
          apiKey: "",
          clearKey: false,
        }).catch(() => config);
        localStorage.setItem("toph_autocomplete_enabled_v1", "1");
      }
      set({ config, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  async loadModels() {
    set({ loadingModels: true });
    try {
      const seen = new Set<string>();
      const models = (await api.aiModels()).models.filter((model) => {
        if (!model.id || seen.has(model.id)) return false;
        seen.add(model.id);
        return true;
      });
      set({ models, loadingModels: false });
    } catch {
      set({ models: [], loadingModels: false });
    }
  },
  setConfig: (config) => set({ config }),
}));

function canonicalProvider(provider: string): string {
  const value = provider.trim().toLowerCase();
  if (value === "anthropic") return "claude";
  if (value === "openai-codex" || value === "codex-openai") return "codex";
  if (value === "openai-compatible") return "openai";
  if (value === "google" || value === "google-ai") return "google";
  if (value === "x-ai" || value === "grok") return "xai";
  if (value === "meta-ai") return "meta";
  if (value === "moonshot-ai") return "moonshot";
  return value;
}

export function modelGroup(model: { id: string; label: string; provider?: string }): string {
  const explicitProvider = model.provider?.trim();
  if (explicitProvider) {
    const provider = canonicalProvider(explicitProvider);
    if (provider === "openai" && /(^|[\/_-])codex([\/_-]|$)/i.test(model.id)) return "codex";
    return provider;
  }

  const providerFromId = model.id.split("/", 1)[0]?.trim();
  if (providerFromId && providerFromId !== model.id) return canonicalProvider(providerFromId);

  const text = `${model.id} ${model.label}`.toLowerCase();
  if (/claude|anthropic/.test(text)) return "claude";
  if (/gemini|gemma|google/.test(text)) return "google";
  if (/deepseek/.test(text)) return "deepseek";
  if (/grok|xai/.test(text)) return "xai";
  if (/qwen|alibaba/.test(text)) return "qwen";
  if (/glm|zhipu/.test(text)) return "glm";
  if (/llama|meta\b/.test(text)) return "meta";
  if (/mistral/.test(text)) return "mistral";
  if (/kimi|moonshot/.test(text)) return "moonshot";
  if (/gpt|openai|codex/.test(text)) return "openai";
  return "opencode";
}

export function providerLabel(provider?: string): string {
  switch (canonicalProvider(provider ?? "")) {
    case "openai": return "OpenAI";
    case "codex": return "Codex";
    case "claude":
    case "anthropic": return "Claude";
    case "google": return "Google / Gemini";
    case "deepseek": return "DeepSeek";
    case "xai": return "Grok / xAI";
    case "qwen": return "Qwen";
    case "glm": return "GLM";
    case "meta": return "Llama / Meta";
    case "mistral": return "Mistral";
    case "moonshot": return "Kimi / Moonshot";
    case "ollama": return "Ollama";
    case "custom": return "Custom AI";
    case "openrouter": return "OpenRouter";
    case "groq": return "Groq";
    case "cerebras": return "Cerebras";
    case "github-copilot": return "GitHub Copilot";
    case "azure": return "Azure OpenAI";
    case "amazon-bedrock": return "Amazon Bedrock";
    case "opencode": return "OpenCode";
    case "opencode-go": return "OpenCode Go";
    default: return "Agent";
  }
}

export function modelDisplay(model?: { id: string; label?: string; provider?: string }): string {
  if (!model?.id) return "Modelo";
  const label = model.label?.trim() || model.id.split("/").pop() || model.id;
  return `${providerLabel(modelGroup({ id: model.id, label, provider: model.provider }))} · ${label}`;
}

export function modelTitle(model?: { id: string; label?: string; provider?: string }): string {
  if (!model?.id) return "Modelo";
  const display = modelDisplay(model);
  return model.label && model.label !== model.id ? `${display} · ${model.id}` : display;
}
