import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, LoaderCircle } from "@toph/icons";
import { engineApi, type UsageLimits, type UsageWindow } from "../../agents/api";
import ComposerMenu from "./ComposerMenu";
import ProviderIcon from "../../providers/components/ProviderIcon";
import { modelGroup } from "../../providers/store";
import { cx } from "@/shared/boardui/utils/cx";

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
  { key: "rolling", label: "Agora" },
  { key: "weekly", label: "Semana" },
  { key: "monthly", label: "Mês" },
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

export default function ChatUsageMeter({ chatName, model }: Props) {
  const [limits, setLimits] = useState<UsageLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
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
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const go = limits?.go;
  const tightest = useMemo(() => {
    const values = WINDOWS.map(({ key }) => go?.[key]).filter((value): value is UsageWindow => Boolean(value));
    if (values.length === 0) return null;
    return values.reduce((worst, value) => (value.percent > worst.percent ? value : worst));
  }, [go]);
  const left = tightest ? remaining(tightest) : null;
  const provider = model ? modelGroup({ ...model, label: model.label ?? model.id }) : "opencode";
  const label = left == null ? "Limite do plano indisponível" : `Restante do plano: ${left}%`;

  return <ComposerMenu label="Limite do plano" trigger={
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
            className={cx("transition-[stroke-dashoffset] duration-500", left <= 10 ? "stroke-status-rose-text" : "stroke-accent-500")}
          />
        ) : null}
      </svg>
      <ProviderIcon provider={provider} className="relative size-3.5 text-text-primary" />
    </span>
  } popoverClassName="w-[340px] p-0" contentClassName="p-3">
    {() => <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-background-secondary-default"><ProviderIcon provider={provider} className="size-4" /></span>
        <div className="min-w-0">
          <strong className="block text-body-medium">Limite do plano</strong>
          <p className="truncate text-caption-2-regular text-text-tertiary">#{chatName}{limits?.workspace?.name ? ` · ${limits.workspace.name}` : ""}</p>
        </div>
      </div>

      {loading ? <p className="flex items-center gap-2 text-caption-1-regular text-text-secondary"><LoaderCircle className="size-4 animate-spin" /> Consultando o OpenCode…</p> : null}

      {!loading && go ? (
        <div className="flex flex-col gap-1.5">
          {WINDOWS.map(({ key, label }) => {
            const window = go[key];
            const value = remaining(window);
            return (
              <div key={key} className="flex items-center justify-between gap-2 rounded-xl border border-border-button-white bg-background-secondary-default px-2.5 py-2">
                <span className="text-caption-1-medium text-text-primary">{label}</span>
                <span className={cx("text-caption-1-semibold tabular-nums", value != null && value <= 10 ? "text-status-rose-text" : "text-text-primary")}>
                  {value == null ? "—" : `${value}% restante`}
                </span>
                <span className="text-[10px] text-text-tertiary">renova {reset(window.resetsAt)}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {!loading && !go && !error ? <p className="text-caption-1-regular text-text-secondary">Nenhuma janela de limite disponível.</p> : null}
      {error ? <p className="rounded-xl bg-status-rose-bg px-2.5 py-2 text-caption-1-regular text-status-rose-text">{error}</p> : null}

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

      <p className="text-[10px] text-text-tertiary">Percentual restante do limite do OpenCode Go. As janelas são atualizadas pelo OpenCode.</p>
    </div>}
  </ComposerMenu>;
}
