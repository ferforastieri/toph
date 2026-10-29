export default function BrandMark({ size = "small", className = "" }: { size?: "small" | "large" | ""; className?: string }) {
  const src = `${import.meta.env.BASE_URL}brand/toph-mark.png`;
  const pixels = size === "large" ? 56 : size === "small" ? 28 : undefined;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`.trim()}
      style={pixels ? { width: pixels, height: pixels } : undefined}
      aria-hidden="true"
    >
      <img src={src} alt="" className="block object-contain" style={{ width: "100%", height: "100%" }} />
    </span>
  );
}
