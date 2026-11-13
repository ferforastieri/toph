"use client";

import type { ReactNode, Ref } from "react";
import type { TextProps as AriaTextProps } from "react-aria-components";
import { Text as AriaText } from "react-aria-components";
import { cx } from "@/shared/toph-ui/utils/cx";

/**
 * Caption text rendered below a field. Wraps `react-aria-components`' Text
 * so the parent `TextField` automatically wires `aria-describedby` (when
 * `slot="description"`) or `aria-errormessage` (when `slot="errorMessage"`).
 *
 * Visuals come from Figma:
 *   - Inter Medium 12/16, letter-spacing 0.15px
 *   - color text/secondary (default) or text/error-primary (invalid)
 *   - 1px top padding to align with the field's bottom edge
 */

export interface HintTextProps extends AriaTextProps {
  children: ReactNode;
  isInvalid?: boolean;
  ref?: Ref<HTMLElement>;
}

export function HintText({
  isInvalid = false,
  className,
  ...props
}: HintTextProps) {
  return (
    <AriaText
      slot={isInvalid ? "errorMessage" : "description"}
      {...props}
      className={cx(isInvalid ? "ac-field__error" : "ac-field__example", className)}
    />
  );
}
