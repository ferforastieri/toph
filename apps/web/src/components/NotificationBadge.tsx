import { Bell } from "@toph/icons";
import { cx } from "@/boardui/utils/cx";

/** A single bell with the unread count inside it, used as the only notification mark. */
export default function NotificationBadge({ count, size = 18, tone = "accent", className }: { count: number; size?: number; tone?: "accent" | "light"; className?: string }) {
  if (count <= 0) return null;
  const bellTone = tone === "light" ? "fill-white text-white" : "fill-accent-500 text-accent-500";
  return (
    <span className={cx("relative inline-flex items-center justify-center", className)} aria-label={`${count} notificações não lidas`}>
      <Bell size={size} className={bellTone} />
      <span className="pointer-events-none absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 text-[8px] font-bold leading-none text-[#1b1b1b]">
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
