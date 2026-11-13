import type { HTMLAttributes, Ref } from "react";
import { cx } from "@toph/ui/app/utils/cx";

type ChipVariant = "bold" | "subtle" | "caption";
type ChipColor = "orange" | "lime" | "rose" | "yellow" | "cyan" | "blue" | "purple" | "neutral" | "gray" | "soft";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
  color?: ChipColor;
  ref?: Ref<HTMLSpanElement>;
}

const colorClass: Record<ChipColor, string> = {
  orange: "ac-chip--orange",
  lime: "ac-chip--lime",
  rose: "ac-chip--rose",
  yellow: "ac-chip--yellow",
  cyan: "ac-chip--cyan",
  blue: "ac-chip--blue",
  purple: "ac-chip--purple",
  neutral: "ac-chip--muted",
  gray: "ac-chip--muted",
  soft: "ac-chip--muted",
};

/** A status or role chip, drawn with the Tophs chip. */
export function Chip({ variant: _variant = "bold", color = "neutral", className, ref, ...props }: ChipProps) {
  void _variant;
  return <span ref={ref} className={cx("ac-chip", colorClass[color], className)} {...props} />;
}
