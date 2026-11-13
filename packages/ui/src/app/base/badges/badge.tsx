import type { HTMLAttributes, Ref } from "react";
import { cx } from "@toph/ui/app/utils/cx";

type BadgeColor = "primary" | "neutral";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor;
  ref?: Ref<HTMLSpanElement>;
}

/** A small count, drawn as the Tophs count chip. */
export function Badge({ color = "neutral", className, ref, ...props }: BadgeProps) {
  return (
    <span
      ref={ref}
      className={cx("ac-chip", color === "primary" ? "ac-chip--accent" : "ac-chip--muted", className)}
      {...props}
    />
  );
}
