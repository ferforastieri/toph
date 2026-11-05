import { Bell } from "@toph/icons";
import { cx } from "@/boardui/utils/cx";

/** One standard notification mark: a bell with a round unread counter. */
export default function NotificationBadge({ count, size = 14, className }: { count: number; size?: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={cx("relative inline-flex items-center justify-center", className)} aria-label={`${count} notificações não lidas`}>
      <Bell size={size} />
      <span className="absolute -end-1.5 -top-1.5 flex min-w-3.5 items-center justify-center rounded-full bg-accent-500 px-1 text-[9px] font-semibold leading-3.5 text-[#1b1b1b]">
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
