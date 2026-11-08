import { useCallback, useEffect, useState } from "react";
import { Check, Download, ExternalLink, LoaderCircle, TerminalSquare } from "@toph/icons";
import { engineApi, type EngineInfo, type EngineTest } from "../../agents/api";
import { Button } from "@/shared/boardui/base/buttons/button";
import { cx } from "@/shared/boardui/utils/cx";

type Busy = { id: string; action: "test" | "install" } | null;

export default function EngineSettings() {
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [tests, setTests] = useState<Record<string, EngineTest>>({});
  const [installs, setInstalls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setEngines(await engineApi.list());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível ler os CLIs.");
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default/45 p-3">
        <div className="min-w-0">
          <p className="text-body-medium text-text-primary">Motores de agente</p>
          <p className="mt-0.5 text-caption-1-regular text-text-secondary">
            O CLI escolhido conduz o loop do agente. O Toph entrega contexto, ferramentas, permissões e aprovações.
          </p>
        </div>
        <Button variant="ghost" size="small" leadingIcon={Download} onClick={() => void refresh()} disabled={loading || busy !== null}>
          Atualizar
        </Button>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-status-rose-border bg-status-rose-bg px-3 py-2 text-caption-1-regular text-status-rose-text">{error}</p> : null}
      {loading ? <p role="status" className="flex items-center gap-2 text-caption-1-regular text-text-secondary"><LoaderCircle className="size-4 animate-spin" /> Procurando CLIs…</p> : null}

      {engines.map((engine) => {
        const working = busy?.id === engine.id;
        const result = tests[engine.id];
        const output = installs[engine.id];
        return (
          <section
            key={engine.id}
            className={cx(
              "rounded-2xl border p-3 transition-colors",
              engine.installed ? "border-accent-500/35 bg-accent-500/[0.04]" : "border-border-button-default",
            )}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className={cx(
                "flex size-9 shrink-0 items-center justify-center rounded-xl",
                engine.installed ? "bg-accent-500/15 text-accent-600" : "bg-background-tertiary-default text-text-tertiary",
              )}>
                {engine.installed ? <Check size={17} /> : <TerminalSquare size={17} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <strong className="text-body-medium text-text-primary">{engine.label}</strong>
                  {engine.supported ? (
                    <span className="rounded-full bg-accent-500/15 px-1.5 py-0.5 text-caption-2-semibold text-accent-600">motor Toph</span>
                  ) : (
                    <span className="rounded-full bg-background-tertiary-default px-1.5 py-0.5 text-caption-2-regular text-text-tertiary">em breve</span>
                  )}
                  {engine.installed ? (
                    <span className="rounded-full bg-status-lime-bg px-1.5 py-0.5 text-caption-2-semibold text-status-lime-text">instalado</span>
                  ) : (
                    <span className="rounded-full bg-status-yellow-bg px-1.5 py-0.5 text-caption-2-semibold text-status-yellow-text">não instalado</span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-caption-1-regular text-text-secondary" title={engine.path ?? engine.binary}>
                  {engine.installed ? engine.path ?? engine.binary : `Binário: ${engine.binary}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="small"
                  disabled={working || !engine.installed}
                  leadingIcon={working && busy?.action === "test" ? LoaderCircle : Check}
                  onClick={() => void test(engine)}
                >
                  {working && busy?.action === "test" ? "Testando…" : "Testar"}
                </Button>
                {!engine.installed ? (
                  <Button
                    variant="primary"
                    size="small"
                    disabled={working}
                    leadingIcon={working && busy?.action === "install" ? LoaderCircle : Download}
                    onClick={() => void install(engine)}
                  >
                    {working && busy?.action === "install" ? "Instalando…" : "Instalar"}
                  </Button>
                ) : null}
                <a
                  href={engine.site}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-caption-1-medium text-text-secondary transition-colors hover:bg-background-primary-hover hover:text-text-primary"
                >
                  Site <ExternalLink size={12} />
                </a>
              </div>
            </div>

            {result ? (
              <p className={cx(
                "mt-2 rounded-xl px-2.5 py-2 text-caption-1-regular",
                result.ok ? "bg-status-lime-bg text-status-lime-text" : "bg-status-rose-bg text-status-rose-text",
              )}>
                {result.message}
                {result.modelCount ? ` ${result.modelCount} modelos disponíveis.` : ""}
              </p>
            ) : null}

            {!engine.installed ? (
              <div className="mt-2">
                <p className="text-caption-2-regular text-text-tertiary">Ou cole no terminal:</p>
                <code className="mt-1 block select-all overflow-x-auto rounded-lg bg-background-tertiary-default px-2.5 py-2 font-mono text-caption-2-regular text-text-primary">{engine.install}</code>
              </div>
            ) : null}

            {output ? (
              <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-background-tertiary-default p-2.5 font-mono text-[11px] leading-relaxed text-text-secondary">{output}</pre>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
