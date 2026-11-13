import { MessageSquare } from "@toph/icons";
import { PixelSpinner } from "@toph/ui";
import { cx } from "@toph/ui";
import { sessionWhen, sessionMessages } from "../sessions";

interface Props {
  title: string;
  activityAt: number;
  messageCount: number;
  running?: boolean;
  unread?: boolean;
  selected?: boolean;
  onOpen: () => void;
}

/** A session in the Toph screen: what it is about, when it last moved and whether the Toph is on it. */
export default function SessionRow({
  title,
  activityAt,
  messageCount,
  running = false,
  unread = false,
  selected = false,
  onOpen,
}: Props) {
  const state = running ? "Rodando agora" : sessionMessages(messageCount);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? "true" : undefined}
      aria-label={`${title}. ${state}${unread ? ". Resposta não lida" : ""}`}
      className={cx(
        "group flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 text-start transition-colors",
        selected ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover",
      )}
    >
      <span
        className={cx(
          "flex size-7 shrink-0 items-center justify-center rounded-lg",
          running ? "bg-accent-500/12 text-accent-600" : "bg-background-secondary-default text-text-tertiary",
        )}
        aria-hidden
      >
        {running ? <PixelSpinner size={14} /> : <MessageSquare className="size-3.5" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-caption-1-medium text-text-primary">{title}</span>
          {unread ? (
            <span
              className="size-1.5 shrink-0 rounded-full bg-accent-500"
              title="Resposta não lida"
              aria-label="Resposta não lida"
            />
          ) : null}
          <span className="ms-auto shrink-0 text-[10px] tabular-nums text-text-tertiary">{sessionWhen(activityAt)}</span>
        </span>
        <span className={cx("truncate text-caption-2-regular", running ? "text-accent-600" : "text-text-tertiary")}>
          {state}
        </span>
      </span>
    </button>
  );
}
