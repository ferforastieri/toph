import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  placement?: "bottom" | "top";
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  placeholder = "Select...",
  disabled = false,
  className = "",
  placement = "bottom",
}: SelectProps<T>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 });
  const selected = options.find((option) => option.value === value);

  function place() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const desired = Math.min(280, options.length * 34 + 10);
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    let side = placement;
    if (side === "bottom" && below < Math.min(desired, 120) && above > below) side = "top";
    if (side === "top" && above < Math.min(desired, 120) && below > above) side = "bottom";
    const maxHeight = Math.max(76, Math.min(280, desired, side === "top" ? above : below));
    const top = side === "top"
      ? Math.max(8, rect.top - maxHeight - 6)
      : Math.min(window.innerHeight - maxHeight - 8, rect.bottom + 6);
    setPosition({ top, left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)), width: rect.width, maxHeight });
  }

  useEffect(() => {
    if (!open) return;
    place();
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, options.length, placement]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`ui-select-trigger ${className}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((next) => !next)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={selected ? "" : "ui-select-placeholder"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={14} className={open ? "ui-select-chevron open" : "ui-select-chevron"} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="ui-select-menu"
          role="listbox"
          style={{
            top: position.top,
            left: position.left,
            width: position.width,
            maxHeight: position.maxHeight,
            overflowY: "auto",
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "active" : ""}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={13} />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
