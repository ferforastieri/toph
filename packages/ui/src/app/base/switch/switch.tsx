"use client";

import type { ReactNode, Ref } from "react";
import { Switch as AriaSwitch } from "react-aria-components";
import type { SwitchProps as AriaSwitchProps } from "react-aria-components";
import { cx } from "@toph/ui/app/utils/cx";

/**
 * Figma source: Board UI → "Toogles" (node 3856:3807).
 *
 * Two shapes × three sizes, plus off / on:
 *   shape   pill        (Figma "fully rounded") — track & thumb rounded-full
 *           rectangle   (Figma "rectangle")     — track radius/md-scale, thumb radius/xs-scale
 *   size    sm 28×16 · md 42×24 · lg 56×32   (track w×h; thumb = h − 2·pad)
 *
 * Anatomy (all values 1:1 with Figma):
 *   track   off → bg background/tertiary/default (#ebebeb, no border)
 *           on  → Button/Primary gradient (blue/500 → blue/600) + an inset
 *                 ring + top highlight that scales with size. lg is exactly
 *                 the shared `--shadow-checkbox-selected` token; md/sm scale
 *                 the ring (0.75px / 0.5px) and highlight (1.5px / 1px).
 *   thumb   theme-stable white gradient + contact shadow,
 *           slides by (w − thumb − 2·pad) between states.
 *   chip    small embossed inset in the thumb centre:
 *           off → white→neutral-100 in light mode; in dark mode it matches
 *                 the track so the mark reads like a hole through the thumb;
 *           on  → switch-on-chip-start→end (accent mixes matching Figma's
 *                 raw #2473fe→#0450e2 for blue), accent/600 border.
 *
 * The track visual lives in `SwitchTrack` so `Switch` and `SwitchCard` share it
 * (mirrors how Checkbox / CheckboxCard share `CheckboxGlyph`). Built on
 * react-aria Switch: native toggle semantics, keyboard support, focus-visible
 * ring, optional label via `children`.
 */

export type SwitchSize = "sm" | "md" | "lg";
export type SwitchShape = "pill" | "rectangle";

export interface SwitchVisualState {
  isSelected: boolean;
  isDisabled: boolean;
  isFocusVisible: boolean;
}

/**
 * The track + thumb + chip visual. Pure presentation — the react-aria Switch
 * (in `Switch` or `SwitchCard`) owns the input and passes its render state in.
 */
export function SwitchTrack({
  state,
  size: _size = "md",
  shape: _shape = "pill",
}: {
  state: SwitchVisualState;
  size?: SwitchSize;
  shape?: SwitchShape;
}) {
  return (
    <span
      aria-hidden
      className="ac-switch"
      data-state={state.isSelected ? "checked" : "unchecked"}
      data-disabled={state.isDisabled ? "true" : undefined}
      style={state.isFocusVisible ? { boxShadow: "var(--focus-ring)" } : undefined}
    >
      <span className="ac-switch__thumb" />
    </span>
  );
}

export interface SwitchProps extends Omit<AriaSwitchProps, "children"> {
  children?: ReactNode;
  size?: SwitchSize;
  shape?: SwitchShape;
  ref?: Ref<HTMLLabelElement>;
}

export function Switch({ className, children, size = "md", shape = "pill", ref, ...props }: SwitchProps) {
  return (
    <AriaSwitch
      ref={ref}
      {...props}
      className={(state) =>
        cx(
          "group inline-flex items-center gap-2 select-none",
          state.isDisabled ? "cursor-not-allowed" : "cursor-pointer",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      {(state) => (
        <>
          <SwitchTrack state={state} size={size} shape={shape} />
          {children != null && children !== false && (
            <span className="text-body-medium text-text-primary">{children}</span>
          )}
        </>
      )}
    </AriaSwitch>
  );
}
