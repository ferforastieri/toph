import { ProgressBar } from "@/boardui/base/progress/progress";
import { cx } from "@/boardui/utils/cx";

interface Props {
  label: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export default function LoadingState({ label, className, size = "sm" }: Props) {
  return (
    <div className={cx("w-full px-2 py-4", className)}>
      <ProgressBar isIndeterminate size={size} label={label} aria-label={label} />
    </div>
  );
}
