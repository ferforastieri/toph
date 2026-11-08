import { Bot } from "@toph/icons";
import type { ChatToph } from "../../conversations/store";
import BotAvatar from "./BotAvatar";
import { cx } from "@/shared/boardui/utils/cx";

interface Props {
  tophs: ChatToph[];
  size?: number;
  className?: string;
}

/** A small cluster of the Tophs in a team, used as the team's picture. */
export default function TeamAvatar({ tophs, size = 28, className }: Props) {
  if (tophs.length === 0) {
    return (
      <span
        className={cx("flex shrink-0 items-center justify-center rounded-full bg-accent-500/12 text-accent-500", className)}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <Bot size={Math.round(size * 0.55)} />
      </span>
    );
  }
  const shown = tophs.slice(0, 3);
  const avatar = Math.round(size * 0.78);
  return (
    <span className={cx("flex shrink-0 items-center", className)} style={{ minWidth: size }} aria-label={`${tophs.length} Toph${tophs.length === 1 ? "" : "s"}`}>
      {shown.map((toph, index) => (
        <span
          key={toph.id}
          className={cx("inline-flex rounded-full ring-2 ring-background-primary-default", index > 0 && "-ms-2")}
          style={{ zIndex: shown.length - index }}
          title={toph.name}
        >
          <BotAvatar bot={toph} size={avatar} />
        </span>
      ))}
      {tophs.length > shown.length ? (
        <span
          className="-ms-2 flex shrink-0 items-center justify-center rounded-full bg-background-tertiary-default text-[9px] font-semibold text-text-secondary ring-2 ring-background-primary-default"
          style={{ width: avatar, height: avatar }}
        >
          +{tophs.length - shown.length}
        </span>
      ) : null}
    </span>
  );
}
