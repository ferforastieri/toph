"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RiCloseLine } from "@remixicon/react";
import { IconButton } from "../buttons/icon-button";
import { cx } from "@toph/ui/app/utils/cx";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  className?: string;
  bodyClassName?: string;
  /** Center on desktop; bottom sheets are used by the compact mobile shell. */
  placement?: "center" | "bottom";
  /** Accessible name when no visible title is supplied. */
  label?: string;
  /** Bottom sheets: show a grabber and allow closing with a downward swipe. */
  swipeToClose?: boolean;
}

const sizes: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[calc(100vw-32px)]",
};

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
  placement = "center",
  label,
  swipeToClose = false,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [dragY, setDragY] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const dragStart = useRef<number | null>(null);
  const dragDistance = useRef(0);
  const dragging = useRef(false);

  function onSheetTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (!swipeToClose || placement !== "bottom" || !(event.target as HTMLElement).closest("[data-sheet-drag]")) return;
    dragStart.current = event.touches[0]?.clientY ?? null;
    dragDistance.current = 0;
    dragging.current = true;
  }

  function onSheetTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (dragStart.current == null) return;
    const distance = Math.max(0, (event.touches[0]?.clientY ?? dragStart.current) - dragStart.current);
    dragDistance.current = distance;
    setDragY(distance);
  }

  function onSheetTouchEnd() {
    if (dragStart.current == null) return;
    const shouldClose = dragDistance.current > 110;
    dragStart.current = null;
    dragging.current = false;
    dragDistance.current = 0;
    setDragY(0);
    if (shouldClose) onClose();
  }

  useEffect(() => {
    if (isOpen) {
      if (timer.current) window.clearTimeout(timer.current);
      setMounted(true);
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    timer.current = window.setTimeout(() => setMounted(false), 220);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cx(
        "fixed inset-0 z-100 flex justify-center",
        placement === "bottom"
          ? "items-end"
          : "items-center pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--safe-bottom)+1rem)] ps-[calc(var(--safe-left)+1rem)] pe-[calc(var(--safe-right)+1rem)]",
      )}
      role="presentation"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fechar"
        onClick={onClose}
        className={cx(
          "toph-modal-backdrop absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px] transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === "string" ? title : undefined)}
        tabIndex={-1}
        style={{
          // The kit's .ac-dialog__head/.ac-dialog__body read this; the modal
          // does not carry .ac-dialog itself (it has its own frame).
          "--dialog-pad": "20px",
          ...(swipeToClose && dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: dragging.current ? "none" : undefined } : {}),
        } as CSSProperties}
        onTouchStart={onSheetTouchStart}
        onTouchMove={onSheetTouchMove}
        onTouchEnd={onSheetTouchEnd}
        onTouchCancel={onSheetTouchEnd}
        className={cx(
          "relative flex w-full flex-col overflow-clip font-sans outline-none",
          "border border-border-button-white bg-background-primary-default text-text-primary shadow-sidebar",
          "transform-gpu transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
          visible ? "scale-100 opacity-100 blur-0" : "scale-[0.97] opacity-0 blur-[3px]",
          placement === "bottom"
            ? "max-h-[calc(100dvh-8px-var(--safe-top))] max-w-none rounded-t-[var(--radius-lg)] pb-[var(--safe-bottom)] ps-[var(--safe-left)] pe-[var(--safe-right)]"
            : cx("max-h-[calc(100dvh-32px-var(--safe-top)-var(--safe-bottom))] rounded-[var(--radius-lg)]", sizes[size]),
          className,
        )}
      >
        {swipeToClose && placement === "bottom" ? (
          <div data-sheet-drag className="flex shrink-0 touch-none justify-center pb-1 pt-2.5">
            <span className="h-1.5 w-10 rounded-full bg-border-button-default" />
          </div>
        ) : null}
        {(title || description) && (
          <header data-sheet-drag={swipeToClose ? true : undefined} className="ac-dialog__head shrink-0 touch-none items-start justify-between">
            <div className="ac-dialog__titles min-w-0">
              {title ? <h2 className="ac-dialog__title">{title}</h2> : null}
              {description ? <p className="ac-dialog__sub">{description}</p> : null}
            </div>
            <IconButton
              icon={RiCloseLine}
              size="small"
              aria-label="Fechar"
              onClick={onClose}
              className="ac-btn--ghost rounded-full"
            />
          </header>
        )}
        {!title && !description ? (
          <IconButton
            icon={RiCloseLine}
            size="small"
            aria-label="Fechar"
            onClick={onClose}
            className="ac-btn--ghost absolute end-3 top-3 z-10 rounded-full"
          />
        ) : null}
        <div className={cx("ac-dialog__body min-h-0 flex-1", bodyClassName)}>{children}</div>
        {footer ? (
          <footer className="ac-dialog__foot flex shrink-0 items-center justify-end gap-2 px-5 pb-5 pt-1">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
