import { Spinner } from "@toph/ui";
import { cx } from "@/shared/toph-ui/utils/cx";

interface Props {
  label: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const SPINNER: Record<NonNullable<Props["size"]>, number> = { sm: 14, md: 16, lg: 24 };

export default function LoadingState({ label, className, size = "sm" }: Props) {
  return (
    <div className={cx("flex w-full items-center gap-2 px-2 py-4 text-caption-1-regular text-text-secondary", className)} role="status">
      <Spinner size={SPINNER[size]} />
      <span>{label}</span>
    </div>
  );
}
