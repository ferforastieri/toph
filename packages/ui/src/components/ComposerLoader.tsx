"use client";

import { cx } from "../cx";

/**
 * The band of light that crosses the composer while the agent works: no text,
 * no percentage, only the state the surrounding words already say. A
 * `progressbar` with an indeterminate value for screen readers; still under
 * reduced motion.
 */
export function ComposerLoader({
  label = "Trabalhando",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cx("ac-composerloader", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="ac-composerloader__band" aria-hidden="true" />
    </div>
  );
}
