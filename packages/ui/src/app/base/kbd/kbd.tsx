import type { HTMLAttributes } from "react";
import { Kbd as TophKbd } from "@toph/ui";

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  ref?: React.Ref<HTMLElement>;
}

/** A keyboard hint, drawn by the Tophs design system. */
export function Kbd({ ref: _ref, ...props }: KbdProps) {
  return <TophKbd {...props} />;
}
