import { Bot } from "@toph/icons";
import type { ChatToph, TophChat } from "../store";
import { cx } from "@/shared/boardui/utils/cx";

interface Props {
  chat: TophChat | null;
  tophs: ChatToph[];
  compact?: boolean;
}

/** The single normal conversation: a team title with its members. */
export default function ChatTitle({ chat, tophs, compact = false }: Props) {
  const name = chat?.name?.trim() || "Equipe";
  const description = chat?.description?.trim()
    || (tophs.length === 0 ? "Sem Tophs" : `${tophs.length} Toph${tophs.length === 1 ? "" : "s"} na equipe`);
  return (
    <div className="flex min-w-0 items-center gap-2.5 px-1">
      <span className={cx(
        "flex shrink-0 items-center justify-center rounded-full bg-accent-500/12 text-accent-500",
        compact ? "size-6" : "size-7",
      )}>
        <Bot size={compact ? 14 : 16} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] font-semibold leading-tight text-text-primary">{name}</span>
        <span className="truncate text-[11px] leading-tight text-text-tertiary">{description}</span>
      </span>
    </div>
  );
}
