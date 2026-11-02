import { useEffect, useState } from "react";
import type { OpenCodeClient, SessionStatsInfo } from "@opencode/client";
import { ProgressBar, ProgressCircle } from "@/boardui/base/progress/progress";
import { useAI } from "../ai";
import ComposerMenu from "./ComposerMenu";

const DEFAULT_WEEKLY_TOKEN_LIMIT = 10_000_000;

function startOfWeek(value = new Date()): Date {
  const date = new Date(value);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

function endOfWeek(value = new Date()): Date {
  const date = startOfWeek(value);
  date.setDate(date.getDate() + 7);
  return date;
}

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

function tokenTotal(tokens: SessionStatsInfo["tokens"] | undefined): number {
  if (!tokens) return 0;
  // Cache reads can be several orders of magnitude larger than the actual
  // prompt/response volume. They are billed differently and would make a
  // weekly token budget meaningless, so count only fresh tokens here.
  return tokens.input + tokens.output + tokens.reasoning;
}

function formatCost(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  }).format(value || 0);
}

function resetLabel(now = new Date()): string {
  const remaining = Math.max(0, endOfWeek(now).getTime() - now.getTime());
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return "menos de 1h";
}

function weekRangeLabel(now = new Date()): string {
  const start = startOfWeek(now);
  const end = endOfWeek(now);
  const format = (date: Date) => date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return `${format(start)} – ${format(new Date(end.getTime() - 1))}`;
}

interface Props {
  client: OpenCodeClient;
  refreshKey?: string | number;
}

export default function AiUsageMeter({ client, refreshKey }: Props) {
  const weeklyLimit = useAI((state) => state.config?.weeklyTokenLimit) ?? DEFAULT_WEEKLY_TOKEN_LIMIT;
  const [stats, setStats] = useState<SessionStatsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let firstLoad = true;

    const load = async () => {
      if (document.hidden) return;
      if (firstLoad) setLoading(true);
      try {
        const now = new Date();
        const response = await client.session.stats({
          from: startOfWeek(now).getTime(),
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

  const tokens = tokenTotal(stats?.tokens);
  const rawPercent = weeklyLimit > 0 ? (tokens / weeklyLimit) * 100 : 0;
  const hasLimit = weeklyLimit > 0;

  const activity = new Map((stats?.activity ?? []).map((item) => [item.date, item.steps]));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = startOfWeek();
    date.setDate(date.getDate() + index);
    return {
      key: dayKey(date),
      label: date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").slice(0, 3),
      steps: activity.get(dayKey(date)) ?? 0,
    };
  });
  const maxSteps = Math.max(1, ...days.map((day) => day.steps));

  const triggerLabel = stats ? (hasLimit ? `${Math.round(rawPercent)}%` : formatTokens(tokens)) : "Uso";

  return (
    <ComposerMenu
      label="Uso da IA"
      trigger={(
        <>
          <ProgressCircle
            value={hasLimit ? Math.min(tokens, weeklyLimit) : 0}
            maxValue={hasLimit ? weeklyLimit : 1}
            size="sm"
            aria-label="Uso semanal da IA"
          />
          <span className="tabular-nums">{triggerLabel}</span>
        </>
      )}
      popoverClassName="w-[320px] p-0"
      contentClassName="p-3"
    >
      {() => (
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <strong className="text-body-medium text-text-primary">Uso da IA</strong>
              <span className="text-caption-2-regular text-text-tertiary">Semana {weekRangeLabel()}</span>
            </div>
            <span className="shrink-0 rounded-full bg-background-secondary-default px-2 py-1 text-caption-2-semibold tabular-nums text-text-secondary">
              {hasLimit ? `${Math.round(rawPercent)}%` : "Sem limite"}
            </span>
          </div>

          <div className="rounded-2xl border border-border-button-white bg-background-secondary-default p-3">
            <div className="flex items-end justify-between gap-3">
              <strong className="text-title-3-medium tabular-nums text-text-primary">{formatTokens(tokens)} <span className="text-caption-1-regular font-normal text-text-tertiary">tokens</span></strong>
              <span className="text-caption-2-regular text-text-tertiary">
                {hasLimit ? `de ${formatTokens(weeklyLimit)}` : "semana atual"}
              </span>
            </div>
            {hasLimit ? (
              <ProgressBar
                value={Math.min(tokens, weeklyLimit)}
                maxValue={weeklyLimit}
                size="sm"
                className="mt-2"
                aria-label="Consumo do limite semanal"
              />
            ) : null}
            <p className="mt-2 text-caption-2-regular text-text-tertiary">
              {hasLimit
                ? tokens > weeklyLimit
                  ? `Limite semanal excedido · renova em ${resetLabel()}`
                  : `Renova em ${resetLabel()}`
                : "Defina um limite semanal em Configurações de IA"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Sessões", value: String(stats?.sessions ?? 0) },
              { label: "Prompts", value: String(stats?.prompts ?? 0) },
              { label: "Custo", value: formatCost(stats?.cost ?? 0) },
              { label: "Dias ativos", value: String(stats?.activeDays ?? 0) },
            ].map((item) => (
              <div key={item.label} className="flex min-w-0 flex-col rounded-xl bg-background-secondary-default px-2.5 py-2">
                <span className="text-caption-2-regular text-text-tertiary">{item.label}</span>
                <strong className="truncate text-caption-1-semibold tabular-nums text-text-primary">{item.value}</strong>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-caption-2-regular text-text-tertiary">
              <span>Atividade</span>
              <span>{stats?.activeDays ?? 0} dias ativos</span>
            </div>
            <div className="flex h-14 items-end gap-1">
              {days.map((day) => (
                <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <span
                    className="w-full rounded-t-sm bg-accent-500/60"
                    style={{ height: `${Math.max(3, (day.steps / maxSteps) * 38)}px` }}
                    title={`${day.steps} ${day.steps === 1 ? "step" : "steps"}`}
                  />
                  <span className="text-[9px] uppercase text-text-tertiary">{day.label}</span>
                </div>
              ))}
            </div>
          </div>

          {error ? <p className="text-caption-2-regular leading-snug text-text-error-primary">{error}</p> : null}
          {loading && !stats ? <p className="text-caption-2-regular text-text-tertiary">Carregando uso...</p> : null}
        </div>
      )}
    </ComposerMenu>
  );
}
