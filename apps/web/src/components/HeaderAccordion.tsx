import { useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { Accordion, AccordionItem } from "@/boardui/base/accordion/accordion";
import { cx } from "@/boardui/utils/cx";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

interface Props {
  id: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  icon?: IconComponent;
  triggerClassName?: string;
  panelClassName?: string;
  contentClassName?: string;
  children: ReactNode;
}

/**
 * Header selectors use the actual BoardUI Accordion (not a nested dropdown),
 * so opening/closing has the same disclosure animation as the repo pager.
 * The panel floats below its trigger instead of pushing the header layout.
 */
export default function HeaderAccordion({
  id,
  isOpen,
  onOpenChange,
  title,
  icon,
  triggerClassName,
  panelClassName,
  contentClassName,
  children,
}: Props) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, onOpenChange]);

  return (
    <div ref={root} className="relative min-w-0">
      <Accordion
        expandedKeys={isOpen ? [id] : []}
        onExpandedChange={(keys) => onOpenChange(Array.from(keys).includes(id))}
      >
        <AccordionItem
          id={id}
          icon={icon}
          title={title}
          className="relative"
          triggerClassName={cx(
            "header-accordion-trigger min-h-6 gap-1 rounded-md px-1.5 py-0.5 text-start text-caption-1-regular",
            triggerClassName,
          )}
          panelClassName={cx("absolute top-full z-50 mt-1", panelClassName)}
          contentClassName="p-0"
        >
          <div className={cx("rounded-2xl border border-border-button-default bg-background-primary-default shadow-dropdown", contentClassName)}>
            {children}
          </div>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
