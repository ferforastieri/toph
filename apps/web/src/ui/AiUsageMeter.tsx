import { useEffect, useState } from "react";
import type { OpenCodeClient, SessionStatsInfo } from "@opencode/client";
import { ProgressBar, ProgressCircle } from "@/boardui/base/progress/progress";
import { api, type AIUsageWindow } from "../api";
import { modelGroup, providerLabel, useAI } from "../ai";
import ProviderIcon from "../components/ProviderIcon";
import ComposerMenu from "./ComposerMenu";

function startOfMonth(value = new Date()): Date {
  const date = new Date(value);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatCost(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  }).format(value || 0);
}

function resetTime(value?: string | number): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return value > 1_000_000_000_000 ? value : value * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resetLabel(value?: string | number): string {
  const at = resetTime(value);
  if (!at) return "—";
  const remaining = Math.max(0, at - Date.now());
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function remainingPercent(window?: AIUsageWindow): number {
  return Math.max(0, Math.min(100, 100 - (window?.percent ?? 0)));
}

function LimitRow({ label, window }: { label: string; window?: AIUsageWindow }) {
  const used = Math.max(0, Math.min(100, window?.percent ?? 0));
  const remaining = remainingPercent(window);
  const critical = remaining <= 20;
  return (
    <div className="rounded-2xl border border-border-button-white bg-background-secondary-default p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-caption-1-medium text-text-secondary">{label}</span>
        <strong className={critical ? "text-title-3-medium tabular-nums text-status-rose-text" : "text-title-3-medium tabular-nums text-text-primary"}>
          {Math.round(remaining)}% <span className="text-caption-1-regular font-normal text-text-tertiary">restante</span>
        </strong>
      </div>
      <ProgressBar value={remaining} maxValue={100} size="sm" className="mt-2" aria-label={`${label}: ${Math.round(remaining)}% restante`} />
      <div className="mt-1.5 flex items-center justify-between gap-2 text-caption-2-regular text-text-tertiary">
        <span>{Math.round(used)}% usado</span>
        <span>renova em {resetLabel(window?.resetsAt)}</span>
      </div>
    </div>
  );
}

interface Props {
  client: OpenCodeClient;
  refreshKey?: string | number;
}

export default function AiUsageMeter({ client, refreshKey }: Props) {
  const config = useAI((state) => state.config);
  const models = useAI((state) => state.models);
  const selected = models.find((item) => item.id === config?.model);
  const provider = selected
    ? modelGroup(selected)
    : config?.model
      ? modelGroup({ id: config.model, label: config.model.split("/").pop() ?? config.model })
      : config?.provider || "opencode";
  const [stats, setStats] = useState<SessionStatsInfo | null>(null);
  const [usage, setUsage] = useState<{ available: boolean; reason?: string; usage?: { rolling?: AIUsageWindow; weekly?: AIUsageWindow; monthly?: AIUsageWindow } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let firstLoad = true;

    const load = async () => {
      if (document.hidden) return;
      if (firstLoad) setLoading(true);
      const now = new Date();
      try {
        const response = await client.session.stats({
          from: startOfMonth(now).getTime(),
          to: now.getTime(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          tools: "none",
        });
        if (cancelled) return;
        const next = (response && typeof response === "object" && "data" in response)
          ? (response as unknown as { data: SessionStatsInfo }).data
          : response;
        setStats(next);
        setError("");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Não foi possível carregar o uso da IA.");
      }
      try {
        const next = await api.aiUsage();
        if (!cancelled) setUsage(next);
      } catch (err) {
        if (!cancelled) setUsage({ available: false, reason: err instanceof Error ? err.message : "Não foi possível carregar os limites." });
      } finally {
        firstLoad = false;
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => { void load(); }, 60_000);
    const onVisibilityChange = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [client, refreshKey]);

  const weekly = usage?.usage?.weekly;
  const weeklyRemaining = weekly ? remainingPercent(weekly) : null;

  return (
    <ComposerMenu
      label="Uso da IA"
      trigger={(
        <span
          className="relative inline-flex size-5 shrink-0 items-center justify-center"
          title={weekly ? `Uso semanal: ${Math.round(remainingPercent(weekly))}% restante` : "Uso da IA"}
        >
          <ProgressCircle
            value={weeklyRemaining ?? 0}
            maxValue={100}
            size="sm"
            className="absolute inset-0 m-auto"
            aria-label={weekly ? `Uso semanal: ${Math.round(remainingPercent(weekly))}% restante` : "Uso da IA"}
          />
          <ProviderIcon provider={provider} className="relative size-3 text-text-primary" />
        </span>
      )}
      popoverClassName="w-[340px] p-0"
      contentClassName="p-3"
    >
      {() => (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background-secondary-default text-text-primary">
              <ProviderIcon provider={provider} className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <strong className="truncate text-body-medium text-text-primary">Uso da IA</strong>
              <span className="truncate text-caption-2-regular text-text-tertiary">{providerLabel(provider)}</span>
            </div>
            {usage?.available && provider.includes("opencode") ? <span className="shrink-0 rounded-full bg-background-secondary-default px-2 py-1 text-caption-2-semibold text-text-secondary">Go</span> : null}
          </div>

          {usage?.available ? (
            <>
              <div className="flex flex-col gap-2">
                <LimitRow label="5 horas" window={usage.usage?.rolling} />
                <LimitRow label="Semana" window={usage.usage?.weekly} />
                <LimitRow label="Mês" window={usage.usage?.monthly} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-background-secondary-default px-3 py-2">
                <span className="text-caption-1-regular text-text-secondary">Custo no mês</span>
                <strong className="text-caption-1-semibold tabular-nums text-text-primary">{formatCost(stats?.cost ?? 0)}</strong>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-border-button-white bg-background-secondary-default p-3 text-caption-1-regular leading-relaxed text-text-secondary">
              {usage?.reason ?? "Os limites de 5 horas, semana e mês estão disponíveis apenas para o OpenCode Go."}
            </div>
          )}

          {error ? <p className="text-caption-2-regular leading-snug text-text-error-primary">{error}</p> : null}
          {loading && !usage ? <p className="text-caption-2-regular text-text-tertiary">Carregando uso...</p> : null}
        </div>
      )}
    </ComposerMenu>
  );
}
