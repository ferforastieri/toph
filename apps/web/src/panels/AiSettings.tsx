import { useEffect, useState, type FormEvent } from "react";
import { Check, CircleAlert, PlugZap, Save, Bot } from "@toph/icons";
import { api, type AIConfigInput } from "../api";
import { useAI } from "../ai";
import { useApp } from "../store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
        <h3 className="flex items-center gap-2 text-sm font-medium"><Bot size={16} /> Agente de IA</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          O provider selecionado é usado pelo painel do agente e pelo autocomplete do editor.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={(event) => void save(event)}>
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
          <label className="flex flex-col gap-1.5 text-sm">
            Provider
            <Select value={form.provider} onValueChange={chooseProvider}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>{provider.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Base URL
            <Input value={form.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} placeholder="https://api.example.com" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Modelo
            <Select value={form.model} onValueChange={(model) => patch({ model })} disabled={loadingModels || uniqueModels.length === 0}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={uniqueModels.length ? "Escolha um modelo" : "Salve para carregar os modelos"} />
              </SelectTrigger>
              <SelectContent>
                {form.model && !uniqueModels.some((model) => model.id === form.model) && (
                  <SelectItem value={form.model}>{form.model}</SelectItem>
                )}
                {uniqueModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.label}{model.provider ? ` · ${model.provider}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            API key {config?.hasKey && <span className="text-xs text-muted-foreground">(salva)</span>}
            <Input
              type="password"
              value={form.apiKey}
              onChange={(event) => patch({ apiKey: event.target.value })}
              placeholder={config?.hasKey ? "Deixe em branco para manter a chave atual" : "Opcional para providers locais"}
              autoComplete="off"
            />
          </label>
          {config?.hasKey && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={Boolean(form.clearKey)} onCheckedChange={(value) => patch({ clearKey: value === true })} />
              Remover chave salva
            </label>
          )}
        </div>

        <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            Max tokens
            <Input type="number" value={form.maxTokens} onChange={(event) => patch({ maxTokens: Number(event.target.value) || 1 })} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Temperature
            <Input type="number" step="0.1" value={form.temperature} onChange={(event) => patch({ temperature: Number(event.target.value) || 0 })} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            System prompt
            <Textarea rows={3} value={form.systemPrompt} onChange={(event) => patch({ systemPrompt: event.target.value })} />
          </label>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
          <div>
            <p className="text-sm font-medium">Autocomplete do editor</p>
            <p className="text-xs text-muted-foreground">Usa o provider e o modelo configurados.</p>
          </div>
          <Switch checked={form.autocomplete} onCheckedChange={(value) => patch({ autocomplete: value })} />
        </div>

        {error && <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"><CircleAlert size={13} /> {error}</div>}
        {tested !== null && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${tested ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"}`}>
            <Check size={13} /> {tested ? "Provider acessível." : "Falha ao testar o provider."}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void save(undefined, true)}>
            <PlugZap size={14} /> Salvar e testar
          </Button>
          <Button type="submit" disabled={busy}>
            <Save size={14} /> {busy ? "Salvando..." : "Salvar configurações"}
          </Button>
        </div>
      </form>
    </div>
  );
}
