import { FormEvent, useEffect, useState } from "react";
import { Check, CircleAlert, PlugZap, Save, Sparkles } from "lucide-react";
import { api, type AIConfigInput } from "../api";
import { useAI } from "../ai";
import { useApp } from "../store";

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
      autocomplete: provider === "opencode" ? false : form.autocomplete,
    });
  }

  async function save(event?: FormEvent, test = false) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = await api.saveAIConfig(form);
      setConfig(saved);
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
        <label>
          Provider
          <select value={form.provider} onChange={(event) => chooseProvider(event.target.value)}>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.label}</option>
            ))}
          </select>
        </label>
        <label>
          Base URL
          <input
            value={form.baseUrl}
            onChange={(event) => patch({ baseUrl: event.target.value })}
            placeholder="https://api.example.com"
            autoComplete="url"
          />
        </label>
        <label>
          Model
          <input
            value={form.model}
            onChange={(event) => patch({ model: event.target.value })}
            placeholder={form.provider === "claude" ? "claude-sonnet-4" : "gpt-4.1-mini"}
          />
        </label>
        <label>
          API key {config?.hasKey && <span className="settings-inline-badge">stored</span>}
          <input
            type="password"
            value={form.apiKey}
            onChange={(event) => patch({ apiKey: event.target.value })}
            placeholder={config?.hasKey ? "Leave blank to keep current key" : "Optional for local providers"}
            autoComplete="off"
          />
        </label>
        {config?.hasKey && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.clearKey}
              onChange={(event) => patch({ clearKey: event.target.checked })}
            />
            Remove stored key
          </label>
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
            <small>
              {form.provider === "opencode"
                ? "Not available with OpenCode; use an OpenAI-compatible, Claude or Ollama endpoint."
                : "Uses the configured provider and model."}
            </small>
          </span>
          <button
            type="button"
            className="switch-track"
            role="switch"
            aria-checked={form.autocomplete}
            disabled={form.provider === "opencode"}
            onClick={() => patch({ autocomplete: !form.autocomplete })}
          >
            <span className="switch-thumb" />
          </button>
        </div>
        {error && <div className="form-error"><CircleAlert size={13} /> {error}</div>}
        {tested && (
          <div className={`settings-test ${tested ? "ok" : "fail"}`}>
            <Check size={13} /> {tested ? "Provider reachable." : "Provider test failed."}
          </div>
        )}
        <div className="settings-actions">
          <button type="button" className="ghost small" disabled={busy} onClick={() => void save(undefined, true)}>
            <PlugZap size={14} /> Save and test
          </button>
          <button className="primary small" disabled={busy}>
            <Save size={14} /> {busy ? "Saving..." : "Save AI settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
