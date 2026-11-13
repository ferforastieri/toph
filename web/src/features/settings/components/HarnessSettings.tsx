import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, ExternalLink, LoaderCircle, RefreshCw } from "@toph/icons";
import { engineApi, type EngineInfo, type EngineTest } from "../../agents/api";
import { useApp } from "../../../app/store";
import HarnessIcon from "../../agents/components/HarnessIcon";
import ConnectionsHub from "../../providers/components/ConnectionsHub";
import { Button } from "@toph/ui/app";
import { cx } from "@toph/ui";

type Busy = { id: string; action: "test" | "install" | "update" } | null;

interface Props {
  projectRoot?: string;
}

/** One place for the agent harnesses, model providers and MCP servers. */
export default function HarnessSettings({ projectRoot }: Props) {
  const notify = useApp((state) => state.notify);
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [tests, setTests] = useState<Record<string, EngineTest>>({});
  const [installs, setInstalls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const refresh = useCallback(async () => {
    try {
      setEngines(await engineApi.list());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível ler os harnesses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function test(engine: EngineInfo) {
    setBusy({ id: engine.id, action: "test" });
    setError("");
    try {
      const result = await engineApi.test(engine.id);
      setTests((current) => ({ ...current, [engine.id]: result }));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `O teste de ${engine.label} falhou.`);
    } finally {
      setBusy(null);
    }
  }

  async function install(engine: EngineInfo) {
    setBusy({ id: engine.id, action: "install" });
    setError("");
    try {
      const result = await engineApi.install(engine.id);
      setInstalls((current) => ({ ...current, [engine.id]: result.output || result.message }));
      setTests((current) => ({
        ...current,
        [engine.id]: { ok: result.ok, installed: result.installed, path: result.path, message: result.message },
      }));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `A instalação de ${engine.label} falhou.`);
    } finally {
      setBusy(null);
    }
  }

  async function update(engine: EngineInfo) {
    setBusy({ id: engine.id, action: "update" });
    setError("");
    try {
      const result = await engineApi.update(engine.id);
      setInstalls((current) => ({ ...current, [engine.id]: result.output || result.message }));
      setTests((current) => ({
        ...current,
        [engine.id]: {
          ok: result.ok,
          installed: result.installed,
          path: result.path ?? undefined,
          version: result.version ?? undefined,
          message: result.message,
        },
      }));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `A atualização de ${engine.label} falhou.`);
    } finally {
      setBusy(null);
    }
  }

  async function copy(engine: EngineInfo) {
    try {
      await navigator.clipboard.writeText(engine.login);
      setCopied(engine.id);
      notify("success", `Comando de conexão de ${engine.label} copiado.`);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      notify("error", "Não foi possível copiar o comando.");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h3 className="text-title-2-medium text-text-primary">Harness</h3>
        <p className="mt-1 text-body-regular text-text-secondary">
          O CLI conduz o loop do agente; o Toph entrega contexto, ferramentas, permissões e aprovações. OpenCode, Claude Code e Codex já executam.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-body-medium text-text-primary">Motores de agente</h4>
            <p className="mt-0.5 text-caption-1-regular text-text-secondary">Conecte com a conta que você já usa. O login abre no seu terminal.</p>
          </div>
          <Button variant="ghost" size="small" leadingIcon={RefreshCw} onClick={() => void refresh()} disabled={loading || busy !== null}>
            Recarregar
          </Button>
        </div>

        {error ? <p role="alert" className="rounded-xl border border-status-rose-border bg-status-rose-bg px-3 py-2 text-caption-1-regular text-status-rose-text">{error}</p> : null}
        {loading ? <p role="status" className="flex items-center gap-2 text-caption-1-regular text-text-secondary"><LoaderCircle className="size-4 animate-spin" /> Procurando harnesses…</p> : null}

        <div className="grid gap-2 md:grid-cols-2">
          {engines.map((engine) => {
            const working = busy?.id === engine.id;
            const result = tests[engine.id];
            const output = installs[engine.id];
            return (
              <section key={engine.id} className={cx("flex flex-col gap-2 rounded-2xl border p-3", engine.installed ? "border-accent-500/30 bg-accent-500/[0.035]" : "border-border-button-default bg-background-primary-default")}>
                <div className="flex items-start gap-3">
                  <span className={cx("flex size-11 shrink-0 items-center justify-center rounded-2xl", engine.installed ? "bg-accent-500/12" : "bg-background-tertiary-default")}>
                    <HarnessIcon id={engine.id} className={cx("size-6", engine.installed ? "text-text-primary" : "text-text-secondary")} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <strong className="text-caption-1-semibold text-text-primary">{engine.label}</strong>
                      {engine.supported ? (
                        <span className="rounded-full bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-600">disponível</span>
                      ) : (
                        <span className="rounded-full bg-background-tertiary-default px-1.5 py-0.5 text-[10px] font-semibold text-text-tertiary">instalável</span>
                      )}
                      {engine.installed ? (
                        <span className="rounded-full bg-status-lime-bg px-1.5 py-0.5 text-[10px] font-semibold text-status-lime-text">instalado</span>
                      ) : (
                        <span className="rounded-full bg-status-yellow-bg px-1.5 py-0.5 text-[10px] font-semibold text-status-yellow-text">não instalado</span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-caption-2-regular text-text-tertiary" title={engine.path ?? engine.binary}>
                      {engine.installed ? engine.path ?? engine.binary : `Binário: ${engine.binary}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {engine.installed ? (
                      <>
                        <Button variant="secondary" size="small" disabled={working} leadingIcon={working && busy?.action === "test" ? LoaderCircle : Check} onClick={() => void test(engine)}>
                          {working && busy?.action === "test" ? "Testando…" : "Testar"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="small"
                          iconOnly
                          disabled={working}
                          leadingIcon={working && busy?.action === "update" ? LoaderCircle : RefreshCw}
                          aria-label={`Atualizar ${engine.label}`}
                          title={`Atualizar ${engine.label}`}
                          onClick={() => void update(engine)}
                        />
                        <Button variant="ghost" size="small" iconOnly leadingIcon={copied === engine.id ? Check : Copy} aria-label={`Copiar login de ${engine.label}`} title={`Copiar: ${engine.login}`} onClick={() => void copy(engine)} />
                      </>
                    ) : (
                      <Button variant="primary" size="small" disabled={working} leadingIcon={working && busy?.action === "install" ? LoaderCircle : Download} onClick={() => void install(engine)}>
                        {working && busy?.action === "install" ? "Instalando…" : "Instalar"}
                      </Button>
                    )}
                  </div>
                </div>

                {engine.installed && !engine.supported ? (
                  <p className="rounded-lg bg-status-yellow-bg px-2 py-1.5 text-caption-2-regular text-status-yellow-text">Instalado, mas o runtime ainda não está ligado. Use OpenCode, Claude Code ou Codex.</p>
                ) : null}

                <p className="text-caption-2-regular text-text-tertiary">
                  Conectar: <code className="select-all rounded bg-background-tertiary-default px-1 py-0.5 font-mono text-[11px] text-text-primary">{engine.login}</code>
                  {!engine.installed ? <> · Instalar: <code className="select-all rounded bg-background-tertiary-default px-1 py-0.5 font-mono text-[11px] text-text-primary">{engine.install}</code></> : null}
                </p>

                {result ? (
                  <p className={cx("rounded-lg px-2 py-1.5 text-caption-2-regular", result.ok ? "bg-status-lime-bg text-status-lime-text" : "bg-status-rose-bg text-status-rose-text")}>
                    {result.message}
                    {result.modelCount ? ` ${result.modelCount} modelos.` : ""}
                  </p>
                ) : null}
                {output ? <pre className="max-h-32 overflow-auto rounded-lg bg-background-tertiary-default p-2 font-mono text-[10px] leading-relaxed text-text-secondary">{output}</pre> : null}

                <a href={engine.site} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-caption-2-regular text-text-tertiary hover:text-text-primary">
                  Site do harness <ExternalLink size={11} />
                </a>
              </section>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h4 className="text-body-medium text-text-primary">Modelos e ferramentas</h4>
          <p className="mt-0.5 text-caption-1-regular text-text-secondary">Conecte os provedores de modelo e os servidores MCP que os Tophs podem usar.</p>
        </div>
        <ConnectionsHub projectRoot={projectRoot} />
      </section>
    </div>
  );
}
