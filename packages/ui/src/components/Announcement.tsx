"use client";

import { type HTMLAttributes, type ReactNode, useState } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "../icons/Icon";
import { CloseButton } from "./CloseButton";

export type AnnouncementTone = "neutral" | "info" | "attention" | "done";

/**
 * Product news beside the content: an icon, a title, a line, an optional full
 * action and a dismiss that removes the card for this visit. It is not a
 * status message (that is `Notification`): nothing here says whether an action
 * worked.
 */
export function Announcement({
  title,
  description,
  icon = "bulb",
  tone = "neutral",
  action,
  dismissible = false,
  onClose,
  closeLabel = "Dispensar",
  className,
  ...rest
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  tone?: AnnouncementTone;
  /** Usually one full-width button or a link. */
  action?: ReactNode;
  dismissible?: boolean;
  onClose?: () => void;
  closeLabel?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "title">) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className={cx("ac-announce", tone !== "neutral" && `ac-announce--${tone}`, className)} role="note" {...rest}>
      <span className="ac-announce__key" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>

      <div className="ac-announce__text">
        <p className="ac-announce__title">{title}</p>
        {description ? <p className="ac-announce__desc">{description}</p> : null}
        {action ? <div className="ac-announce__action">{action}</div> : null}
      </div>

      {dismissible ? (
        <CloseButton
          size="sm"
          label={closeLabel}
          onClick={() => {
            setDismissed(true);
            onClose?.();
          }}
        />
      ) : null}
    </div>
  );
}
