"use client";

import { useLocale } from "react-aria-components";

export type Direction = "ltr" | "rtl";

/** Also works inside a React Aria I18nProvider. */
export function useDirection(): Direction {
  return useLocale().direction;
}
