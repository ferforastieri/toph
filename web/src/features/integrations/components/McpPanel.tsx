import { useEffect, useState } from "react";
import { agentApi, type McpServer } from "../../agents/api";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Input } from "@/shared/boardui/base/input/input";
import { Select, SelectItem } from "@/shared/boardui/base/select/select";

interface Props { projectRoot?: string; onChanged?: () => void }
export default function McpPanel({ onChanged }: Props) {
  const [items, setItems] = useState<McpServer[]>([]);
  const [name, setName] = useState(""); const [transport, setTransport] = useState<"http" | "stdio">("http");
  const [url, setUrl] = useState(""); const [command, setCommand] = useState('["npx", "-y", "seu-servidor-mcp"]');
  const [token, setToken] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => agentApi.mcpServers().then(setItems);
  useEffect(() => { void load().catch((e) => setError(String(e))); }, []);
  async function save() {
    setBusy(true); setError("");
    try {
      const args: unknown = transport === "stdio" ? JSON.parse(command) : [];
      if (!Array.isArray(args) || args.some((a) => typeof a !== "string")) throw new Error("O comando deve ser uma lista JSON de strings.");
      await agentApi.saveMcp({ name, transport, url, command: args as string[], token });
      setName(""); setToken(""); await load(); onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function remove(id: string) { try { await agentApi.deleteMcp(id); await load(); onChanged?.(); } catch (e) { setError(String(e)); } }
  return <div className="flex flex-col gap-3">
    <p className="text-sm text-text-secondary">MCP nativo via stdio ou Streamable HTTP. Conexões são abertas sob demanda e liberadas quando ociosas.</p>
    {error && <p role="alert" className="text-red-500">{error}</p>}
    {items.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl border p-3"><div className="min-w-0 flex-1"><strong>{item.name}</strong><p className="truncate text-xs">{item.transport === "http" ? item.url : item.command.join(" ")}</p></div><Button size="small" variant="ghost" onClick={() => void remove(item.id)}>Remover</Button></div>)}
    <Input label="Nome" value={name} onChange={setName} />
    <Select aria-label="Transporte MCP" selectedKey={transport} onSelectionChange={(key) => setTransport(key as "http" | "stdio")}><SelectItem id="http">Streamable HTTP</SelectItem><SelectItem id="stdio">Comando local (stdio)</SelectItem></Select>
    {transport === "http" ? <><Input label="URL MCP" value={url} onChange={setUrl} /><Input label="Bearer token (opcional)" type="password" value={token} onChange={setToken} /></> : <Input label="Comando e argumentos (JSON)" value={command} onChange={setCommand} />}
    <Button disabled={busy || !name} onClick={() => void save()}>{busy ? "Salvando…" : "Adicionar MCP"}</Button>
  </div>;
}
