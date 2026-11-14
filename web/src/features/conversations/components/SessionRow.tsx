import { MessageSquare, Trash2 } from "@toph/icons";
import { PixelSpinner } from "@toph/ui";
import { cx } from "@toph/ui";
import { IconButton } from "@toph/ui/app";
import { sessionWhen } from "../sessions";

interface Props {
  title: string;
  activityAt: number;
  running?: boolean;
  unread?: boolean;
  selected?: boolean;
  onOpen: () => void;
  /** When the harness allows deleting the conversation: the trash appears on hover. */
  onDelete?: () => void;
}

/** A session in the Toph screen: what it is about, when it last moved and whether the Toph is on it. */
export default function SessionRow({
  title,
  activityAt,
  running = false,
  unread = false,
  selected = false,
  onOpen,
  onDelete,
}: Props) {
  const state = running ? "Rodando agora" : "";
  return (
    <div className={cx("group relative flex min-w-0 items-center", selected && "rounded-xl bg-background-tertiary-default")}>
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? "true" : undefined}
        aria-label={`${title}${state ? `. ${state}` : ""}${unread ? ". Resposta não lida" : ""}`}
        className={cx(
          "flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 text-start transition-colors",
          onDelete && "pe-9",
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
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
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
      </button>
      {onDelete ? (
        <IconButton
          icon={Trash2}
          size="xs"
          aria-label={`Apagar ${title}`}
          title="Apagar conversa"
          className="absolute end-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        />
      ) : null}
    </div>
  );
}
