import { clsx, type ClassValue } from "clsx";

/**
 * Join the classes of a control. The app is plain CSS now: the kit's classes
 * (ac-*) and the app's own blocks, never utilities that need a build step, so
 * a later class simply comes after the earlier one in the string.
 */
export const cx = (...classes: ClassValue[]) => clsx(classes);

/**
 * Identity helper that gives the classes of a style object one place.
 */
export function sortCx<
  T extends Record<
    string,
    string | number | Record<string, string | number | Record<string, string | number>>
  >,
>(classes: T): T {
  return classes;
}
