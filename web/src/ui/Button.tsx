import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

type Variant = "primary" | "ghost" | "quiet" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className = "", variant, size = "md", icon, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={[
        variant ? "ui-button" : "",
        variant ? `ui-button-${variant}` : "",
        size === "sm" ? "ui-button-sm" : "",
        className,
      ].filter(Boolean).join(" ")}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className = "", label, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={props.title ?? label}
      className={`ui-icon-button icon-button ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
});
