import { Button, type ButtonProps } from "./Button";

/**
 * The × that closes a dialog, a banner, a panel or a tile. It is a ghost icon
 * button with a name, never a bare glyph: `label` is what a screen reader says.
 */
export function CloseButton({
  label = "Fechar",
  size = "md",
  variant = "ghost",
  ...rest
}: Omit<ButtonProps, "children" | "icon" | "iconOnly"> & { label?: string }) {
  return <Button variant={variant} size={size} icon="close" iconOnly aria-label={label} {...rest} />;
}
