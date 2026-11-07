import { useState } from "react";
import { ChevronDown, Plus } from "@toph/icons";
import BrandMark from "@toph/brand";
import type { Project } from "../../../shared/api";
import {
  individualTophs,
  teamChat,
  tophForChat,
  useChats,
  type TophChat,
} from "../store";
import BotAvatar from "../../agents/components/BotAvatar";
import { Dropdown, DropdownDivider, DropdownItem, DropdownPopover, DropdownTrigger } from "@/shared/boardui/base/dropdown/dropdown";
import { cx } from "@/shared/boardui/utils/cx";

interface Props {
  project: Project;
  chat: TophChat | null;
  modelLabel?: string;
  compact?: boolean;
  onCreateToph: () => void;
}

/** Compact Toph selector used as the chat title: the Toph is the identity. */
export default function TophSwitcher({ project, chat, modelLabel = "", compact = false, onCreateToph }: Props) {
  const stored = useChats((state) => state.byProject[project.id]);
  const setActiveChat = useChats((state) => state.setActiveChat);
  const [open, setOpen] = useState(false);
  const tophs = individualTophs(stored);
  const team = teamChat(stored);
  const current = tophForChat(stored, chat?.id);
  const isTeam = chat?.kind === "team";
  const title = isTeam ? team?.name || "Equipe" : current?.name || "Toph";
  const subtitle = isTeam
    ? `${team?.description || "Conversa compartilhada"}`
    : [current?.role || "Toph", modelLabel].filter(Boolean).join(" · ");

  function select(chatId: string) {
    setActiveChat(project.id, chatId);
    setOpen(false);
  }

  function create() {
    setOpen(false);
    onCreateToph();
  }

  return (
    <Dropdown isOpen={open} onOpenChange={setOpen}>
      <DropdownTrigger
        className={cx(
          "flex min-w-0 max-w-[min(420px,70vw)] items-center gap-2 rounded-xl px-1.5 text-start text-text-primary hover:bg-background-primary-hover",
          compact ? "py-1" : "py-1.5",
          !compact && "sm:min-w-[240px]",
        )}
        aria-label={`Trocar Toph. Atual: ${title}`}
      >
        {isTeam ? (
          <span className={cx("flex shrink-0 items-center justify-center rounded-full bg-accent-500/12 text-accent-500", compact ? "size-7" : "size-8")}>
            <BrandMark size="small" className={compact ? "size-4" : "size-5"} />
          </span>
        ) : current ? (
          <BotAvatar bot={current} size={compact ? 28 : 32} />
        ) : (
          <span className={cx("flex shrink-0 items-center justify-center rounded-full bg-background-tertiary-default text-text-tertiary", compact ? "size-7" : "size-8")}>
            <BrandMark size="small" className={compact ? "size-4" : "size-5"} />
          </span>
        )}
        <span className="flex min-w-0 flex-col">
          <span className={cx("truncate font-semibold text-text-primary", compact ? "text-caption-1-semibold" : "text-body-2-medium")}>{title}</span>
          <span className="truncate text-[11px] leading-tight text-text-tertiary">{subtitle}</span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-text-tertiary" />
      </DropdownTrigger>
      <DropdownPopover aria-label="Trocar Toph" placement="bottom start" className="w-[min(340px,calc(100vw-32px))]">
        {tophs.map((toph) => (
          <DropdownItem
            key={toph.id}
            selected={chat?.id === toph.chatId}
            onSelect={() => select(toph.chatId)}
            className="gap-2.5"
          >
            <BotAvatar bot={toph} size={28} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-caption-1-semibold text-text-primary">{toph.name}</span>
              <span className="truncate text-caption-2-regular text-text-tertiary">{toph.role || "Toph"}</span>
            </span>
          </DropdownItem>
        ))}
        {team ? (
          <DropdownItem
            selected={chat?.id === team.id}
            onSelect={() => select(team.id)}
            className="gap-2.5"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-500/12 text-accent-500"><BrandMark size="small" className="size-4" /></span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-caption-1-semibold text-text-primary">{team.name || "Equipe"}</span>
              <span className="truncate text-caption-2-regular text-text-tertiary">Conversa compartilhada</span>
            </span>
          </DropdownItem>
        ) : null}
        <DropdownDivider />
        <DropdownItem onSelect={create} className="gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background-tertiary-default text-accent-500"><Plus className="size-4" /></span>
          <span className="text-caption-1-semibold text-text-primary">Novo Toph</span>
        </DropdownItem>
      </DropdownPopover>
    </Dropdown>
  );
}
