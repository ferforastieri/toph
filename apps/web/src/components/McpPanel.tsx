import { useCallback, useEffect, useMemo, useState } from "react";
import { OpenCode } from "@opencode/client";
import {
  Check,
  CircleAlert,
  ExternalLink,
  LogIn,
  Plus,
  PlugZap,
  RefreshCw,
  Trash2,
  Wrench,
} from "@toph/icons";
import { openCodeBase } from "../api";
import { useApp } from "../store";
import { useConfirm } from "../ui/confirm";
import { Button } from "@/boardui/base/buttons/button";
import { Chip } from "@/boardui/base/badges/chip";
import { Input } from "@/boardui/base/input/input";
import LoadingState from "./LoadingState";
import { ProgressCircle } from "@/boardui/base/progress/progress";
import { Select, SelectItem } from "@/boardui/base/select/select";

interface McpStatus {
  status: "connected" | "pending" | "disabled" | "failed" | "needs_auth";
  error?: string;
}

interface McpServer {
  name: string;
  status: McpStatus;
  integrationID?: string;
}

interface FormField {
  key: string;
  type: string;
  default?: string | number | boolean | string[];
  hidden?: boolean;
  required?: boolean;
  options?: Array<{ value: string; label?: string }>;
}

interface IntegrationMethod {
  id?: string;
  type: string;
  label?: string;
  form?: FormField[];
}

interface IntegrationInfo {
  id: string;
  name: string;
  methods: IntegrationMethod[];
}

interface OAuthAttempt {
  attemptID: string;
  url: string;
  instructions: string;
  mode: "auto" | "code";
  serverName: string;
  integrationID: string;
}

interface OAuthStatus {
  status: "pending" | "complete" | "failed" | "expired";
  message?: string;
}

interface Props {
  projectRoot?: string;
}

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
    return "Não foi possível falar com o servidor do agente. Confira se ele está rodando.";
  }
  return message;
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

function statusInfo(status: McpStatus): { label: string; color: "lime" | "yellow" | "cyan" | "rose" | "neutral" } {
  switch (status.status) {
    case "connected": return { label: "Conectado", color: "lime" };
    case "needs_auth": return { label: "Precisa autenticar", color: "yellow" };
    case "pending": return { label: "Conectando", color: "cyan" };
    case "failed": return { label: "Falhou", color: "rose" };
    default: return { label: "Desativado", color: "neutral" };
  }
}

export default function McpPanel({ projectRoot }: Props) {
  const notify = useApp((state) => state.notify);
  const confirm = useConfirm();
  const client = useMemo(
    () =>
      OpenCode.make({
        baseUrl: openCodeBase(),
        headers: { "X-Toph-CSRF": cookie("toph_csrf") },
      }),
    [],
  );
  const location = useMemo(
    () => (projectRoot ? { directory: projectRoot } : undefined),
    [projectRoot],
  );
  const [servers, setServers] = useState<McpServer[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"remote" | "local">("remote");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [attempt, setAttempt] = useState<OAuthAttempt | null>(null);
  const [oauthCode, setOauthCode] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [mcpResult, integrationResult] = await Promise.all([
        client.mcp.list((location ? { location } : {}) as never),
        client.integration.list((location ? { location } : {}) as never),
      ]) as unknown as [
        { data?: McpServer[] },
        { data?: IntegrationInfo[] },
      ];
      setServers(mcpResult.data ?? []);
      setIntegrations(integrationResult.data ?? []);
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
          await client.mcp.connect({ server: attempt.serverName, location } as never).catch(() => undefined);
          setNotice("Servidor MCP autenticado e reconectado.");
          notify("success", "Servidor MCP autenticado.");
          await load();
        } else if (result.data.status === "failed" || result.data.status === "expired") {
          setAttempt(null);
          setError(result.data.message || "Não foi possível concluir a autenticação do MCP.");
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

  async function addServer() {
    if (!name.trim()) {
      setError("Informe um nome para o servidor MCP.");
      return;
    }
    if (type === "remote" && !/^https?:\/\//i.test(url.trim())) {
      setError("Informe uma URL HTTP(S) válida para o servidor remoto.");
      return;
    }
    if (type === "local" && !command.trim()) {
      setError("Informe o comando do servidor local.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const config = type === "remote"
        ? { type: "remote", url: url.trim() }
        : { type: "local", command: command.trim().split(/\s+/) };
      await client.mcp.add({ server: name.trim(), config, location } as never);
      setName("");
      setUrl("");
      setCommand("");
      setAdding(false);
      setNotice("Servidor MCP adicionado. Conecte-o para liberar as ferramentas.");
      notify("success", "Servidor MCP adicionado.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function connectServer(server: McpServer) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await client.mcp.connect({ server: server.name, location } as never);
      setNotice(`Conexão de ${server.name} atualizada.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function disconnectServer(server: McpServer) {
    setBusy(true);
    setError("");
    try {
      await client.mcp.disconnect({ server: server.name, location } as never);
      setNotice(`${server.name} desconectado.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeServer(server: McpServer) {
    const ok = await confirm({
      title: "Remover MCP?",
      message: `Remover o servidor ${server.name} da configuração do agente?`,
      confirmLabel: "Remover",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await client.mcp.remove({ server: server.name, location } as never);
      setNotice(`${server.name} removido.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function authenticate(server: McpServer) {
    const integration = integrations.find((item) => item.id === server.integrationID);
    const method = integration?.methods.find((item) => item.type === "oauth" && item.id);
    if (!integration || !method?.id) {
      setError(`O servidor ${server.name} não expôs um método de autenticação.`);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    setAttempt(null);
    setOauthCode("");
    try {
      const result = (await client.integration.oauth.connect({
        integrationID: integration.id,
        methodID: method.id,
        answer: defaultAnswers(method),
        location,
      } as never)) as unknown as { data?: Omit<OAuthAttempt, "serverName" | "integrationID"> };
      if (!result.data) throw new Error("O servidor não retornou os dados da autenticação.");
      setAttempt({ ...result.data, serverName: server.name, integrationID: integration.id });
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
      await client.mcp.connect({ server: attempt.serverName, location } as never).catch(() => undefined);
      setNotice("Servidor MCP autenticado e reconectado.");
      notify("success", "Servidor MCP autenticado.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelOAuth() {
    if (!attempt) return;
    await client.integration.oauth.cancel({
      integrationID: attempt.integrationID,
      attemptID: attempt.attemptID,
      location,
    } as never).catch(() => undefined);
    setAttempt(null);
    setOauthCode("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-accent-500/30 bg-accent-500/5 p-3">
        <div className="flex items-center gap-2 text-body-medium text-text-primary">
          <Wrench size={16} className="text-accent-500" />
          Ferramentas MCP
        </div>
        <p className="mt-1 text-caption-1-regular text-text-secondary">
          Conecte servidores MCP para dar ao agente acesso a ferramentas externas, APIs e serviços como Atlassian e Stripe.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-medium text-text-primary">Servidores configurados</p>
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="small" leadingIcon={RefreshCw} onClick={() => void load()} disabled={loading || busy}>Atualizar</Button>
          <Button size="small" leadingIcon={Plus} onClick={() => setAdding((value) => !value)} disabled={busy}>Adicionar MCP</Button>
        </div>
      </div>

      {adding && (
        <div className="flex flex-col gap-3 rounded-lg border border-accent-500/30 bg-background-secondary-default p-3">
          <p className="text-body-medium text-text-primary">Novo servidor MCP</p>
          <Input label="Nome" value={name} onChange={setName} placeholder="ex.: github" autoComplete="off" />
          <div className="flex flex-col gap-1.5">
            <span className="text-body-medium text-text-secondary">Tipo</span>
            <Select selectedKey={type} onSelectionChange={(key) => setType(String(key) as "remote" | "local")} aria-label="Tipo de MCP" className="w-full">
              <SelectItem id="remote">Remoto (URL)</SelectItem>
              <SelectItem id="local">Local (comando)</SelectItem>
            </Select>
          </div>
          {type === "remote" ? (
            <Input label="URL" value={url} onChange={setUrl} placeholder="https://mcp.example.com/mcp" autoComplete="off" />
          ) : (
            <Input label="Comando" value={command} onChange={setCommand} placeholder="npx -y @modelcontextprotocol/server-github" autoComplete="off" />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="small" onClick={() => setAdding(false)} disabled={busy}>Cancelar</Button>
            <Button size="small" leadingIcon={Plus} onClick={() => void addServer()} disabled={busy}>Adicionar</Button>
          </div>
        </div>
      )}

      {error && <Chip color="rose" variant="subtle" className="justify-start gap-2 whitespace-normal px-2 py-1.5"><CircleAlert size={13} /> {error}</Chip>}
      {notice && <Chip color="lime" variant="subtle" className="justify-start gap-2 whitespace-normal px-2 py-1.5"><Check size={13} /> {notice}</Chip>}

      {attempt && (
        <div className="flex flex-col gap-3 rounded-lg border border-accent-500/40 bg-accent-500/5 p-3">
          <div className="flex items-center gap-2 text-caption-1-medium text-text-primary">
            <ProgressCircle size="sm" isIndeterminate aria-label="Carregando" />
            Aguardando autenticação de {attempt.serverName}
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

      {loading && <LoadingState label="Carregando servidores MCP..." className="py-2" />}
      {!loading && !error && servers.length === 0 && (
        <div className="rounded-lg border border-dashed border-border-button-default p-6 text-center">
          <Wrench size={20} className="mx-auto text-text-tertiary" />
          <p className="mt-2 text-body-regular text-text-secondary">Nenhum servidor MCP configurado.</p>
          <p className="mt-1 text-caption-1-regular text-text-tertiary">Adicione um servidor remoto ou local para liberar ferramentas ao agente.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {servers.map((server) => {
          const status = statusInfo(server.status);
          const integration = integrations.find((item) => item.id === server.integrationID);
          const canAuth = Boolean(integration?.methods.some((method) => method.type === "oauth" && method.id));
          return (
            <div key={server.name} className="flex flex-col gap-2 rounded-lg border border-border-button-default bg-background-secondary-default p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background-tertiary-default text-foreground-icon-secondary"><Wrench size={15} /></span>
                <div className="min-w-0 flex-1">
                  <strong className="truncate text-caption-1-semibold text-text-primary">{server.name}</strong>
                  {server.status.error && <p className="truncate text-caption-2-regular text-text-tertiary" title={server.status.error}>{server.status.error}</p>}
                </div>
                <Chip color={status.color} variant="subtle" className="shrink-0">{status.label}</Chip>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                {server.status.status === "connected" ? (
                  <Button variant="secondary" size="xs" onClick={() => void disconnectServer(server)} disabled={busy}>Desconectar</Button>
                ) : server.status.status === "needs_auth" && canAuth ? (
                  <Button size="xs" leadingIcon={LogIn} onClick={() => void authenticate(server)} disabled={busy || Boolean(attempt)}>Autenticar</Button>
                ) : (
                  <Button variant="secondary" size="xs" leadingIcon={PlugZap} onClick={() => void connectServer(server)} disabled={busy}>Conectar</Button>
                )}
                <Button variant="ghost" size="xs" iconOnly leadingIcon={Trash2} aria-label={`Remover ${server.name}`} onClick={() => void removeServer(server)} disabled={busy} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
