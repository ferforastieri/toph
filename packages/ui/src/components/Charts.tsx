import { useId } from "react";
import { cx } from "../cx";

export interface ChartDatum {
  label: string;
  value: number;
}

const W = 600;
const PAD = 10;

function scale(values: number[], height: number) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  return (value: number) => height - PAD - ((value - min) / span) * (height - PAD * 2);
}

/**
 * A series as a line with the area under it. It reads as a shape, not a chart
 * library: no axes, no ticks, the summary that matters lives beside it. Each
 * point carries its own `<title>` for a native tooltip.
 */
export function AreaChart({
  data,
  label,
  height = 220,
  color = "var(--agent)",
  className,
}: {
  data: ChartDatum[];
  /** Names the drawing for screen readers. */
  label: string;
  height?: number;
  color?: string;
  className?: string;
}) {
  const id = `ac-area-${useId().replace(/[^\w-]/g, "")}`;
  const y = scale(
    data.map((item) => item.value),
    height,
  );
  const x = (index: number) => PAD + (index / Math.max(1, data.length - 1)) * (W - PAD * 2);
  const points = data.map((item, index) => `${x(index)},${y(item.value)}`);
  const area = `M${x(0)},${height - PAD} L${points.join(" L")} L${x(data.length - 1)},${height - PAD} Z`;

  return (
    <svg
      className={cx("ac-chart", className)}
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.26" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0.25, 0.5, 0.75, 1].map((share) => (
        <line
          key={share}
          x1={PAD}
          x2={W - PAD}
          y1={PAD + share * (height - PAD * 2)}
          y2={PAD + share * (height - PAD * 2)}
          stroke="var(--line)"
          strokeWidth="1"
        />
      ))}

      <path d={area} fill={`url(#${id})`} />
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {data.map((item, index) => (
        <circle key={item.label} cx={x(index)} cy={y(item.value)} r={index === data.length - 1 ? 4 : 2.5} fill={color}>
          <title>{`${item.label}: ${item.value}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/**
 * Bars for a series, optionally a second one beside each (`compare`), e.g.
 * this year against last. The same restraint as `AreaChart`: the values live
 * in the row beside the drawing.
 */
export function BarChart({
  data,
  compare,
  label,
  height = 220,
  className,
}: {
  data: ChartDatum[];
  compare?: ChartDatum[];
  label: string;
  height?: number;
  className?: string;
}) {
  const values = [...data.map((item) => item.value), ...(compare ?? []).map((item) => item.value)];
  const y = scale(values, height);
  const series = compare ? 2 : 1;
  const slot = (W - PAD * 2) / Math.max(1, data.length);
  const bar = Math.min(26, (slot - 8) / series);

  return (
    <svg
      className={cx("ac-chart", className)}
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      {[0.25, 0.5, 0.75, 1].map((share) => (
        <line
          key={share}
          x1={PAD}
          x2={W - PAD}
          y1={PAD + share * (height - PAD * 2)}
          y2={PAD + share * (height - PAD * 2)}
          stroke="var(--line)"
          strokeWidth="1"
        />
      ))}

      {data.map((item, index) => {
        const left = PAD + index * slot + slot / 2 - (series * bar + (series - 1) * 4) / 2;
        const top = y(item.value);
        const pair = compare?.[index];
        return (
          <g key={item.label}>
            <rect x={left} y={top} width={bar} height={height - PAD - top} rx={4} fill="var(--agent)">
              <title>{`${item.label}: ${item.value}`}</title>
            </rect>
            {pair ? (
              <rect
                x={left + bar + 4}
                y={y(pair.value)}
                width={bar}
                height={height - PAD - y(pair.value)}
                rx={4}
                fill="var(--line-strong)"
                opacity="0.55"
              >
                <title>{`${pair.label}: ${pair.value}`}</title>
              </rect>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
