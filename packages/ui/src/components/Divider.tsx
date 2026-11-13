"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";

/**
 * A rule between blocks. Horizontal by default; with a label the line breaks
 * around the words. Vertical divides controls sitting side by side.
 */
export function Divider({
  orientation = "horizontal",
  label,
  className,
  ...rest
}: {
  orientation?: "horizontal" | "vertical";
  label?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={typeof label === "string" ? label : undefined}
      className={cx("ac-rule", orientation === "vertical" && "ac-rule--vertical", className)}
      {...rest}
    >
      {label && orientation === "horizontal" ? <span className="ac-rule__label">{label}</span> : null}
    </div>
  );
}
