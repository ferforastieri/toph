import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, LoaderCircle, RefreshCw } from "@toph/icons";
import { engineApi, type UsageLimits, type UsageWindow } from "../../agents/api";
import ComposerMenu from "./ComposerMenu";
import ProviderIcon from "../../providers/components/ProviderIcon";
import { modelGroup } from "../../providers/store";
import { cx } from "@/shared/toph-ui/utils/cx";

interface ModelInfo {
  id: string;
  label?: string;
  provider?: string;
  connectionLabel?: string;
}

interface Props {
  chatName: string;
  model?: ModelInfo;
}

const CIRCUMFERENCE = 2 * Math.PI * 11.5;
const WINDOWS: Array<{ key: keyof NonNullable<UsageLimits["go"]>; label: string; hint: string }> = [
  { key: "rolling", label: "Agora", hint: "janela curta" },
  { key: "weekly", label: "Semana", hint: "limite semanal" },
  { key: "monthly", label: "Mês", hint: "limite mensal" },
];

function remaining(window: UsageWindow | undefined): number | null {
  if (!window) return null;
  if (window.limited) return 0;
  return Math.max(0, Math.min(100, 100 - Math.round(window.percent)));
}

function reset(value: number): string {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function time(value: number): string {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function tone(left: number | null): string {
  if (left == null) return "stroke-border-button-default";
  if (left <= 10) return "stroke-status-rose-text";
  if (left <= 30) return "stroke-status-amber-text";
  return "stroke-accent-500";
}

function barTone(left: number): string {
  if (left <= 10) return "bg-status-rose-text";
  if (left <= 30) return "bg-status-amber-text";
  return "bg-accent-500";
}

export default function ChatUsageMeter({ chatName, model }: Props) {
  const [limits, setLimits] = useState<UsageLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const result = await engineApi.limits("opencode");
      if (result.ok) {
        setLimits(result.data ?? null);
        setError(result.data ? "" : "O OpenCode não está conectado a uma conta.");
      } else {
        setError(result.message ?? "Limite do plano indisponível.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Limite do plano indisponível.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setUpdatedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const go = limits?.go;
  const windows = WINDOWS.map((item) => ({ ...item, window: go?.[item.key], left: remaining(go?.[item.key]) }));
  const tightest = useMemo(() => {
    const values = windows.filter((item) => item.window);
    if (values.length === 0) return null;
    return values.reduce((worst, item) => ((item.window?.percent ?? 0) > (worst.window?.percent ?? 0) ? item : worst));
  }, [go]);
  const left = tightest?.left ?? null;
  const provider = model ? modelGroup({ ...model, label: model.label ?? model.id }) : "opencode";
  const label = left == null ? "Limite do plano indisponível" : `Restante do plano: ${left}%`;

  return <ComposerMenu label="Consumo do plano" trigger={
    <span
      className="relative inline-flex size-[26px] shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      title={label}
      aria-label={label}
    >
      <svg viewBox="0 0 26 26" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="13" cy="13" r="11.5" fill="none" strokeWidth="1.6" className="stroke-border-button-default" />
        {left != null ? (
          <circle
            cx="13"
            cy="13"
            r="11.5"
            fill="none"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - left / 100)}
            className={cx("transition-[stroke-dashoffset] duration-500", tone(left))}
          />
        ) : null}
      </svg>
      <ProviderIcon provider={provider} className="relative size-3.5 text-text-primary" />
    </span>
  } popoverClassName="w-[390px] p-0" contentClassName="p-4">
    {() => <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-background-secondary-default">
          <ProviderIcon provider={provider} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block text-body-medium text-text-primary">Consumo do plano</strong>
          <p className="truncate text-caption-2-regular text-text-tertiary">
            #{chatName}{limits?.workspace?.name ? ` · ${limits.workspace.name}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="flex size-8 shrink-0 items-center justify-center rounded-xl text-text-tertiary transition-colors hover:bg-background-primary-hover hover:text-text-primary disabled:opacity-50"
          aria-label="Atualizar consumo"
          title="Atualizar consumo"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {loading && !limits ? (
        <p className="flex items-center gap-2 rounded-xl bg-background-secondary-default px-3 py-2 text-caption-1-regular text-text-secondary">
          <LoaderCircle className="size-4 animate-spin" /> Consultando o OpenCode…
        </p>
      ) : null}

      {go ? (
        <>
          <div className="rounded-2xl border border-border-button-default bg-background-secondary-default/60 p-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">Restante na janela mais apertada</p>
                <p className="mt-0.5 text-caption-2-regular text-text-secondary">{tightest ? `${tightest.label} · ${tightest.hint}` : "sem janela ativa"}</p>
              </div>
              <strong className={cx("text-title-2-medium tabular-nums", left != null && left <= 10 ? "text-status-rose-text" : left != null && left <= 30 ? "text-status-amber-text" : "text-text-primary")}>
                {left == null ? "—" : `${left}%`}
              </strong>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-background-tertiary-default">
              <div className={cx("h-full rounded-full transition-[width] duration-500", left == null ? "bg-text-tertiary/30" : barTone(left))} style={{ width: `${left ?? 0}%` }} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {windows.map(({ key, label: windowLabel, hint, window, left: value }) => (
              <div key={key} className="rounded-xl border border-border-button-default px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-caption-1-semibold text-text-primary">{windowLabel}</span>
                    <span className="ms-1.5 text-[10px] text-text-tertiary">{hint}</span>
                  </div>
                  <span className={cx("text-caption-1-semibold tabular-nums", value != null && value <= 10 ? "text-status-rose-text" : value != null && value <= 30 ? "text-status-amber-text" : "text-text-primary")}>
                    {value == null ? "—" : `${value}% restante`}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background-tertiary-default">
                  <div className={cx("h-full rounded-full transition-[width] duration-500", value == null ? "bg-text-tertiary/30" : barTone(value))} style={{ width: `${value ?? 0}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-text-tertiary">
                  <span>{value == null ? "sem dados" : `${100 - value}% usado`}</span>
                  <span>{window ? `renova ${reset(window.resetsAt)}` : "renovação indisponível"}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {!loading && !go && !error ? (
        <p className="rounded-xl bg-background-secondary-default px-3 py-2 text-caption-1-regular text-text-secondary">Nenhuma janela de limite disponível para esta conta.</p>
      ) : null}
      {error ? <p className="rounded-xl bg-status-rose-bg px-3 py-2 text-caption-1-regular text-status-rose-text">{error}</p> : null}

      {limits?.workspace?.usageURL ? (
        <a
          href={limits.workspace.usageURL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-caption-1-medium text-accent-600 hover:text-accent-500"
        >
          Ver consumo no OpenCode <ExternalLink size={12} />
        </a>
      ) : null}

      <p className="text-[10px] leading-relaxed text-text-tertiary">
        Percentual restante do limite do OpenCode Go. As janelas são atualizadas pelo OpenCode e recarregam a cada minuto.
        {updatedAt ? ` Última leitura às ${time(updatedAt)}.` : ""}
      </p>
    </div>}
  </ComposerMenu>;
}
