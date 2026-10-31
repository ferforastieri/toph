"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RiCloseLine } from "@remixicon/react";
import { IconButton } from "@/boardui/base/buttons/icon-button";
import { cx } from "@/boardui/utils/cx";

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
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
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
          "absolute inset-0 cursor-default bg-black/60 transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === "string" ? title : undefined)}
        tabIndex={-1}
        style={swipeToClose && dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: dragging.current ? "none" : undefined } : undefined}
        onTouchStart={onSheetTouchStart}
        onTouchMove={onSheetTouchMove}
        onTouchEnd={onSheetTouchEnd}
        onTouchCancel={onSheetTouchEnd}
        className={cx(
          "relative flex w-full flex-col overflow-clip outline-none",
          "bg-background-primary-default shadow-xs",
          "transform-gpu transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
          visible ? "scale-100 opacity-100 blur-0" : "scale-[0.97] opacity-0 blur-[3px]",
          placement === "bottom"
            ? "max-h-[calc(100dvh-8px-var(--safe-top))] max-w-none rounded-t-3xl pb-[var(--safe-bottom)] ps-[var(--safe-left)] pe-[var(--safe-right)]"
            : cx("max-h-[calc(100dvh-32px-var(--safe-top)-var(--safe-bottom))] rounded-3xl", sizes[size]),
          className,
        )}
      >
        {swipeToClose && placement === "bottom" ? (
          <div data-sheet-drag className="flex shrink-0 touch-none justify-center pb-1 pt-2.5">
            <span className="h-1.5 w-10 rounded-full bg-border-button-default" />
          </div>
        ) : null}
        {(title || description) && (
          <header data-sheet-drag={swipeToClose ? true : undefined} className="flex shrink-0 touch-none items-start justify-between gap-4 border-b border-border-button-default px-5 py-4">
            <div className="flex min-w-0 flex-col gap-1">
              {title ? <h2 className="text-title-3-medium text-text-primary">{title}</h2> : null}
              {description ? <p className="text-body-regular text-text-secondary">{description}</p> : null}
            </div>
            <IconButton
              icon={RiCloseLine}
              size="small"
              aria-label="Fechar"
              onClick={onClose}
              className="rounded-full border-0 bg-background-tertiary-default text-foreground-icon-secondary shadow-none hover:bg-background-tertiary-hover"
            />
          </header>
        )}
        <div className={cx("min-h-0 flex-1 overflow-y-auto p-5", bodyClassName)}>{children}</div>
        {footer ? (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border-button-default px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
