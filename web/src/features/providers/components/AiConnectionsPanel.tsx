import { useEffect, useState } from "react";
import { agentApi, type Connection } from "../../agents/api";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Input } from "@/shared/boardui/base/input/input";
import { Select, SelectItem } from "@/shared/boardui/base/select/select";

interface Props { projectRoot?: string; onConnectionsChanged?: () => void }
export default function AiConnectionsPanel({ onConnectionsChanged }: Props) {
  const [items, setItems] = useState<Connection[]>([]);
  const [form, setForm] = useState({ id: "", label: "", provider: "openai", baseUrl: "https://api.openai.com", apiKey: "", model: "" });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => agentApi.connections().then(setItems);
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
  return <div className="flex flex-col gap-3">
    <p className="text-sm text-text-secondary">Conexões diretas aos modelos. As credenciais são criptografadas pelo Toph. Selecione a conexão/modelo em cada agente.</p>
    {error && <p role="alert" className="text-red-500">{error}</p>}
    {items.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl border p-3"><div className="min-w-0 flex-1"><strong>{item.label}</strong><p className="truncate text-xs">{item.provider} · {item.baseUrl}</p></div><Button variant="ghost" size="small" onClick={() => setForm({ id: item.id, label: item.label, provider: item.provider, baseUrl: item.baseUrl, model: item.model, apiKey: "" })}>Editar</Button><Button variant="ghost" size="small" onClick={() => void remove(item.id)}>Remover</Button></div>)}
    <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
      <Input label="Nome da conexão" value={form.label} onChange={(label) => setForm({ ...form, label })} />
      <Select aria-label="Protocolo" selectedKey={form.provider} onSelectionChange={(key) => setForm({ ...form, provider: String(key), apiKey: "", baseUrl: key === "anthropic" ? "https://api.anthropic.com" : key === "ollama" ? "http://127.0.0.1:11434" : key === "openai" ? "https://api.openai.com" : "" })}>
        <SelectItem id="openai">OpenAI</SelectItem><SelectItem id="anthropic">Anthropic</SelectItem><SelectItem id="ollama">Ollama</SelectItem><SelectItem id="custom">API compatível com OpenAI</SelectItem>
      </Select>
      <Input label="URL da API" value={form.baseUrl} onChange={(baseUrl) => setForm({ ...form, baseUrl })} />
      <Input label={form.id ? "API key (vazio mantém a atual)" : "API key"} type="password" value={form.apiKey} onChange={(apiKey) => setForm({ ...form, apiKey })} />
      <Input label="Modelo padrão da conexão" value={form.model} onChange={(model) => setForm({ ...form, model })} />
      <Button disabled={busy || !form.label || !form.baseUrl} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar conexão"}</Button>
    </div>
  </div>;
}
