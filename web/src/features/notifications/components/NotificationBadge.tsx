import { Bell } from "@toph/icons";
import { cx } from "@toph/ui";

/**
 * A muted bell with a compact unread-count pill. The count sits beside the
 * glyph, with a ring matching the surface so the two never blur together.
 */
export default function NotificationBadge({ count, size = 18, tone = "accent", className }: { count: number; size?: number; tone?: "accent" | "light"; className?: string }) {
  if (count <= 0) return null;
  const bellTone = tone === "light" ? "text-white" : "text-text-secondary";
  return (
    <span
      className={cx("relative inline-flex shrink-0 items-center justify-center", className)}
      aria-label={`${count} notificações não lidas`}
    >
      <Bell size={size} className={bellTone} />
      <span
        aria-hidden="true"
        className={cx(
          "absolute -end-1.5 -top-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-accent-500 px-1 text-[9px] font-semibold leading-none tabular-nums text-[#1b1b1b] shadow-sm",
          tone === "light" ? "ring-2 ring-white/25" : "ring-2 ring-background-primary-default",
        )}
      >
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
