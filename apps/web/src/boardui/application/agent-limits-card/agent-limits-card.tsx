import { RiArrowRightSLine } from "@remixicon/react";
import { cx } from "@/boardui/utils/cx";

export interface AgentLimitBucket {
  label: string;
  value: number;
  color?: string;
}

export interface AgentLimitsCardProps {
  total: number;
  buckets: AgentLimitBucket[];
  cost?: number;
  className?: string;
}

export function AgentLimitsCard({ total, buckets, cost, className }: AgentLimitsCardProps) {
  const sum = buckets.reduce((acc, bucket) => acc + bucket.value, 0) || 1;
  return (
    <section className={cx("flex w-full min-w-0 flex-col rounded-2xl bg-background-secondary-default px-4 pt-2.5 pb-4", className)}>
      <div className="-mx-2 flex items-center justify-between gap-3 rounded-2lg px-2 py-1">
        <span className="text-body-medium text-text-secondary">Janela de contexto</span>
        <span className="flex items-center gap-2">
          <span className="text-body-medium whitespace-nowrap text-text-secondary tabular-nums">
            {formatTokens(total)} tokens{cost !== undefined ? <span className="text-text-primary"> · ${cost.toFixed(4)}</span> : null}
          </span>
          <RiArrowRightSLine className="size-4 shrink-0 text-text-tertiary" aria-hidden />
        </span>
      </div>
      <div className="mt-1.5 flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-chart-track">
        {buckets.filter((bucket) => bucket.value > 0).map((bucket) => (
          <div
            key={bucket.label}
            className="h-full shrink-0 transition-[width] duration-500 ease-out"
            style={{ width: `${(bucket.value / sum) * 100}%`, backgroundColor: bucket.color ?? "var(--color-chart-6)" }}
            title={`${bucket.label} · ${formatTokens(bucket.value)}`}
          />
        ))}
      </div>
      <div className="my-3 h-px w-full bg-separator-border-strong" />
      <div className="flex flex-col gap-2">
        {buckets.map((bucket) => (
          <div key={bucket.label} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-body-2-regular text-text-secondary">{bucket.label}</span>
            <span className="shrink-0 text-body-2-medium text-text-primary tabular-nums">{formatTokens(bucket.value)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}
