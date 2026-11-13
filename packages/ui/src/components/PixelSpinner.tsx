"use client";

import type { CSSProperties } from "react";
import { cx } from "../cx";
import { agentGradient } from "./AgentLook";
import type { AgentColor } from "./AgentLook";

export type PixelSpinnerSize = 14 | 16 | 24 | 32;

export interface PixelSpinnerProps {
  /** 14 (chips, rows), 16 (buttons), 24, 32. */
  size?: PixelSpinnerSize;
  /** The agent's color when the work is an agent's; neutral ink otherwise. */
  color?: AgentColor;
  /** Accessible name; without it the spinner is `aria-hidden`. */
  label?: string;
  className?: string;
}

/**
 * Our working indicator: a thin ring turning around its own axis, in the agent's color when the work is an
 * agent's and in the text's ink otherwise. Still under prefers-reduced-motion. Decorative unless `label` is
 * given: the chip or button next to it says what is happening.
 */
export function PixelSpinner({ size = 16, color, label, className }: PixelSpinnerProps) {
  const style = {
    width: size,
    height: size,
    ...(color ? { color: agentGradient(color)[1] } : {}),
  } as CSSProperties;
  return (
    <span
      className={cx("ac-spin", className)}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
