export default function BrandMark({ size = "small", className = "" }: { size?: "small" | "large" | ""; className?: string }) {
  const src = `${import.meta.env.BASE_URL}brand/toph-mark.png`;
  const sizeClass = size === "large" ? "size-14" : size === "small" ? "size-7" : "";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${sizeClass} ${className}`.trim()} aria-hidden="true">
      <img src={src} alt="" className="size-full object-contain" />
    </span>
  );
}
