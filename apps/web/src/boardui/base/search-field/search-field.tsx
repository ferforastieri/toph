"use client";

import { useRef, useState } from "react";
import type { ComponentType, ReactNode, Ref } from "react";
import { SearchField as AriaSearchField } from "react-aria-components";
import type { SearchFieldProps as AriaSearchFieldProps } from "react-aria-components";
import { LoaderCircle, Search } from "@toph/icons";
import { CloseButton } from "@/boardui/base/buttons/close-button";
import { HintText } from "@/boardui/base/input/hint-text";
import { InputBase } from "@/boardui/base/input/input";
import type { InputSize } from "@/boardui/base/input/input";
import { Label } from "@/boardui/base/input/label";
import { cx } from "@/boardui/utils/cx";

/**
 * Search field — Input's shell with a search icon and a clear button that
 * appears once the query has text. Based on BoardUI's SearchField, adapted
 * to Toph's local BoardUI copy.
 */

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface SearchFieldProps
  extends Omit<AriaSearchFieldProps, "className" | "children"> {
  label?: ReactNode;
  hint?: ReactNode;
  placeholder?: string;
  /** 36px (default) or 32px. */
  size?: InputSize;
  /** `pill` (default) or `rounded`, Input's corners. */
  shape?: "pill" | "rounded";
  /** Show a spinner in place of the icon while results load. */
  isLoading?: boolean;
  /** Replaces the search icon. */
  icon?: IconComponent;
  /** Accessible name of the clear button. */
  clearLabel?: string;
  /** Optional element after the clear button, e.g. a disclosure chevron. */
  endAddon?: ReactNode;
  className?: string;
  fieldClassName?: string;
  /** Ref to the inner input, useful for shortcut focus. */
  inputRef?: Ref<HTMLInputElement>;
}

export function SearchField({
  label,
  hint,
  placeholder,
  size = "medium",
  shape = "pill",
  isLoading = false,
  icon: Icon = Search,
  clearLabel = "Limpar busca",
  endAddon,
  value: controlledValue,
  defaultValue = "",
  onChange,
  onClear,
  "aria-label": ariaLabel,
  className,
  fieldClassName,
  inputRef: externalInputRef,
  ...props
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const value = controlledValue ?? uncontrolledValue;

  function change(next: string) {
    setUncontrolledValue(next);
    onChange?.(next);
  }

  function clear() {
    change("");
    onClear?.();
    inputRef.current?.focus();
  }

  return (
    <AriaSearchField
      {...props}
      value={value}
      onChange={change}
      onClear={onClear}
      aria-label={ariaLabel ?? (!label ? placeholder : undefined)}
      className={cx("group flex w-full flex-col items-start gap-1", className)}
    >
      {({ isEmpty, isDisabled, isInvalid }) => (
        <>
          {label ? (
            <Label isRequired={props.isRequired} isInvalid={isInvalid}>
              {label}
            </Label>
          ) : null}
          <InputBase
            ref={(node) => {
              inputRef.current = node;
              if (typeof externalInputRef === "function") externalInputRef(node);
              else if (externalInputRef) {
                (externalInputRef as { current: HTMLInputElement | null }).current = node;
              }
            }}
            size={size}
            placeholder={placeholder}
            fieldClassName={cx(
              shape === "pill" && "rounded-full",
              fieldClassName,
            )}
            className="[&::-webkit-search-cancel-button]:hidden"
            leadingAddon={
              <span aria-hidden className="relative ms-1 size-5 shrink-0">
                {isLoading ? (
                  <LoaderCircle className="absolute inset-0 size-5 animate-spin text-foreground-icon-secondary" />
                ) : (
                  <Icon className="absolute inset-0 size-5 text-foreground-icon-secondary" />
                )}
              </span>
            }
            trailingAddon={
              <div className="flex items-center gap-0.5">
                <CloseButton
                  size="2xs"
                  aria-label={clearLabel}
                  aria-hidden={isEmpty || undefined}
                  tabIndex={-1}
                  disabled={isDisabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clear}
                  className={cx(
                    "bg-background-tertiary-hover transition-[opacity,scale,color] duration-150 ease-out",
                    isEmpty || isDisabled
                      ? "pointer-events-none scale-50 opacity-0"
                      : "scale-100 opacity-100",
                  )}
                />
                {endAddon}
              </div>
            }
          />
          {hint ? <HintText isInvalid={isInvalid}>{hint}</HintText> : null}
        </>
      )}
    </AriaSearchField>
  );
}
