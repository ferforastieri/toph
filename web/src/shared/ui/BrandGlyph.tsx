import { cx } from "@toph/ui";

/**
 * The Toph mark as a monochrome glyph: it takes the current text color, so it
 * sits in a nav like the other icons (ink selected, faint otherwise).
 */
export default function BrandGlyph({
  size = 20,
  className,
  "aria-hidden": ariaHidden = true,
}: {
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}) {
  const mark = `${import.meta.env.BASE_URL}brand/toph-mark-eyeless.png?v=3`;
  return (
    <span
      className={cx("brand-glyph", className)}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url("${mark}")`,
        maskImage: `url("${mark}")`,
      }}
      aria-hidden={ariaHidden}
    />
  );
}
