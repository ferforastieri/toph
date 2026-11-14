import { create } from "zustand";
import { api, type AIConfig, type AIModel } from "../../shared/api";

interface AIState {
  config: AIConfig | null;
  models: AIModel[];
  loading: boolean;
  loadingModels: boolean;
  error: string;
  load: () => Promise<void>;
  loadModels: () => Promise<void>;
  setConfig: (config: AIConfig | null) => void;
}

export const useAI = create<AIState>((set) => ({
  config: null,
  models: [],
  loading: false,
  loadingModels: false,
  error: "",
  async load() {
    set({ loading: true });
    try {
      const config = await api.aiConfig();
      set({ config, loading: false, error: "" });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : "Falha ao carregar configuração de IA" });
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
      set({ models, loadingModels: false, error: "" });
    } catch (error) {
      set({ models: [], loadingModels: false, error: error instanceof Error ? error.message : "Falha ao carregar modelos" });
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

/**
 * The model a conversation starts on when neither it nor its Toph names one:
 * the harness default (the first OpenCode Go model), with variants when it has
 * them so the effort control is there from the start.
 */
export function defaultModel(models: AIModel[], config: AIConfig | null): string {
  const configured = config?.model?.trim();
  if (configured) return configured;
  // The model the CLI's own sessions start on, when the harness still offers it.
  const preferred = models.find((model) => model.id === "opencode-go/deepseek-v4.1-flash");
  if (preferred) return preferred.id;
  const goVariants = models.find((model) => model.id.startsWith("opencode-go/") && model.variants?.length);
  const variants = models.find((model) => model.variants?.length);
  const go = models.find((model) => model.id.startsWith("opencode-go/"));
  return goVariants?.id ?? variants?.id ?? go?.id ?? models[0]?.id ?? "";
}

export function modelGroup(model: { id: string; label: string; provider?: string; connectionLabel?: string }): string {
  const connection = model.connectionLabel?.trim();
  if (connection) return connection;
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
  return "custom";
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
    default: return provider?.trim() || "Agent";
  }
}

export function modelDisplay(model?: { id: string; label?: string; provider?: string; connectionLabel?: string }): string {
  if (!model?.id) return "Modelo";
  const label = model.label?.trim() || model.id.split("/").pop() || model.id;
  return `${providerLabel(modelGroup({ id: model.id, label, provider: model.provider, connectionLabel: model.connectionLabel }))} · ${label}`;
}

/**
 * Finds the catalog entry for a stored selection. Layout files can keep an id
 * from a connection that was recreated (the prefix changes, the model does
 * not), so the bare model id is used as a fallback. Without this the chat
 * cannot show the model's effort levels or the right provider mark.
 */
export function findModel<T extends { id: string; label?: string }>(models: T[], id: string): T | undefined {
  if (!id) return undefined;
  const exact = models.find((model) => model.id === id);
  if (exact) return exact;
  const bare = id.split("::").pop() ?? id;
  return models.find((model) => (model.id.split("::").pop() ?? model.id) === bare);
}

export function modelTitle(model?: { id: string; label?: string; provider?: string; connectionLabel?: string }): string {
  if (!model?.id) return "Modelo";
  const display = modelDisplay(model);
  return model.label && model.label !== model.id ? `${display} · ${model.id}` : display;
}
