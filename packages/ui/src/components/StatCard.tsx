import type { ReactNode } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "../icons/Icon";

export type StatTone = "up" | "down" | "wait" | "neutral";

const TONE_ICON: Record<StatTone, IconName | null> = {
  up: "check",
  down: "alert",
  wait: "waiting",
  neutral: null,
};

/**
 * A number that matters: its name, the value, a delta that says its tone with
 * an icon as well as a color, and an optional footer that explains it. The
 * card never tints its ground; the delta is the only colored part.
 */
export function StatCard({
  label,
  value,
  delta,
  tone = "up",
  icon,
  footer,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  tone?: StatTone;
  icon?: IconName;
  footer?: ReactNode;
  className?: string;
}) {
  const DeltaIcon = TONE_ICON[tone];

  return (
    <div className={cx("ac-stat", className)}>
      <span className="ac-stat__label">
        {icon ? <Icon name={icon} size={14} /> : null}
        {label}
      </span>
      <span className="ac-stat__value">{value}</span>
      {delta ? (
        <span className={cx("ac-stat__delta", tone !== "up" && `ac-stat__delta--${tone}`)}>
          {DeltaIcon ? <Icon name={DeltaIcon} size={14} /> : null}
          {delta}
        </span>
      ) : null}
      {footer ? <span className="ac-stat__footer">{footer}</span> : null}
    </div>
  );
}
