import { Bell } from "@toph/icons";
import { cx } from "@/boardui/utils/cx";

/** One standard notification mark: a bell and a round unread counter. */
export default function NotificationBadge({ count, size = 14, className }: { count: number; size?: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={cx("inline-flex items-center gap-1", className)} aria-label={`${count} notificações não lidas`}>
      <Bell size={size} />
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-500 text-[9px] font-semibold leading-none text-[#1b1b1b]">
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
