import type { ReactNode } from "react";
import { cx } from "../cx";
import type { IconName } from "../icons/Icon";
import { Button } from "./Button";

export type SocialProvider = "github" | "google" | "apple" | "microsoft" | "email";

const PROVIDER_ICON: Record<SocialProvider, IconName> = {
  github: "repo",
  google: "globe",
  apple: "computer",
  microsoft: "grid",
  email: "mail",
};

/**
 * A sign-in with a provider: the same button as the rest (neutral, full width
 * in a form), its mark before the words. The label is the caller's, so the
 * sentence lives in the app's language.
 */
export function SocialButton({
  provider,
  label,
  block = true,
  loading,
  disabled,
  onClick,
  className,
}: {
  provider: SocialProvider;
  label: ReactNode;
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Button
      block={block}
      icon={PROVIDER_ICON[provider]}
      loading={loading}
      disabled={disabled}
      onClick={onClick}
      className={cx("ac-social", className)}
    >
      {label}
    </Button>
  );
}
