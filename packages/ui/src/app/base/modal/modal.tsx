"use client";

import type { ReactNode } from "react";
import { Button } from "../../../components/Button";
import { Dialog, DialogBody, DialogFooter } from "../../../components/Dialog";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  /** A class of the app's own CSS for this dialog (its height, its inner layout). */
  className?: string;
  /** A class of the app's own CSS for the body. */
  bodyClassName?: string;
  /** Kept for the screens that ask for a phone sheet: Tophs has one dialog, the same on every screen. */
  placement?: "center" | "bottom";
  /** Accessible name when no visible title is supplied. */
  label?: string;
  /** Kept so the sheets need no change; the dialog itself is the kit's. */
  swipeToClose?: boolean;
}

/**
 * The app's one modal: the kit's `Dialog` itself, never a second frame over it — the
 * Tophs surface, border, radius, scrim, head and animation, and its own icons.
 */
const widths: Record<ModalSize, number> = { sm: 400, md: 520, lg: 680, xl: 900, full: 1120 };

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  bodyClassName,
  label,
}: ModalProps) {
  const bare = !title;
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title ?? label ?? ""}
      description={description}
      closeLabel="Fechar"
      width={widths[size]}
      className={className}
      bare={bare}
    >
      {bare ? (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon="close"
          className="ac-btn--glyph toph-modal-close"
          aria-label="Fechar"
          onClick={onClose}
        />
      ) : null}
      <DialogBody className={bodyClassName}>{children}</DialogBody>
      {footer ? <DialogFooter>{footer}</DialogFooter> : null}
    </Dialog>
  );
}
