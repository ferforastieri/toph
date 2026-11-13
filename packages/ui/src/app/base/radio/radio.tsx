"use client";

import type { ReactNode, Ref } from "react";
import {
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
} from "react-aria-components";
import type {
  RadioGroupProps as AriaRadioGroupProps,
  RadioProps as AriaRadioProps,
} from "react-aria-components";
import { cx } from "@toph/ui/app/utils/cx";

/**
 * Figma source: Board UI → radio_default_sm / radio_selected_sm (used in the
 * AI chat model picker, node 4035:6925) and the checkbox family tokens.
 *
 * Two sizes:
 *   md  16×16 dot, 6px inner, label Body 1/Medium (14)
 *   sm  14×14 dot, 5px inner, label Body 2/Medium (13)
 *
 * States:
 *   default   bg background/primary/default, 1px border/checkbox/default,
 *             shadow/xs
 *   selected  Button/Primary gradient (blue/500 → blue/600) with an inset
 *             blue ring + top highlight, white inner dot
 *   disabled  50% opacity, not-allowed cursor
 *
 * `RadioGroup` + `Radio` are built on React Aria (keyboard arrows, form
 * semantics, label association). The bare `RadioDot` glyph is also exported
 * for menu rows that manage selection themselves (e.g. Dropdown items acting
 * as a radio group), where a nested focusable radio would be invalid.
 */

export type RadioSize = "sm" | "md";

const dotStyles = {
  sm: {
    dot: "size-3.5",
    inner: "size-[5px]",
    selected:
      "bg-gradient-to-b from-accent-500 to-accent-600 shadow-[inset_0px_0px_0px_0.875px_var(--color-accent-500),inset_0px_1.75px_0px_0px_rgba(255,255,255,0.25)]",
    border: "border-[0.875px]",
    gap: "gap-2",
    label: "text-body-2-medium",
  },
  md: {
    dot: "size-4",
    inner: "size-1.5",
    selected:
      "bg-gradient-to-b from-accent-500 to-accent-600 shadow-[inset_0px_0px_0px_1px_var(--color-accent-500),inset_0px_2px_0px_0px_rgba(255,255,255,0.25)]",
    border: "border",
    gap: "gap-2",
    label: "text-body-medium",
  },
};

export interface RadioDotProps {
  selected?: boolean;
  size?: RadioSize;
  /** Draws the keyboard focus ring around the glyph. */
  focusVisible?: boolean;
  className?: string;
}

/**
 * The bare radio glyph — presentation only, no interaction or semantics.
 *
 * Select/deselect animates: the default bordered surface and the selected
 * gradient are stacked layers cross-fading over 200ms (a gradient background
 * can't transition directly), while the white inner dot scales in and out.
 */
export function RadioDot({ selected = false, size: _size = "sm", focusVisible = false, className }: RadioDotProps) {
  return (
    <span
      aria-hidden
      className={cx("ac-radio", className)}
      data-state={selected ? "checked" : "unchecked"}
      style={focusVisible ? { boxShadow: "var(--focus-ring)" } : undefined}
    >
      {selected ? <span className="ac-radio__dot" /> : null}
    </span>
  );
}

/* ------------------------------------------------------------------- group */

export interface RadioGroupProps extends Omit<AriaRadioGroupProps, "children"> {
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/** Wraps a set of Radios: arrow-key navigation, single selection, form value. */
export function RadioGroup({ className, children, ref, ...props }: RadioGroupProps) {
  return (
    <AriaRadioGroup
      ref={ref}
      {...props}
      className={(state) =>
        cx(
          "flex flex-col gap-2",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      {children}
    </AriaRadioGroup>
  );
}

/* ------------------------------------------------------------------- radio */

export interface RadioProps extends Omit<AriaRadioProps, "children"> {
  children?: ReactNode;
  size?: RadioSize;
  ref?: Ref<HTMLLabelElement>;
}

export function Radio({ className, children, size = "md", ref, ...props }: RadioProps) {
  const s = dotStyles[size];

  return (
    <AriaRadio
      ref={ref}
      {...props}
      className={(state) =>
        cx(
          "group inline-flex items-center select-none",
          s.gap,
          state.isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      {(state) => (
        <>
          <RadioDot selected={state.isSelected} size={size} focusVisible={state.isFocusVisible} />
          {children !== undefined && children !== null && (
            <span className={cx(s.label, "text-text-primary")}>{children}</span>
          )}
        </>
      )}
    </AriaRadio>
  );
}
