"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "../icons/Icon";
import { CloseButton } from "./CloseButton";

export type NotificationTone = "info" | "done" | "attention" | "danger";

const TONE_ICON: Record<NotificationTone, IconName> = {
  info: "info",
  done: "check",
  attention: "waiting",
  danger: "alert",
};

/**
 * A status message: what happened, in one line (and a quieter second one),
 * with an optional action and a close. `role="status"` so it is announced when
 * it arrives; the tone picks the icon, and the words still say the state.
 */
export function Notification({
  title,
  description,
  tone = "info",
  icon,
  action,
  onClose,
  closeLabel = "Fechar",
  className,
  ...rest
}: {
  title: ReactNode;
  description?: ReactNode;
  tone?: NotificationTone;
  /** Overrides the tone's icon. */
  icon?: IconName;
  action?: ReactNode;
  /** Shows the close button and calls this. */
  onClose?: () => void;
  closeLabel?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "title">) {
  return (
    <div role="status" className={cx("ac-notice", `ac-notice--${tone}`, className)} {...rest}>
      <span className="ac-notice__key" aria-hidden="true">
        <Icon name={icon ?? TONE_ICON[tone]} size={16} />
      </span>

      <div className="ac-notice__text">
        <p className="ac-notice__title">{title}</p>
        {description ? <p className="ac-notice__desc">{description}</p> : null}
      </div>

      {action ? <div className="ac-notice__action">{action}</div> : null}
      {onClose ? <CloseButton size="sm" label={closeLabel} onClick={onClose} /> : null}
    </div>
  );
}
