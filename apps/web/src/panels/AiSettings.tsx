import { useEffect, useState, type FormEvent } from "react";
import { Check, CircleAlert, PlugZap, Save, Bot } from "@toph/icons";
import { api, type AIConfigInput } from "../api";
import { useAI } from "../ai";
import { useApp } from "../store";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";
import { Textarea } from "@/boardui/base/textarea/textarea";
import { Switch } from "@/boardui/base/switch/switch";
import { Checkbox } from "@/boardui/base/checkbox/checkbox";
import { Select, SelectItem } from "@/boardui/base/select/select";
import { Chip } from "@/boardui/base/badges/chip";

const providers = [
  { id: "opencode", label: "OpenCode", base: "" },
  { id: "openai", label: "OpenAI", base: "https://api.openai.com" },
  { id: "codex", label: "Codex", base: "https://api.openai.com" },
  { id: "claude", label: "Claude", base: "https://api.anthropic.com" },
  { id: "ollama", label: "Ollama", base: "http://127.0.0.1:11434" },
  { id: "custom", label: "Custom", base: "" },
];

const empty: AIConfigInput = {
  provider: "opencode",
  baseUrl: "",
  apiKey: "",
  clearKey: false,
  model: "",
  maxTokens: 1024,
  temperature: 0.2,
  autocomplete: true,
  systemPrompt: "",
};

export default function AiSettings() {
  const config = useAI((state) => state.config);
  const setConfig = useAI((state) => state.setConfig);
  const models = useAI((state) => state.models);
  const loadModels = useAI((state) => state.loadModels);
  const loadingModels = useAI((state) => state.loadingModels);
  const notify = useApp((state) => state.notify);
  const [form, setForm] = useState<AIConfigInput>(empty);
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .aiConfig()
      .then((next) => {
        setConfig(next);
        void loadModels();
        setForm({
          provider: next.provider,
          baseUrl: next.baseUrl,
          model: next.model,
          maxTokens: next.maxTokens,
          temperature: next.temperature,
          autocomplete: next.autocomplete,
          systemPrompt: next.systemPrompt,
          apiKey: "",
          clearKey: false,
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load AI settings."));
  }, [setConfig]);

  function patch(next: Partial<AIConfigInput>) {
    setForm((current) => ({ ...current, ...next }));
    setTested(null);
  }

  function chooseProvider(provider: string) {
    const preset = providers.find((item) => item.id === provider);
    patch({
      provider,
      baseUrl: provider === "custom" ? form.baseUrl : (preset?.base ?? ""),
      model: "",
      autocomplete: form.autocomplete,
    });
  }

  async function save(event?: FormEvent, test = false) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = await api.saveAIConfig(form);
      setConfig(saved);
      await loadModels();
      setForm((current) => ({ ...current, apiKey: "", clearKey: false }));
      notify("success", "AI settings saved.");
      if (test) {
        await api.testAI();
        setTested(true);
      } else {
        setTested(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save AI settings.";
      setError(message);
      setTested(false);
      if (test) notify("error", message);
    } finally {
      setBusy(false);
    }
  }

  const uniqueModels = [...new Map(models.map((model) => [model.id, model])).values()];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="flex items-center gap-2 text-body-medium text-text-primary"><Bot size={16} /> Agente de IA</h3>
        <p className="mt-1 text-caption-1-regular text-text-secondary">
          O provider selecionado é usado pelo painel do agente e pelo autocomplete do editor.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={(event) => void save(event)}>
        <div className="bg-background-secondary-default flex flex-col gap-4 rounded-lg border p-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-body-medium text-text-secondary">Provider</span>
            <Select selectedKey={form.provider} onSelectionChange={(key) => chooseProvider(String(key))} aria-label="Provider" className="w-full">
              {providers.map((provider) => (
                <SelectItem key={provider.id} id={provider.id}>{provider.label}</SelectItem>
              ))}
            </Select>
          </div>
          <Input label="Base URL" value={form.baseUrl} onChange={(value) => patch({ baseUrl: value })} placeholder="https://api.example.com" />
          <div className="flex flex-col gap-1.5">
            <span className="text-body-medium text-text-secondary">Modelo</span>
            <Select selectedKey={form.model || null} onSelectionChange={(key) => patch({ model: key ? String(key) : "" })} isDisabled={loadingModels || uniqueModels.length === 0} aria-label="Modelo" className="w-full" renderValue={({ selectedText }) => selectedText || "Escolha um modelo"}>
              {form.model && !uniqueModels.some((model) => model.id === form.model) && (
                <SelectItem id={form.model}>{form.model}</SelectItem>
              )}
              {uniqueModels.map((model) => (
                <SelectItem key={model.id} id={model.id}>
                  {model.label}{model.provider ? ` · ${model.provider}` : ""}
                </SelectItem>
              ))}
            </Select>
          </div>
          <Input
            label={config?.hasKey ? "API key (salva)" : "API key"}
            type="password"
            value={form.apiKey}
            onChange={(value) => patch({ apiKey: value })}
            placeholder={config?.hasKey ? "Deixe em branco para manter a chave atual" : "Opcional para providers locais"}
            autoComplete="off"
          />
          {config?.hasKey && (
            <Checkbox isSelected={Boolean(form.clearKey)} onChange={(value) => patch({ clearKey: value })}>
              Remover chave salva
            </Checkbox>
          )}
        </div>

        <div className="bg-background-secondary-default grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <Input label="Max tokens" type="number" value={String(form.maxTokens)} onChange={(value) => patch({ maxTokens: Number(value) || 1 })} />
          <Input label="Temperature" type="number" value={String(form.temperature)} onChange={(value) => patch({ temperature: Number(value) || 0 })} />
          <div className="sm:col-span-2"><Textarea label="System prompt" rows={3} value={form.systemPrompt} onChange={(value) => patch({ systemPrompt: value })} /></div>
        </div>

        <div className="bg-background-secondary-default flex items-center justify-between gap-4 rounded-lg border p-4">
          <div>
            <p className="text-body-medium text-text-primary">Autocomplete do editor</p>
            <p className="text-caption-1-regular text-text-secondary">Usa o provider e o modelo configurados.</p>
          </div>
          <Switch isSelected={form.autocomplete} onChange={(value) => patch({ autocomplete: value })} />
        </div>

        {error && <Chip color="rose" variant="subtle" className="justify-start gap-2 whitespace-normal px-2 py-1.5"><CircleAlert size={13} /> {error}</Chip>}
        {tested !== null && (
          <Chip color={tested ? "lime" : "rose"} variant="subtle" className="justify-start gap-2 px-2 py-1.5">
            <Check size={13} /> {tested ? "Provider acessível." : "Falha ao testar o provider."}
          </Chip>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} leadingIcon={PlugZap} onClick={() => void save(undefined, true)}>Salvar e testar</Button>
          <Button type="submit" disabled={busy} leadingIcon={Save}>{busy ? "Salvando..." : "Salvar configurações"}</Button>
        </div>
      </form>
    </div>
  );
}
