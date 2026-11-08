import { Bot, ChevronDown, Plus } from "@toph/icons";
import type { TophChat } from "../store";
import { Dropdown, DropdownDivider, DropdownItem, DropdownPopover, DropdownTrigger } from "@/shared/boardui/base/dropdown/dropdown";
import { cx } from "@/shared/boardui/utils/cx";

interface Props {
  chats: TophChat[];
  chat: TophChat | null;
  counts: Record<string, number>;
  compact?: boolean;
  onSelect: (chatId: string) => void;
  onCreate: () => void;
}

/** The normal conversation's title: the active team, with a switcher. */
export default function ChatTitle({ chats, chat, counts, compact = false, onSelect, onCreate }: Props) {
  const name = chat?.name?.trim() || "Equipe";
  const members = chat ? counts[chat.id] ?? 0 : 0;
  const description = chat?.description?.trim() || (members === 0 ? "Sem Tophs" : `${members} Toph${members === 1 ? "" : "s"} na equipe`);
  return (
    <Dropdown>
      <DropdownTrigger
        className={cx(
          "flex min-w-0 max-w-[min(420px,70vw)] items-center gap-2.5 rounded-xl px-1.5 text-start text-text-primary hover:bg-background-primary-hover",
          compact ? "py-1" : "py-1.5",
          !compact && "sm:min-w-[240px]",
        )}
        aria-label={`Trocar equipe. Atual: ${name}`}
      >
        <span className={cx("flex shrink-0 items-center justify-center rounded-full bg-accent-500/12 text-accent-500", compact ? "size-6" : "size-7")}>
          <Bot size={compact ? 14 : 16} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold leading-tight text-text-primary">{name}</span>
          <span className="truncate text-[11px] leading-tight text-text-tertiary">{description}</span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-text-tertiary" />
      </DropdownTrigger>
      <DropdownPopover aria-label="Trocar equipe" placement="bottom start" className="w-[min(340px,calc(100vw-32px))]">
        {chats.map((item) => {
          const count = counts[item.id] ?? 0;
          return (
            <DropdownItem key={item.id} selected={chat?.id === item.id} onSelect={() => onSelect(item.id)} className="gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-500/12 text-accent-500"><Bot size={14} /></span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-caption-1-semibold text-text-primary">{item.name || "Equipe"}</span>
                <span className="truncate text-caption-2-regular text-text-tertiary">{count} Toph{count === 1 ? "" : "s"}</span>
              </span>
            </DropdownItem>
          );
        })}
        <DropdownDivider />
        <DropdownItem onSelect={onCreate} className="gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background-tertiary-default text-accent-500"><Plus size={14} /></span>
          <span className="text-caption-1-semibold text-text-primary">Nova equipe</span>
        </DropdownItem>
      </DropdownPopover>
    </Dropdown>
  );
}
