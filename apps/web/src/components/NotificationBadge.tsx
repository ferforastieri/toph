import { Bell } from "@toph/icons";
import { cx } from "@/boardui/utils/cx";

/**
 * A muted bell with a small unread-count bubble. The count lives beside the
 * bell instead of inside it so the glyph keeps its shape at every size.
 */
export default function NotificationBadge({ count, size = 18, tone = "accent", className }: { count: number; size?: number; tone?: "accent" | "light"; className?: string }) {
  if (count <= 0) return null;
  const bellTone = tone === "light" ? "text-white" : "text-text-secondary";
  const badgeSize = Math.max(12, Math.round(size * 0.72));
  const fontSize = Math.max(7, Math.round(size * 0.38));
  return (
    <span
      className={cx("relative inline-flex shrink-0 items-center justify-center", className)}
      aria-label={`${count} notificações não lidas`}
    >
      <Bell size={size} className={bellTone} />
      <span
        aria-hidden="true"
        className="absolute -end-1.5 -top-1.5 flex items-center justify-center rounded-full bg-accent-500 px-0.5 font-bold leading-none tabular-nums text-[#1b1b1b] shadow-sm"
        style={{ minWidth: badgeSize, height: badgeSize, fontSize }}
      >
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
