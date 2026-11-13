import type { HTMLAttributes } from "react";
import { cx } from "../cx";

/**
 * A row of buttons that belong together. `attached` (the default) fuses them
 * into one control: the borders meet and only the ends keep their radius.
 */
export function ButtonGroup({
  label,
  attached = true,
  className,
  children,
  ...rest
}: {
  label?: string;
  attached?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx("ac-btngroup", !attached && "ac-btngroup--loose", className)}
      {...rest}
    >
      {children}
    </div>
  );
}
