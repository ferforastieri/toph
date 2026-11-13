"use client";

import type { ReactNode, Ref } from "react";
import { RiInformationFill } from "@remixicon/react";
import type { LabelProps as AriaLabelProps } from "react-aria-components";
import { Label as AriaLabel } from "react-aria-components";
import { cx } from "@/shared/toph-ui/utils/cx";

/**
 * Field label. Wraps `react-aria-components`' Label so the parent `TextField`
 * automatically wires `htmlFor` / `aria-labelledby`.
 *
 * Visuals come from Figma:
 *   - Inter Medium 14/20, color text/primary
 *   - 2px gap between label + required asterisk + info icon
 *   - asterisk is text/error-primary (red/500)
 *   - info icon is 16×16 in foreground/icon/quaternary
 *
 * Pass `isRequired` to show the asterisk. Pass `tooltip` to show the info
 * icon (currently a static glyph — when the Tooltip component lands it'll
 * wire up here).
 */

export interface LabelProps extends AriaLabelProps {
  children: ReactNode;
  isRequired?: boolean;
  /** Reserved for invalid-aware styling (asterisk color, etc.) once we need it. */
  isInvalid?: boolean;
  /** Show the info icon next to the label. */
  tooltip?: boolean | string;
  ref?: Ref<HTMLLabelElement>;
}

export function Label({
  isRequired = false,
  isInvalid: _isInvalid,
  tooltip,
  className,
  children,
  ...props
}: LabelProps) {
  void _isInvalid;
  return (
    <AriaLabel
      data-label="true"
      {...props}
      className={cx("ac-field__label", className)}
    >
      {children}
      {isRequired && (
        <span aria-hidden="true" className="ac-field__error">
          *
        </span>
      )}
      {tooltip && (
        <RiInformationFill className="ac-icon" aria-hidden />
      )}
    </AriaLabel>
  );
}
