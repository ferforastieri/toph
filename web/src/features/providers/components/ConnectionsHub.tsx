import { useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, ExternalLink, KeyRound, PlugZap, Save, Server, Trash2, Wrench } from "@toph/icons";
import { api, type AIConfig } from "../../../shared/api";
import { useAI } from "../store";
import { useApp } from "../../../app/store";
import { agentApi, type Connection, type McpServer } from "../../agents/api";
import ProviderIcon from "./ProviderIcon";
import AiSettings from "./AiSettings";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Input } from "@/shared/boardui/base/input/input";
import { Select, SelectItem } from "@/shared/boardui/base/select/select";
import { ProgressBar } from "@/shared/boardui/base/progress/progress";
import { cx } from "@/shared/boardui/utils/cx";

interface ModelPreset {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  icon: string;
  hint: string;
}

interface EnvField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
}

interface McpPreset {
  id: string;
  name: string;
  description: string;
  transport: "http" | "stdio";
  url?: string;
  command?: string[];
  tokenLabel?: string;
  envFields?: EnvField[];
  /** Browser automation needs a longer budget than a plain API MCP. */
  timeoutSeconds?: number;
  /** High-frequency inspect-only servers skip the per-call prompt. */
  autoApprove?: boolean;
}

const MODEL_PRESETS: ModelPreset[] = [
  { id: "openai", name: "OpenAI", provider: "openai", baseUrl: "https://api.openai.com", icon: "openai", hint: "GPT e modelos de raciocínio" },
  { id: "anthropic", name: "Anthropic", provider: "anthropic", baseUrl: "https://api.anthropic.com", icon: "anthropic", hint: "Claude" },
  { id: "gemini", name: "Google Gemini", provider: "custom", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", icon: "gemini", hint: "Gemini via API compatível" },
  { id: "deepseek", name: "DeepSeek", provider: "custom", baseUrl: "https://api.deepseek.com/v1", icon: "deepseek", hint: "DeepSeek Chat e Reasoner" },
  { id: "openrouter", name: "OpenRouter", provider: "custom", baseUrl: "https://openrouter.ai/api/v1", icon: "openrouter", hint: "Vários modelos, uma chave" },
  { id: "groq", name: "Groq", provider: "custom", baseUrl: "https://api.groq.com/openai/v1", icon: "groq", hint: "Inferência rápida" },
  { id: "mistral", name: "Mistral", provider: "custom", baseUrl: "https://api.mistral.ai/v1", icon: "mistral", hint: "Mistral e Codestral" },
  { id: "xai", name: "xAI / Grok", provider: "custom", baseUrl: "https://api.x.ai/v1", icon: "xai", hint: "Grok" },
  { id: "opencode-go", name: "OpenCode Go", provider: "custom", baseUrl: "https://opencode.ai/inference/go/openai/v1", icon: "opencode", hint: "Gateway OpenCode Go" },
  { id: "ollama", name: "Ollama", provider: "ollama", baseUrl: "http://127.0.0.1:11434", icon: "ollama", hint: "Modelos locais" },
  { id: "custom", name: "URL personalizada", provider: "custom", baseUrl: "", icon: "custom", hint: "Qualquer API compatível com OpenAI" },
];

const MCP_PRESETS: McpPreset[] = [
  {
    id: "jira",
    name: "Jira / Atlassian",
    description: "Lê e edita issues e projetos com API token.",
    transport: "stdio",
    command: ["/home/fernando/.local/bin/uvx", "mcp-atlassian"],
    envFields: [
      { key: "JIRA_URL", label: "URL do site", placeholder: "https://empresa.atlassian.net" },
      { key: "JIRA_USERNAME", label: "E-mail da conta" },
      { key: "JIRA_API_TOKEN", label: "API token", secret: true },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Repositórios, issues e pull requests.",
    transport: "http",
    url: "https://api.githubcopilot.com/mcp/",
    tokenLabel: "Personal access token",
  },
  {
    id: "chrome",
    name: "Chrome DevTools",
    description: "Abre páginas, clica, lê console e rede, e tira prints para o agente ver.",
    transport: "stdio",
    command: [
      "npx", "-y", "chrome-devtools-mcp@latest",
      "--headless",
      "--isolated",
      "--slim",
      "--no-usage-statistics",
      "--no-performance-crux",
    ],
    timeoutSeconds: 180,
    autoApprove: true,
  },
  {
    id: "custom",
    name: "Outro MCP",
    description: "Qualquer servidor MCP via URL ou comando local.",
    transport: "http",
  },
];

const emptyModelForm = { id: "", label: "", provider: "custom", baseUrl: "", model: "", apiKey: "" };
const emptyMcpForm = { id: "", name: "", transport: "http" as "http" | "stdio", url: "", command: '["npx", "-y", "seu-servidor-mcp"]', token: "", env: "{}" };

function McpLogo({ id, size = 22 }: { id: string; size?: number }) {
  if (id === "github") return <ProviderIcon provider="github" className="text-text-primary" />;
  if (id === "jira") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <rect width="24" height="24" rx="6" fill="#2684FF" />
        <path d="M12 4.5 19 11.5l-3.2 3.2L12 10.9l-3.8 3.8L5 11.5 12 4.5Z" fill="#fff" />
        <path d="m12 13.4 3.8 3.8L12 21l-3.8-3.8 3.8-3.8Z" fill="#fff" opacity=".7" />
      </svg>
    );
  }
  return <PlugZap size={size} className="text-text-secondary" />;
}

export default function ConnectionsHub({ projectRoot: _projectRoot }: { projectRoot?: string }) {
  const notify = useApp((state) => state.notify);
  const loadingModels = useAI((state) => state.loadingModels);
  const modelError = useAI((state) => state.error);
  const loadModels = useAI((state) => state.loadModels);
  const [main, setMain] = useState<AIConfig | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [modelPreset, setModelPreset] = useState<ModelPreset | null>(null);
  const [modelForm, setModelForm] = useState(emptyModelForm);
  const [mcpPreset, setMcpPreset] = useState<McpPreset | null>(null);
  const [mcpForm, setMcpForm] = useState(emptyMcpForm);
  const [mcpEnv, setMcpEnv] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const [config, named, mcp] = await Promise.all([api.aiConfig(), agentApi.connections(), agentApi.mcpServers()]);
    setMain(config);
    setConnections(named);
    setMcpServers(mcp);
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    void loadModels();
  }, [loadModels]);

  const mainLabel = main?.connectionLabel || main?.label || "Principal";
  const selectedProvider = modelPreset ?? MODEL_PRESETS[MODEL_PRESETS.length - 1];

  function chooseModel(preset: ModelPreset) {
    setModelPreset(preset);
    setModelForm({
      ...emptyModelForm,
      label: preset.name,
      provider: preset.provider,
      baseUrl: preset.baseUrl,
    });
    setResult(null);
    setError("");
  }

  function editModel(connection: Connection) {
    const preset = MODEL_PRESETS.find((item) => item.provider === connection.provider && item.baseUrl === connection.baseUrl)
      ?? MODEL_PRESETS.find((item) => item.provider === connection.provider)
      ?? MODEL_PRESETS[MODEL_PRESETS.length - 1];
    setModelPreset(preset);
    setModelForm({
      id: connection.id,
      label: connection.label,
      provider: connection.provider,
      baseUrl: connection.baseUrl,
      model: connection.model,
      apiKey: "",
    });
    setResult(null);
    setError("");
  }

  async function saveModel() {
    if (!selectedProvider) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      await agentApi.saveConnection({
        id: modelForm.id || undefined,
        label: modelForm.label.trim() || selectedProvider.name,
        provider: modelForm.provider,
        baseUrl: modelForm.baseUrl.trim(),
        model: modelForm.model.trim(),
        apiKey: modelForm.apiKey,
      });
      setMain(await api.aiConfig());
      setConnections(await agentApi.connections());
      await loadModels();
      setModelForm(emptyModelForm);
      setModelPreset(null);
      setResult({ ok: true, text: "Conexão salva. Selecione o modelo em cada Toph." });
      notify("success", "Conexão de modelo salva.");
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setError(text);
      setResult({ ok: false, text });
    } finally {
      setBusy(false);
    }
  }

  async function removeModel(id: string) {
    try {
      await agentApi.deleteConnection(id);
      await load();
      await loadModels();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function chooseMcp(preset: McpPreset) {
    setMcpPreset(preset);
    setMcpForm({
      ...emptyMcpForm,
      name: preset.name,
      transport: preset.transport,
      url: preset.url ?? "",
      command: preset.command ? JSON.stringify(preset.command) : emptyMcpForm.command,
    });
    setMcpEnv(Object.fromEntries((preset.envFields ?? []).map((field) => [field.key, ""])));
    setResult(null);
    setError("");
  }

  function editMcp(server: McpServer) {
    const preset = MCP_PRESETS.find((item) => item.name === server.name)
      ?? MCP_PRESETS.find((item) => item.transport === server.transport && item.id !== "custom")
      ?? MCP_PRESETS[MCP_PRESETS.length - 1];
    setMcpPreset(preset);
    setMcpForm({
      id: server.id,
      name: server.name,
      transport: server.transport,
      url: server.url,
      command: JSON.stringify(server.command),
      token: "",
      env: "{}",
    });
    setMcpEnv(Object.fromEntries((preset.envFields ?? []).map((field) => [field.key, ""])));
    setResult(null);
    setError("");
  }

  async function saveMcp() {
    if (!mcpPreset) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      let command: string[] = [];
      let env: Record<string, string> = {};
      if (!mcpForm.id && mcpPreset.id === "jira") {
        const missing = (mcpPreset.envFields ?? []).filter((field) => !(mcpEnv[field.key] ?? "").trim());
        if (missing.length) throw new Error(`Preencha: ${missing.map((field) => field.label).join(", ")}.`);
      }
      if (!mcpForm.id && mcpPreset.id === "github" && !mcpForm.token.trim()) {
        throw new Error("Informe o personal access token do GitHub.");
      }
      if (mcpForm.transport === "stdio") {
        const parsed = JSON.parse(mcpForm.command);
        if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
          throw new Error("O comando deve ser uma lista JSON de strings.");
        }
        command = parsed;
        if (mcpPreset.envFields?.length) {
          for (const field of mcpPreset.envFields) {
            const value = (mcpEnv[field.key] ?? "").trim();
            if (value) env[field.key] = value;
          }
        } else {
          const parsedEnv = JSON.parse(mcpForm.env || "{}");
          if (!parsedEnv || Array.isArray(parsedEnv) || typeof parsedEnv !== "object") {
            throw new Error("As variáveis de ambiente devem ser um objeto JSON.");
          }
          env = parsedEnv as Record<string, string>;
        }
      }
      const saved = await agentApi.saveMcp({
        id: mcpForm.id || undefined,
        name: mcpForm.name.trim() || mcpPreset.name,
        transport: mcpForm.transport,
        url: mcpForm.url.trim(),
        command,
        token: mcpForm.token,
        env,
        timeoutSeconds: mcpPreset.timeoutSeconds,
        autoApprove: mcpPreset.autoApprove,
      });
      await load();
      setMcpForm(emptyMcpForm);
      setMcpPreset(null);
      if (saved.id) await testMcp(saved.id);
      notify("success", "MCP salvo.");
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setError(text);
      setResult({ ok: false, text });
    } finally {
      setBusy(false);
    }
  }

  async function testMcp(id: string) {
    setTesting(id);
    setResult(null);
    try {
      const value = await agentApi.testMcp(id);
      setResult({ ok: true, text: `Conexão OK — ${value.tools} ferramenta(s) encontrada(s).` });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting("");
    }
  }

  async function removeMcp(id: string) {
    try {
      await agentApi.deleteMcp(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const visibleModelPresets = useMemo(() => MODEL_PRESETS, []);
  const visibleMcpPresets = useMemo(() => MCP_PRESETS, []);

  return (
    <div className="flex flex-col gap-8">
      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-caption-1-regular text-red-500">{error}</p>}

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-body-medium text-text-primary"><KeyRound size={16} /> Modelos de IA</h3>
          <p className="mt-1 text-caption-1-regular text-text-secondary">Clique no provedor para conectar com sua API key. A conexão fica disponível para qualquer Toph.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {visibleModelPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => chooseModel(preset)}
              className={cx(
                "flex min-h-24 flex-col items-start gap-2 rounded-2xl border p-3 text-start transition-colors",
                modelPreset?.id === preset.id ? "border-accent-500 bg-accent-500/10" : "border-border-button-default hover:bg-background-primary-hover",
              )}
            >
              <ProviderIcon provider={preset.icon} className="size-6 text-text-primary" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-caption-1-semibold text-text-primary">{preset.name}</span>
                <span className="line-clamp-2 text-caption-2-regular text-text-tertiary">{preset.hint}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-dashed p-3">
          <ProviderIcon provider={main?.provider || "custom"} className="size-5 text-text-secondary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-caption-1-medium text-text-primary">{mainLabel} <span className="ml-1 rounded-full bg-background-tertiary-default px-1.5 py-0.5 text-caption-2-regular text-text-tertiary">Principal</span></p>
            <p className="truncate text-caption-2-regular text-text-tertiary">{main?.provider || "—"} · {main?.baseUrl || "—"}</p>
          </div>
          {loadingModels && <ProgressBar size="sm" isIndeterminate label="Carregando modelos..." />}
        </div>
        {modelError && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-caption-1-regular text-red-500">{modelError}</p>}

        {modelPreset && (
          <div className="grid gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default/45 p-4 sm:grid-cols-2">
            <div className="sm:col-span-2 flex items-center gap-2">
              <ProviderIcon provider={modelPreset.icon} className="size-5 text-text-primary" />
              <strong className="text-body-2-medium text-text-primary">{modelPreset.name}</strong>
            </div>
            <Input label="Nome da conexão" value={modelForm.label} onChange={(label) => setModelForm((current) => ({ ...current, label }))} />
            <Input label="URL da API" value={modelForm.baseUrl} onChange={(baseUrl) => setModelForm((current) => ({ ...current, baseUrl }))} placeholder="https://api.exemplo.com/v1" />
            <Input
              label={modelForm.id ? "API key (vazio mantém a atual)" : "API key"}
              type="password"
              value={modelForm.apiKey}
              onChange={(apiKey) => setModelForm((current) => ({ ...current, apiKey }))}
              autoComplete="off"
            />
            <Input label="Modelo padrão (opcional)" value={modelForm.model} onChange={(model) => setModelForm((current) => ({ ...current, model }))} placeholder="Ex.: gpt-6-astra" />
            <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setModelPreset(null)}>Cancelar</Button>
              <Button type="button" disabled={busy || !modelForm.baseUrl.trim()} leadingIcon={Save} onClick={() => void saveModel()}>{busy ? "Salvando…" : "Salvar conexão"}</Button>
            </div>
          </div>
        )}

        {connections.length > 0 && (
          <div className="flex flex-col gap-2">
            {connections.map((connection) => (
              <div key={connection.id} className="flex items-center gap-3 rounded-xl border border-border-button-default p-3">
                <ProviderIcon provider={connection.provider} className="size-5 text-text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-caption-1-medium text-text-primary">{connection.label}</p>
                  <p className="truncate text-caption-2-regular text-text-tertiary">{connection.provider} · {connection.baseUrl}{connection.model ? ` · ${connection.model}` : ""}</p>
                </div>
                <Button variant="ghost" size="xs" onClick={() => editModel(connection)}>Editar</Button>
                <Button variant="ghost" size="xs" iconOnly leadingIcon={Trash2} aria-label={`Remover ${connection.label}`} title="Remover" onClick={() => void removeModel(connection.id)} />
              </div>
            ))}
          </div>
        )}

        <details className="rounded-2xl border border-border-button-default">
          <summary className="cursor-pointer px-3 py-2.5 text-caption-1-medium text-text-secondary">Configurações avançadas do modelo principal</summary>
          <div className="border-t border-separator-border p-4"><AiSettings /></div>
        </details>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-body-medium text-text-primary"><PlugZap size={16} /> Ferramentas MCP</h3>
          <p className="mt-1 text-caption-1-regular text-text-secondary">Clique no serviço para conectar. O Jira usa API token; o GitHub usa personal access token.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {visibleMcpPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => chooseMcp(preset)}
              className={cx(
                "flex min-h-24 flex-col items-start gap-2 rounded-2xl border p-3 text-start transition-colors",
                mcpPreset?.id === preset.id ? "border-accent-500 bg-accent-500/10" : "border-border-button-default hover:bg-background-primary-hover",
              )}
            >
              <McpLogo id={preset.id} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-caption-1-semibold text-text-primary">{preset.name}</span>
                <span className="line-clamp-2 text-caption-2-regular text-text-tertiary">{preset.description}</span>
              </span>
            </button>
          ))}
        </div>

        {mcpPreset && (
          <div className="grid gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default/45 p-4 sm:grid-cols-2">
            <div className="sm:col-span-2 flex items-center gap-2">
              <McpLogo id={mcpPreset.id} />
              <strong className="text-body-2-medium text-text-primary">{mcpPreset.name}</strong>
            </div>
            <Input label="Nome da conexão" value={mcpForm.name} onChange={(name) => setMcpForm((current) => ({ ...current, name }))} />
            {mcpPreset.id === "custom" ? (
              <Select aria-label="Transporte MCP" selectedKey={mcpForm.transport} onSelectionChange={(key) => setMcpForm((current) => ({ ...current, transport: key as "http" | "stdio" }))}>
                <SelectItem id="http">Streamable HTTP</SelectItem>
                <SelectItem id="stdio">Comando local (stdio)</SelectItem>
              </Select>
            ) : null}
            {mcpForm.transport === "http" ? (
              <>
                <Input label="URL do MCP" value={mcpForm.url} onChange={(url) => setMcpForm((current) => ({ ...current, url }))} placeholder="https://mcp.exemplo.com/mcp" />
                <Input label={mcpPreset.tokenLabel || "Token de acesso"} type="password" value={mcpForm.token} onChange={(token) => setMcpForm((current) => ({ ...current, token }))} placeholder={mcpForm.id ? "Deixe em branco para manter" : "Cole o token"} autoComplete="off" />
              </>
            ) : (
              <>
                <Input label="Comando e argumentos (JSON)" value={mcpForm.command} onChange={(command) => setMcpForm((current) => ({ ...current, command }))} />
                {mcpPreset.envFields ? mcpPreset.envFields.map((field) => (
                  <Input
                    key={field.key}
                    label={field.label}
                    type={field.secret ? "password" : "text"}
                    value={mcpEnv[field.key] ?? ""}
                    onChange={(value) => setMcpEnv((current) => ({ ...current, [field.key]: value }))}
                    placeholder={field.placeholder ?? (mcpForm.id ? "Deixe em branco para manter" : undefined)}
                    autoComplete="off"
                  />
                )) : (
                  <Input label="Variáveis de ambiente (JSON)" value={mcpForm.env} onChange={(env) => setMcpForm((current) => ({ ...current, env }))} placeholder='{"TOKEN":"..."}' />
                )}
              </>
            )}
            <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setMcpPreset(null)}>Cancelar</Button>
              <Button type="button" disabled={busy || (mcpForm.transport === "http" && !mcpForm.url.trim())} leadingIcon={Save} onClick={() => void saveMcp()}>{busy ? "Salvando…" : "Salvar e testar"}</Button>
            </div>
          </div>
        )}

        {result && (
          <p className={cx("flex items-center gap-2 rounded-xl border p-3 text-caption-1-regular", result.ok ? "border-lime-500/30 bg-lime-500/5 text-lime-600" : "border-red-500/30 bg-red-500/5 text-red-500")}>
            {result.ok ? <Check size={14} /> : <CircleAlert size={14} />} {result.text}
          </p>
        )}

        {mcpServers.length > 0 && (
          <div className="flex flex-col gap-2">
            {mcpServers.map((server) => (
              <div key={server.id} className="flex items-center gap-3 rounded-xl border border-border-button-default p-3">
                <Server size={16} className="shrink-0 text-text-secondary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-caption-1-medium text-text-primary">{server.name}</p>
                  <p className="truncate text-caption-2-regular text-text-tertiary">{server.transport === "http" ? server.url : server.command.join(" ")}{server.envKeys?.length ? ` · ${server.envKeys.join(", ")}` : ""}</p>
                </div>
                <Button variant="ghost" size="xs" disabled={testing === server.id} onClick={() => void testMcp(server.id)}>{testing === server.id ? "Testando…" : "Testar"}</Button>
                <Button variant="ghost" size="xs" onClick={() => editMcp(server)}>Editar</Button>
                <Button variant="ghost" size="xs" iconOnly leadingIcon={Trash2} aria-label={`Remover ${server.name}`} title="Remover" onClick={() => void removeMcp(server.id)} />
              </div>
            ))}
          </div>
        )}

        <p className="flex items-center gap-1 text-caption-2-regular text-text-tertiary">
          <Wrench size={12} /> Outros MCPs podem ser adicionados em “Outro MCP”. <ExternalLink size={12} /> A conexão é aberta sob demanda.
        </p>
      </section>
    </div>
  );
}
