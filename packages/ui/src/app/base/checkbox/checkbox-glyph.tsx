import { cx } from "@toph/ui/app/utils/cx";

export type CheckboxSize = "sm" | "md";

export const checkboxSizes: Record<
  CheckboxSize,
  { box: string; glyph: string; label: string; gap: string }
> = {
  md: { box: "size-4", glyph: "size-4", label: "text-body-medium", gap: "gap-2" },
  sm: { box: "size-3.5", glyph: "size-3.5", label: "text-body-2-medium", gap: "gap-1.5" },
};

export interface CheckboxGlyphState {
  isSelected: boolean;
  isIndeterminate: boolean;
  isFocusVisible: boolean;
  isDisabled: boolean;
  isHovered: boolean;
}

/**
 * The 16px (or 14px) checkbox box + tick/indeterminate glyph. Shared by the
 * standalone Checkbox and the CheckboxCard so their visuals stay identical.
 */
export function CheckboxGlyph({
  state,
  size = "md",
}: {
  state: CheckboxGlyphState;
  size?: CheckboxSize;
}) {
  const { isSelected, isIndeterminate, isFocusVisible, isDisabled } = state;
  const isMarked = isSelected || isIndeterminate;

  return (
    <span
      aria-hidden
      className={cx("ac-check", isDisabled && "opacity-50")}
      data-state={isIndeterminate ? "indeterminate" : isSelected ? "checked" : "unchecked"}
      data-size={size}
      style={isFocusVisible ? { boxShadow: "var(--focus-ring)" } : undefined}
    >
      {isMarked ? (
        <span className="ac-check__mark">
          <svg viewBox="0 0 16 16" fill="none" className="ac-check__svg">
            {isIndeterminate ? (
              <path d="M4.5 8H8H11.5" />
            ) : (
              <path d="M4 7.7002L6.64645 10.3466C6.84171 10.5419 7.15829 10.5419 7.35355 10.3466L12 5.7002" />
            )}
          </svg>
        </span>
      ) : null}
    </span>
  );
}
