import type { ButtonHTMLAttributes, ComponentType, ReactNode, Ref } from "react";
import { cx } from "@toph/ui";
import { directionalIconClass } from "@/shared/toph-ui/utils/directional-icon";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle" | "gray" | "separated" | "divided";
type ButtonSize = "medium" | "small" | "xs";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

const variantClass = (variant: ButtonVariant): string => {
  switch (variant) {
    case "primary": return "ac-btn--primary";
    case "ghost":
    case "subtle": return "ac-btn--ghost";
    case "danger": return "ac-btn--danger";
    case "secondary":
    case "gray":
    case "separated":
    case "divided":
    default: return "";
  }
};

const sizeClass = (size: ButtonSize): string =>
  size === "medium" ? "" : size === "small" ? "ac-btn--sm" : "ac-btn--xs";

/** A Tophs button: the app's shapes with Toph's own icon components. */
export function Button({
  variant = "primary",
  size = "medium",
  iconOnly = false,
  leadingIcon: Leading,
  trailingIcon: Trailing,
  children,
  className,
  type = "button",
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "ac-btn",
        variantClass(variant),
        sizeClass(size),
        iconOnly && "ac-btn--icon",
        className,
      )}
      {...props}
    >
      {Leading ? <Leading className={cx("ac-icon", directionalIconClass(Leading))} aria-hidden /> : null}
      {(!iconOnly || !Leading) && children}
      {!iconOnly && Trailing ? (
        <Trailing className={cx("ac-icon", directionalIconClass(Trailing))} aria-hidden />
      ) : null}
    </button>
  );
}
