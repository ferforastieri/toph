import { useCallback, useEffect, useMemo, useState } from "react";
import { OpenCode } from "@opencode/client";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  ExternalLink,
  Info,
  KeyRound,
  LogIn,
  RefreshCw,
  Sparkles,
} from "@toph/icons";
import { openCodeBase } from "../api";
import { useApp } from "../store";
import { Button } from "@/boardui/base/buttons/button";
import { Chip } from "@/boardui/base/badges/chip";
import { Input } from "@/boardui/base/input/input";
import { SearchField } from "@/boardui/base/search-field/search-field";
import LoadingState from "./LoadingState";
import { ProgressCircle } from "@/boardui/base/progress/progress";


interface FormOption {
  value: string;
  label?: string;
}

interface FormField {
  key: string;
  title?: string;
  type: string;
  required?: boolean;
  hidden?: boolean;
  default?: string | number | boolean | string[];
  placeholder?: string;
  options?: FormOption[];
}

interface IntegrationMethod {
  id?: string;
  type: string;
  label?: string;
  form?: FormField[];
}

interface IntegrationConnection {
  type: string;
  label?: string;
  method?: string;
  status?: {
    status: string;
    message?: string;
    url?: string;
  };
}

interface IntegrationInfo {
  id: string;
  name: string;
  metadata?: Record<string, unknown>;
  methods: IntegrationMethod[];
  connections: IntegrationConnection[];
}

interface OAuthAttempt {
  attemptID: string;
  url: string;
  instructions: string;
  mode: "auto" | "code";
  integrationID: string;
  time?: {
    created: number;
    expires: number;
  };
}

interface OAuthStatus {
  status: "pending" | "complete" | "failed" | "expired";
  message?: string;
}

interface Props {
  projectRoot?: string;
  onConnectionsChanged?: () => void;
}

const COMMON_PROVIDERS = [
  "opencode",
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "xai",
  "deepseek",
  "groq",
  "mistral",
  "cerebras",
  "github-copilot",
  "azure",
  "amazon-bedrock",
];

function cookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/unauthorized|401/i.test(message)) {
    return "Não foi possível autenticar no servidor do agente. Confira a conexão em Configurações da IA.";
  }
  if (/unavailable|502|bad gateway/i.test(message)) {
    return "Não foi possível falar com o servidor do agente. Confira se ele está rodando e se a URL está correta.";
  }
  return message;
}

function providerSubtitle(integration: IntegrationInfo): string {
  return integration.id === "opencode" ? "Conta do agente" : "Provedor de modelos";
}

function providerAccounts(connections: IntegrationConnection[]): string {
  return connections.map((connection) => connection.label).filter(Boolean).join(" · ") || "Conta conectada";
}

function needsReconnect(connections: IntegrationConnection[]): boolean {
  return connections.some((connection) => connection.status?.status === "needs_auth");
}

function defaultAnswers(method: IntegrationMethod): Record<string, string | number | boolean | string[]> {
  const answer: Record<string, string | number | boolean | string[]> = {};
  for (const field of method.form ?? []) {
    if (field.hidden) {
      if (field.default !== undefined) answer[field.key] = field.default;
      continue;
    }
    if (field.default !== undefined) {
      answer[field.key] = field.default;
    } else if (field.required && field.options?.[0]?.value) {
      answer[field.key] = field.options[0].value;
    }
  }
  return answer;
}

export default function AiConnectionsPanel({ projectRoot, onConnectionsChanged }: Props) {
  const notify = useApp((state) => state.notify);
  const client = useMemo(
    () =>
      OpenCode.make({
        baseUrl: openCodeBase(),
        headers: { "X-Toph-CSRF": cookie("toph_csrf") },
      }),
    [],
  );
  const [items, setItems] = useState<IntegrationInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [selectedID, setSelectedID] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [attempt, setAttempt] = useState<OAuthAttempt | null>(null);
  const [oauthCode, setOauthCode] = useState("");

  const location = useMemo(
    () => (projectRoot ? { directory: projectRoot } : undefined),
    [projectRoot],
  );
  const selected = items.find((item) => item.id === selectedID) ?? null;
  const aiItems = items.filter((item) => item.metadata?.source !== "mcp");
  const connectedCount = aiItems.filter((item) => item.connections.length > 0).length;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = (await client.integration.list(
        (location ? { location } : {}) as never,
      )) as unknown as { data?: IntegrationInfo[] };
      setItems(result.data ?? []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client, location]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!attempt) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const result = (await client.integration.oauth.status({
          integrationID: attempt.integrationID,
          attemptID: attempt.attemptID,
          location,
        } as never)) as unknown as { data?: OAuthStatus };
        if (cancelled || !result.data) return;
        if (result.data.status === "complete") {
          setAttempt(null);
          setNotice("Provedor conectado. Feche as configurações e escolha o modelo no seletor do agente.");
          notify("success", "Provedor conectado.");
          await load();
          onConnectionsChanged?.();
        } else if (result.data.status === "failed" || result.data.status === "expired") {
          setAttempt(null);
          setError(
            result.data.message ||
              (result.data.status === "expired"
                ? "A autenticação expirou. Tente novamente."
                : "Não foi possível concluir a autenticação."),
          );
        }
      } catch (err) {
        if (!cancelled) {
          setAttempt(null);
          setError(errorMessage(err));
        }
      }
    };
    const timer = window.setInterval(() => void poll(), 2500);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [attempt, client, load, location, notify]);

  function resetSelection() {
    setSelectedID(null);
    setApiKey("");
    setOauthCode("");
    setAttempt(null);
    setError("");
    setNotice("");
  }

  function openIntegration(integration: IntegrationInfo) {
    setSelectedID(integration.id);
    setApiKey("");
    setOauthCode("");
    setAttempt(null);
    setError("");
    setNotice("");
  }

  async function connectKey(method: IntegrationMethod) {
    if (!selected || !apiKey.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await client.integration.connect.key({
        integrationID: selected.id,
        key: apiKey.trim(),
        answer: defaultAnswers(method),
        location,
      } as never);
      setApiKey("");
      setNotice("Provedor conectado. Feche as configurações e escolha o modelo no seletor do agente.");
      notify("success", "Provedor conectado.");
      await load();
      onConnectionsChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function connectOAuth(method: IntegrationMethod) {
    if (!selected || !method.id) return;
    setBusy(true);
    setError("");
    setNotice("");
    setAttempt(null);
    setOauthCode("");
    try {
      const result = (await client.integration.oauth.connect({
        integrationID: selected.id,
        methodID: method.id,
        answer: defaultAnswers(method),
        location,
      } as never)) as unknown as { data?: Omit<OAuthAttempt, "integrationID"> };
      if (!result.data) throw new Error("O servidor não retornou os dados da autenticação.");
      setAttempt({ ...result.data, integrationID: selected.id });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function completeOAuth() {
    if (!attempt || !oauthCode.trim()) return;
    setBusy(true);
    setError("");
    try {
      await client.integration.oauth.complete({
        integrationID: attempt.integrationID,
        attemptID: attempt.attemptID,
        code: oauthCode.trim(),
        location,
      } as never);
      setAttempt(null);
      setOauthCode("");
      setNotice("Provedor conectado. Feche as configurações e escolha o modelo no seletor do agente.");
      notify("success", "Provedor conectado.");
      await load();
      onConnectionsChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelOAuth() {
    if (!attempt) return;
    try {
      await client.integration.oauth.cancel({
        integrationID: attempt.integrationID,
        attemptID: attempt.attemptID,
        location,
      } as never);
    } catch {
      // The attempt may already be finished.
    }
    setAttempt(null);
    setOauthCode("");
  }

  const query = search.trim().toLowerCase();
  const visible = aiItems
    .filter((item) => {
      if (query) return `${item.name} ${item.id}`.toLowerCase().includes(query);
      return item.connections.length > 0 || COMMON_PROVIDERS.includes(item.id);
    })
    .sort((a, b) => {
      const connected = Number(b.connections.length > 0) - Number(a.connections.length > 0);
      if (connected !== 0) return connected;
      const aIndex = COMMON_PROVIDERS.indexOf(a.id);
      const bIndex = COMMON_PROVIDERS.indexOf(b.id);
      if (aIndex !== -1 || bIndex !== -1) {
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      }
      return a.name.localeCompare(b.name);
    })
    .slice(0, query ? 80 : 40);

  return (
    <div className="flex min-h-0 flex-col gap-4">
        <div className="rounded-lg border border-accent-500/30 bg-accent-500/5 p-3">
          <div className="flex items-center gap-2 text-body-medium text-text-primary">
            <Info size={16} className="text-accent-500" />
            Como usar
          </div>
          <p className="mt-1 text-caption-1-regular text-text-secondary">
            {connectedCount > 0
              ? `${connectedCount} ${connectedCount === 1 ? "provedor conectado" : "provedores conectados"}. Para usar, feche as configurações e escolha o modelo no seletor do agente.`
              : "Conecte um provedor abaixo. Depois feche as configurações e escolha o modelo no seletor do agente."}
          </p>
        </div>

        {error && <Chip color="rose" variant="subtle" className="justify-start gap-2 whitespace-normal px-2 py-1.5"><CircleAlert size={13} /> {error}</Chip>}
        {notice && <Chip color="lime" variant="subtle" className="justify-start gap-2 whitespace-normal px-2 py-1.5"><Check size={13} /> {notice}</Chip>}

        {selected ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="xs" iconOnly leadingIcon={ArrowLeft} aria-label="Voltar para provedores" onClick={resetSelection} />
              <div className="min-w-0">
                <h3 className="truncate text-body-medium text-text-primary">{selected.name}</h3>
                <p className="text-caption-2-regular text-text-secondary">
                  {selected.connections.length > 0
                    ? `Conectado como ${providerAccounts(selected.connections)}`
                    : "Ainda não conectado"}
                </p>
              </div>
            </div>

            {selected.connections.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-border-button-default bg-background-secondary-default p-3">
                <p className="text-caption-1-medium text-text-secondary">Contas conectadas</p>
                {selected.connections.map((connection, index) => (
                  <div key={`${connection.type}-${connection.label ?? index}`} className="flex items-center gap-2 text-caption-1-regular text-text-primary">
                    <Check size={14} className="text-accent-500" />
                    <span className="truncate">{connection.label || "Conta"}</span>
                    {connection.method && <span className="text-text-tertiary">· {connection.method}</span>}
                  </div>
                ))}
              </div>
            )}

            {selected.methods.filter((method) => method.type === "key").map((method, index) => (
              <div key={`key-${index}`} className="flex flex-col gap-2 rounded-lg border border-border-button-default bg-background-secondary-default p-3">
                <div>
                  <p className="text-body-medium text-text-primary">{method.label || "API key"}</p>
                  <p className="text-caption-2-regular text-text-secondary">
                    A chave fica salva no servidor do agente, não no navegador.
                  </p>
                </div>
                <Input label="API key" type="password" value={apiKey} onChange={setApiKey} placeholder="Cole a API key do provedor" autoComplete="off" />
                {method.form?.some((field) => !field.hidden) && (
                  <p className="text-caption-2-regular text-text-tertiary">Este provedor também pode exigir configuração adicional no servidor.</p>
                )}
                <div className="flex justify-end">
                  <Button size="small" leadingIcon={KeyRound} disabled={busy || !apiKey.trim()} onClick={() => void connectKey(method)}>
                    {busy ? "Conectando..." : selected.connections.length > 0 ? "Adicionar API key" : "Conectar API key"}
                  </Button>
                </div>
              </div>
            ))}

            {selected.methods.filter((method) => method.type === "oauth").map((method) => (
              <div key={method.id ?? method.label} className="flex flex-col gap-2 rounded-lg border border-border-button-default bg-background-secondary-default p-3">
                <div>
                  <p className="text-body-medium text-text-primary">{method.label || "Entrar com provedor"}</p>
                  <p className="text-caption-2-regular text-text-secondary">
                    {method.id === "device"
                      ? "Você receberá um link e um código para concluir o login."
                      : "O provedor abrirá uma página de autorização."}
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button size="small" variant="secondary" leadingIcon={LogIn} disabled={busy || Boolean(attempt)} onClick={() => void connectOAuth(method)}>
                    {selected.connections.length > 0 ? "Entrar com outra conta" : "Entrar"}
                  </Button>
                </div>
              </div>
            ))}

            {selected.methods.every((method) => method.type !== "key" && method.type !== "oauth") && (
              <p className="rounded-lg border border-border-button-default bg-background-secondary-default p-3 text-caption-1-regular text-text-secondary">
                Este provedor é configurado por variável de ambiente no servidor do agente.
              </p>
            )}

            {attempt && (
              <div className="flex flex-col gap-3 rounded-lg border border-accent-500/40 bg-accent-500/5 p-3">
                <div className="flex items-center gap-2 text-caption-1-medium text-text-primary">
                  <ProgressCircle size="sm" isIndeterminate aria-label="Carregando" />
                  Aguardando autenticação
                </div>
                {attempt.instructions && <p className="text-caption-1-regular text-text-secondary">{attempt.instructions}</p>}
                {attempt.url && (
                  <a className="inline-flex items-center gap-1 text-caption-1-medium text-accent-500 hover:underline" href={attempt.url} target="_blank" rel="noreferrer">
                    Abrir página de login <ExternalLink size={13} />
                  </a>
                )}
                {attempt.mode === "code" && (
                  <div className="flex flex-col gap-2">
                    <Input label="Código de autorização" value={oauthCode} onChange={setOauthCode} placeholder="Cole o código retornado pelo provedor" autoComplete="off" />
                    <div className="flex justify-end">
                      <Button size="small" disabled={busy || !oauthCode.trim()} onClick={() => void completeOAuth()}>Concluir login</Button>
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button size="xs" variant="ghost" onClick={() => void cancelOAuth()}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex items-end gap-2">
              <SearchField
                label="Buscar provedor"
                value={search}
                onChange={setSearch}
                placeholder="OpenAI, Anthropic, Google..."
                autoComplete="off"
                isLoading={loading}
                shape="rounded"
                className="flex-1"
              />
              <Button variant="secondary" size="small" leadingIcon={RefreshCw} onClick={() => void load()} disabled={loading || busy}>
                Atualizar
              </Button>
            </div>
            {loading && <LoadingState label="Carregando provedores..." className="py-2" />}
            {!loading && !error && visible.length === 0 && <p className="py-6 text-center text-body-regular text-text-secondary">Nenhum provedor encontrado.</p>}
            <div className="flex max-h-[440px] flex-col gap-1 overflow-y-auto">
              {visible.map((integration) => {
                const connected = integration.connections.length > 0;
                const reconnect = needsReconnect(integration.connections);
                return (
                  <button
                    key={integration.id}
                    type="button"
                    className="group flex items-center gap-3 rounded-2lg border border-transparent px-3 py-2 text-start hover:border-border-button-default hover:bg-background-primary-hover"
                    onClick={() => openIntegration(integration)}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background-tertiary-default text-foreground-icon-secondary">
                      <Sparkles size={16} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <strong className="truncate text-caption-1-semibold text-text-primary">{integration.name}</strong>
                      <small className="truncate text-caption-2-regular text-text-secondary">{providerSubtitle(integration)}</small>
                    </span>
                    {reconnect ? (
                      <Chip color="yellow" variant="subtle" className="shrink-0">Reconectar</Chip>
                    ) : connected ? (
                      <Chip color="lime" variant="subtle" className="shrink-0">Conectado</Chip>
                    ) : (
                      <span className="shrink-0 rounded-lg border border-border-button-default px-2 py-1 text-caption-1-medium text-text-primary transition-colors group-hover:bg-background-primary-hover">
                        Conectar
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
    </div>
  );
}
