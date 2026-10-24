import { FormEvent, useEffect, useState } from "react";
import { Check, CircleAlert, PlugZap, Save, Sparkles } from "lucide-react";
import { api, type AIConfigInput } from "../api";
import { Checkbox } from "@toph/ui";
import { Select } from "@toph/ui";
import { useAI } from "../ai";
import { useApp } from "../store";
import { Button } from "@toph/ui";

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
  autocomplete: false,
  systemPrompt: "",
};

export default function AiSettings() {
  const config = useAI((state) => state.config);
  const setConfig = useAI((state) => state.setConfig);
  const models = useAI((state) => state.models);
  const loadingModels = useAI((state) => state.loadingModels);
  const loadModels = useAI((state) => state.loadModels);
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

  return (
    <div className="settings-page">
      <div className="settings-page-title"><Sparkles size={15} /> AI agent</div>
      <p className="settings-note">
        The selected provider is used by the Agent tab and, when supported, by editor autocomplete.
        Keys and URLs are stored on the server, not baked into the image or environment.
      </p>
      <form className="settings-form" onSubmit={(event) => void save(event)}>
        <div className="settings-field">
          <span>Provider</span>
          <Select
            value={form.provider}
            options={providers.map((provider) => ({ value: provider.id, label: provider.label }))}
            onChange={chooseProvider}
            label="Provider"
          />
        </div>
        <label>
          Base URL
          <input
            value={form.baseUrl}
            onChange={(event) => patch({ baseUrl: event.target.value })}
            placeholder="https://api.example.com"
            autoComplete="url"
          />
        </label>
        <div className="settings-field">
          <span className="settings-field-head">
            Model
            <button type="button" className="ui-link-button" onClick={() => void loadModels()} disabled={loadingModels}>
              {loadingModels ? "Loading..." : "Refresh"}
            </button>
          </span>
          <Select
            value={form.model}
            options={[
              ...(form.model && !models.some((model) => model.id === form.model)
                ? [{ value: form.model, label: form.model }]
                : []),
              ...models.map((model) => ({
                value: model.id,
                label: model.label + (model.provider ? ` · ${model.provider}` : ""),
              })),
            ]}
            onChange={(model) => patch({ model })}
            label="Model"
            placeholder={models.length ? "Choose a model" : "Save settings and refresh models"}
            disabled={loadingModels || models.length === 0}
          />
        </div>
        <label>
          API key {config?.hasKey && <span className="settings-inline-badge">stored</span>}
          <input
            type="password"
            value={form.apiKey}
            onChange={(event) => patch({ apiKey: event.target.value })}
            placeholder={config?.hasKey ? "Leave blank to keep current key" : form.provider === "opencode" ? "Basic <base64>" : "Optional for local providers"}
            autoComplete="off"
          />
          {form.provider === "opencode" && (
            <small className="settings-hint">
              OpenCode uses Basic auth: <code>Basic base64("opencode:" + server password)</code>.
            </small>
          )}
        </label>
        {config?.hasKey && (
          <Checkbox
            checked={Boolean(form.clearKey)}
            onChange={(clearKey) => patch({ clearKey })}
            label="Remove stored key"
          />
        )}
        <div className="settings-form-grid">
          <label>
            Max tokens
            <input
              type="number"
              min={1}
              max={8192}
              value={form.maxTokens}
              onChange={(event) => patch({ maxTokens: Number(event.target.value) })}
            />
          </label>
          <label>
            Temperature
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(event) => patch({ temperature: Number(event.target.value) })}
            />
          </label>
        </div>
        <label>
          System prompt
          <textarea
            rows={3}
            value={form.systemPrompt}
            onChange={(event) => patch({ systemPrompt: event.target.value })}
            placeholder="Optional instructions for the agent and autocomplete."
          />
        </label>
        <div className={`settings-toggle ${form.autocomplete ? "on" : ""}`}>
          <span>
            Editor autocomplete
            <small>Uses the configured provider and model.</small>
          </span>
          <Button
            type="button"
            className="switch-track"
            role="switch"
            aria-checked={form.autocomplete}
            onClick={() => patch({ autocomplete: !form.autocomplete })}
          >
            <span className="switch-thumb" />
          </Button>
        </div>
        {error && <div className="form-error"><CircleAlert size={13} /> {error}</div>}
        {tested && (
          <div className={`settings-test ${tested ? "ok" : "fail"}`}>
            <Check size={13} /> {tested ? "Provider reachable." : "Provider test failed."}
          </div>
        )}
        <div className="settings-actions">
          <Button type="button" className="ghost small" disabled={busy} onClick={() => void save(undefined, true)}>
            <PlugZap size={14} /> Save and test
          </Button>
          <Button className="primary small" disabled={busy}>
            <Save size={14} /> {busy ? "Saving..." : "Save AI settings"}
          </Button>
        </div>
      </form>
    </div>
  );
}
