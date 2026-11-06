import { useEffect, useState } from "react";
import { agentApi, type Connection } from "../../agents/api";
import { api, type AIConfig } from "../../../shared/api";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Input } from "@/shared/boardui/base/input/input";
import { Select, SelectItem } from "@/shared/boardui/base/select/select";

interface Props { projectRoot?: string; onConnectionsChanged?: () => void }

const presets = [
  { id: "openai", label: "OpenAI (Responses)", provider: "openai", base: "https://api.openai.com" },
  { id: "anthropic", label: "Anthropic", provider: "anthropic", base: "https://api.anthropic.com" },
  { id: "ollama", label: "Ollama", provider: "ollama", base: "http://127.0.0.1:11434" },
  { id: "opencode-go", label: "OpenCode Go", provider: "custom", base: "https://opencode.ai/inference/go/openai/v1" },
  { id: "custom", label: "URL personalizada (OpenAI compatível)", provider: "custom", base: "" },
] as const;

function connectionKind(provider: string, baseUrl: string): string {
  if (provider === "custom" && baseUrl.toLowerCase().includes("opencode.ai/inference/go")) return "opencode-go";
  return provider;
}

export default function AiConnectionsPanel({ onConnectionsChanged }: Props) {
  const [items, setItems] = useState<Connection[]>([]);
  const [main, setMain] = useState<AIConfig | null>(null);
  const [form, setForm] = useState({ id: "", label: "", provider: "openai", baseUrl: "https://api.openai.com", apiKey: "", model: "" });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => Promise.all([agentApi.connections().then(setItems), api.aiConfig().then(setMain)]);
  useEffect(() => { void load().catch((e) => setError(String(e))); }, []);
  async function save() {
    setBusy(true); setError("");
    try { await agentApi.saveConnection(form); setForm({ ...form, id: "", label: "", apiKey: "" }); await load(); onConnectionsChanged?.(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { await agentApi.deleteConnection(id); await load(); onConnectionsChanged?.(); }
    catch (e) { setError(String(e)); }
  }
  function applyPreset(kind: string) {
    const preset = presets.find((item) => item.id === kind);
    if (!preset) return;
    setForm((current) => {
      const keepCustom = preset.id === "custom" && !current.baseUrl.toLowerCase().includes("opencode.ai/inference/go");
      const label = current.label.trim();
      const isPresetLabel = presets.some((item) => item.label === label);
      return {
        ...current,
        provider: preset.provider,
        baseUrl: preset.id === "custom" ? (keepCustom ? current.baseUrl : "") : preset.base,
        label: preset.id === "custom" ? (isPresetLabel ? "" : label) : (isPresetLabel || !label ? preset.label : label),
        apiKey: "",
      };
    });
  }
  return <div className="flex flex-col gap-3">
    <p className="text-sm text-text-secondary">Conexões diretas aos modelos. As credenciais são criptografadas pelo Toph. Selecione a conexão/modelo em cada agente.</p>
    {error && <p role="alert" className="text-red-500">{error}</p>}
    {main && <div className="flex items-center gap-2 rounded-xl border border-dashed p-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong>{main.connectionLabel || main.label || "Conexão principal"}</strong><span className="rounded-full bg-background-tertiary-default px-2 py-0.5 text-caption-2-regular text-text-tertiary">Principal</span></div><p className="truncate text-xs">{main.provider} · {main.baseUrl}</p></div><span className="text-caption-2-regular text-text-tertiary">Configurada em “Inteligência artificial”</span></div>}
    {items.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl border p-3"><div className="min-w-0 flex-1"><strong>{item.label}</strong><p className="truncate text-xs">{item.provider} · {item.baseUrl}</p></div><Button variant="ghost" size="small" onClick={() => setForm({ id: item.id, label: item.label, provider: item.provider, baseUrl: item.baseUrl, model: item.model, apiKey: "" })}>Editar</Button><Button variant="ghost" size="small" onClick={() => void remove(item.id)}>Remover</Button></div>)}
    <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
      <Input label="Nome da conexão" value={form.label} onChange={(label) => setForm({ ...form, label })} />
      <Select aria-label="Tipo de conexão" selectedKey={connectionKind(form.provider, form.baseUrl)} onSelectionChange={(key) => applyPreset(String(key))}>
        {presets.map((preset) => <SelectItem key={preset.id} id={preset.id}>{preset.label}</SelectItem>)}
      </Select>
      <Input label="URL da API" value={form.baseUrl} onChange={(baseUrl) => setForm({ ...form, baseUrl })} />
      <Input label={form.id ? "API key (vazio mantém a atual)" : "API key"} type="password" value={form.apiKey} onChange={(apiKey) => setForm({ ...form, apiKey })} />
      <Input label="Modelo padrão da conexão" value={form.model} onChange={(model) => setForm({ ...form, model })} />
      <Button disabled={busy || !form.label || !form.baseUrl} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar conexão"}</Button>
    </div>
  </div>;
}
