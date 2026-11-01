import { useState, type ReactNode } from "react";
import { Dropdown, DropdownPopover, DropdownTrigger } from "@/boardui/base/dropdown/dropdown";
import { Modal } from "@/boardui/base/modal/modal";
import { useIsMobile } from "./useIsMobile";
import { cx } from "@/boardui/utils/cx";

export const COMPOSER_TRIGGER_CLASS =
  "flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-body-2-medium text-text-secondary outline-none transition-colors hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring";

interface Props {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
  popoverClassName?: string;
  contentClassName?: string;
}

export default function ComposerMenu({
  label,
  trigger,
  children,
  isOpen,
  onOpenChange,
  triggerClassName,
  popoverClassName,
  contentClassName,
}: Props) {
  const mobile = useIsMobile();
  const [localOpen, setLocalOpen] = useState(false);
  const open = isOpen ?? localOpen;
  const setOpen = (next: boolean) => {
    setLocalOpen(next);
    onOpenChange?.(next);
  };
  const close = () => setOpen(false);

  if (mobile) {
    return (
      <>
        <button
          type="button"
          aria-label={label}
          className={cx(COMPOSER_TRIGGER_CLASS, triggerClassName)}
          onClick={() => setOpen(true)}
        >
          {trigger}
        </button>
        <Modal
          isOpen={open}
          onClose={close}
          title={label}
          placement="bottom"
          size="sm"
          bodyClassName="p-2"
          swipeToClose
        >
          <div className={cx("max-h-[60dvh] overflow-y-auto", contentClassName)}>{children(close)}</div>
        </Modal>
      </>
    );
  }

  return (
    <Dropdown isOpen={open} onOpenChange={setOpen}>
      <DropdownTrigger
        aria-label={label}
        className={cx(COMPOSER_TRIGGER_CLASS, triggerClassName)}
      >
        {trigger}
      </DropdownTrigger>
      <DropdownPopover aria-label={label} placement="top start" className={popoverClassName}>
        <div className={contentClassName}>{children(close)}</div>
      </DropdownPopover>
    </Dropdown>
  );
}
