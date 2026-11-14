import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, LoaderCircle, RefreshCw } from "@toph/icons";
import { engineApi, type UsageLimits, type UsageWindow } from "../../agents/api";
import ComposerMenu from "./ComposerMenu";
import ProviderIcon from "../../providers/components/ProviderIcon";
import { modelGroup } from "../../providers/store";
import { cx } from "@toph/ui";

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
const WINDOWS: Array<{ key: keyof NonNullable<UsageLimits["go"]>; label: string }> = [
  { key: "rolling", label: "Janela de 5 horas" },
  { key: "weekly", label: "Semanal" },
  { key: "monthly", label: "Mensal" },
];

function remaining(window: UsageWindow | undefined): number | null {
  if (!window) return null;
  if (window.limited) return 0;
  return Math.max(0, Math.min(100, 100 - Math.round(window.percent)));
}

function resetIn(value: number | undefined): string {
  if (!value) return "—";
  const minutes = Math.ceil((value - Date.now()) / 60_000);
  if (!Number.isFinite(minutes)) return "—";
  if (minutes <= 0) return "agora";
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}min`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
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
        <div className="divide-y divide-separator-border overflow-hidden rounded-2xl border border-border-button-default bg-background-secondary-default/60">
          {windows.map(({ key, label: windowLabel, window, left: value }) => {
            const used = value == null ? null : 100 - value;
            return (
              <div key={key} className="px-3 py-3">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-caption-1-semibold text-text-primary">{windowLabel}</span>
                    <span className={cx(
                      "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                      used == null
                        ? "bg-background-tertiary-default text-text-tertiary"
                        : used >= 90
                          ? "bg-status-rose-bg text-status-rose-text"
                          : "bg-status-lime-bg text-status-lime-text",
                    )}>
                      {used == null ? "sem dados" : `${used}% usado`}
                    </span>
                  </div>
                  <span className="shrink-0 text-caption-2-regular text-text-tertiary">
                    {window ? `Renova em ${resetIn(window.resetsAt)}` : "—"}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-background-tertiary-default">
                  <div
                    className={cx(
                      "h-full rounded-full transition-[width] duration-500",
                      used == null ? "bg-text-tertiary/30" : used >= 90 ? "bg-status-rose-text" : "bg-status-lime-text",
                    )}
                    style={{ width: `${used ?? 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
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
        Percentual usado do limite do OpenCode Go. As janelas são atualizadas pelo OpenCode e recarregam a cada minuto.
        {updatedAt ? ` Última leitura às ${time(updatedAt)}.` : ""}
      </p>
    </div>}
  </ComposerMenu>;
}
