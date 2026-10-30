import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cx } from "@/boardui/utils/cx";

export type ProgressSize = "sm" | "md" | "lg";

const BAR_HEIGHT: Record<ProgressSize, string> = {
  sm: "h-1",
  md: "h-1.5",
  lg: "h-2",
};

const CIRCLE_SIZE: Record<ProgressSize, number> = {
  sm: 16,
  md: 24,
  lg: 32,
};

function percent(value: number, maxValue: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(maxValue) || maxValue <= 0) return 0;
  return Math.min(100, Math.max(0, (value / maxValue) * 100));
}

export interface ProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  value?: number;
  maxValue?: number;
  size?: ProgressSize;
  isIndeterminate?: boolean;
  label?: ReactNode;
  valueLabel?: ReactNode;
  formatOptions?: Intl.NumberFormatOptions;
}

export function ProgressBar({
  value = 0,
  maxValue = 100,
  size = "md",
  isIndeterminate = false,
  label,
  valueLabel,
  formatOptions,
  className,
  "aria-label": ariaLabel,
  ...props
}: ProgressBarProps) {
  const amount = percent(value, maxValue);
  const formatted = valueLabel ?? new Intl.NumberFormat(undefined, formatOptions).format(value);
  return (
    <div className={cx("flex w-full flex-col gap-1.5", className)} {...props}>
      {(label || valueLabel) && (
        <div className="flex min-w-0 items-baseline justify-between gap-3 text-caption-1-regular">
          {label ? <span className="min-w-0 truncate text-text-secondary">{label}</span> : <span />}
          {valueLabel !== undefined ? <span className="shrink-0 text-text-tertiary">{formatted}</span> : null}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={maxValue}
        aria-valuenow={isIndeterminate ? undefined : value}
        className={cx("relative w-full overflow-hidden rounded-full bg-background-tertiary-default", BAR_HEIGHT[size])}
      >
        {isIndeterminate ? (
          <span className="progress-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-accent-500" />
        ) : (
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-accent-500 transition-[width] duration-500 ease-out"
            style={{ width: `${amount}%` }}
          />
        )}
      </div>
    </div>
  );
}

export interface ProgressCircleProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  value?: number;
  maxValue?: number;
  size?: ProgressSize;
  isIndeterminate?: boolean;
  label?: ReactNode;
  valueLabel?: ReactNode;
}

export function ProgressCircle({
  value = 0,
  maxValue = 100,
  size = "md",
  isIndeterminate = false,
  className,
  "aria-label": ariaLabel,
  ...props
}: ProgressCircleProps) {
  const amount = percent(value, maxValue);
  const dimension = CIRCLE_SIZE[size];
  const stroke = size === "sm" ? 2 : 2.5;
  const radius = (dimension - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={maxValue}
      aria-valuenow={isIndeterminate ? undefined : value}
      className={cx("inline-flex shrink-0 items-center justify-center", isIndeterminate && "animate-spin", className)}
      style={{ width: dimension, height: dimension, "--progress-circumference": circumference } as CSSProperties}
      {...props}
    >
      <svg width={dimension} height={dimension} viewBox={`0 0 ${dimension} ${dimension}`} className="-rotate-90">
        <circle cx={dimension / 2} cy={dimension / 2} r={radius} fill="none" stroke="var(--color-background-tertiary-default)" strokeWidth={stroke} />
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent-500)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={isIndeterminate ? `${circumference * 0.28} ${circumference}` : `${circumference} ${circumference}`}
          strokeDashoffset={isIndeterminate ? 0 : circumference - (amount / 100) * circumference}
        />
      </svg>
    </span>
  );
}
