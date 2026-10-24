export default function BrandMark({ size = "small", className = "" }: { size?: "small" | "large" | ""; className?: string }) {
  const src = `${import.meta.env.BASE_URL}brand/toph-mark.png`;
  return (
    <span className={`brand-mark ${size} ${className}`.trim()} aria-hidden="true">
      <img src={src} alt="" />
    </span>
  );
}
