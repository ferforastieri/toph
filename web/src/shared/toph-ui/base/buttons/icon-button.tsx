import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentType, Ref } from "react";
import { cx } from "@toph/ui";
import { directionalIconClass } from "@/shared/toph-ui/utils/directional-icon";

type IconButtonSize = "medium" | "small" | "xs";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconComponent;
  size?: IconButtonSize;
  "aria-label": string;
  ref?: Ref<HTMLButtonElement>;
}

export interface IconLinkButtonProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> {
  icon: IconComponent;
  size?: IconButtonSize;
  "aria-label": string;
  ref?: Ref<HTMLAnchorElement>;
}

const sizeClass = (size: IconButtonSize): string =>
  size === "medium" ? "" : size === "small" ? "ac-btn--sm" : "ac-btn--xs";

const ghost = (className?: string): boolean =>
  Boolean(className && (/border-transparent|\bbg-transparent\b|\bborder-0\b/.test(className)));

/** An icon-only Tophs button, with Toph's own icon components. */
export function IconButton({
  icon: Icon,
  size = "medium",
  className,
  type = "button",
  ref,
  ...props
}: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "ac-btn ac-btn--icon",
        sizeClass(size),
        ghost(className) && "ac-btn--ghost",
        className,
      )}
      {...props}
    >
      <Icon className={cx("ac-icon", directionalIconClass(Icon))} aria-hidden />
    </button>
  );
}

/** Anchor counterpart to IconButton for external and navigational actions. */
export function IconLinkButton({
  icon: Icon,
  size = "medium",
  className,
  ref,
  ...props
}: IconLinkButtonProps) {
  return (
    <a
      ref={ref}
      className={cx(
        "ac-btn ac-btn--icon",
        sizeClass(size),
        ghost(className) && "ac-btn--ghost",
        className,
      )}
      {...props}
    >
      <Icon className={cx("ac-icon", directionalIconClass(Icon))} aria-hidden />
    </a>
  );
}
