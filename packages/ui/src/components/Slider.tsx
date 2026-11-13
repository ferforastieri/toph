"use client";

import { Slider as RSlider } from "radix-ui";
import type { ReactNode } from "react";
import { cx } from "../cx";

/**
 * A value (or a start and an end) picked on a track. Radix underneath: arrows
 * move by `step`, Page Up/Down by a bigger step, Home/End go to the ends. The
 * current value always shows beside the label, so the position is never the
 * only way to read it.
 */
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  format,
  disabled,
  className,
}: {
  /** One thumb for a single value, two for a range. */
  value: number[];
  onValueChange: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  label: ReactNode;
  format?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}) {
  const shown = value.map((item) => (format ? format(item) : String(item))).join(" – ");

  return (
    <div className={cx("ac-slider", disabled && "ac-slider--disabled", className)}>
      <div className="ac-slider__head">
        <span className="ac-slider__label">{label}</span>
        <output className="ac-slider__value">{shown}</output>
      </div>

      <RSlider.Root
        className="ac-slider__root"
        value={value}
        onValueChange={onValueChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={typeof label === "string" ? label : undefined}
      >
        <RSlider.Track className="ac-slider__track">
          <RSlider.Range className="ac-slider__range" />
        </RSlider.Track>
        {value.map((_, index) => (
          <RSlider.Thumb
            key={index}
            className="ac-slider__thumb"
            aria-label={value.length > 1 ? `${String(label)} ${index + 1}` : undefined}
          />
        ))}
      </RSlider.Root>
    </div>
  );
}
