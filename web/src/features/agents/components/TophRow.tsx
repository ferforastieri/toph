import { useState } from "react";
import { History, MessageSquarePlus, MoreHorizontal, Settings2, Trash2, Users } from "@toph/icons";
import type { ChatToph } from "../../conversations/store";
import BotAvatar from "./BotAvatar";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Dropdown, DropdownDivider, DropdownItem, DropdownPopover, DropdownTrigger } from "@/shared/boardui/base/dropdown/dropdown";
import { cx } from "@/shared/boardui/utils/cx";

interface Props {
  toph: Pick<ChatToph, "id" | "name" | "role" | "color" | "avatar">;
  onOpen: () => void;
  onNew?: () => void;
  onConfig?: () => void;
  onSessions?: () => void;
  onRemove?: () => void;
  compact?: boolean;
  selected?: boolean;
  /** How many group tasks this Toph participates in. */
  groupCount?: number;
  /** Group names, used as the badge tooltip. */
  groupNames?: string[];
  /** Subject of the session this row opens, when there is one. */
  subject?: string;
  /** Unread answers for this Toph. */
  unread?: number;
}

/** Toph row used by the desktop sidebar and the mobile chat sheet. */
export default function TophRow({ toph, onOpen, onNew, onConfig, onSessions, onRemove, compact = false, selected = false, groupCount = 0, groupNames = [], subject = "", unread = 0 }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const actionVisibility = selected
    ? "opacity-100"
    : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";
  const hasActions = Boolean(onNew || onConfig || onSessions || onRemove);

  function run(action?: () => void) {
    setMenuOpen(false);
    action?.();
  }

  return (
    <div className={cx("group flex w-full items-center rounded-xl pe-1 transition-colors", selected ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover")}>
      <button
        type="button"
        onClick={onOpen}
        className={cx("flex min-w-0 flex-1 items-center gap-2.5 text-start transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.99]", compact ? "px-2 py-1.5" : "px-2 py-2")}
      >
        <BotAvatar bot={toph} size={compact ? 28 : 32} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-caption-1-medium text-text-primary">{toph.name}</span>
            {unread > 0 ? (
              <span
                className="flex size-2 shrink-0 rounded-full bg-accent-500 shadow-[0_0_0_2px_var(--color-background-primary-default)]"
                title={`${unread} resposta${unread === 1 ? "" : "s"} não lida${unread === 1 ? "" : "s"}`}
                aria-label={`${unread} resposta${unread === 1 ? "" : "s"} não lida${unread === 1 ? "" : "s"}`}
              />
            ) : null}
            <span className="max-w-[84px] shrink-0 truncate rounded-full bg-background-tertiary-default px-1.5 py-px text-[9px] font-medium text-text-tertiary" title={toph.role || "Toph"}>
              {toph.role || "Toph"}
            </span>
            {groupCount > 0 ? (
              <span
                title={groupNames.length > 0 ? `Em grupo: ${groupNames.join(", ")}` : `Em ${groupCount} grupo${groupCount === 1 ? "" : "s"}`}
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent-500/12 px-1.5 py-px text-[9px] font-semibold text-accent-600"
              >
                <Users size={9} />
                {groupCount > 1 ? groupCount : "grupo"}
              </span>
            ) : null}
          </span>
          <span className="min-w-0 truncate text-caption-2-regular text-text-tertiary" title={subject || undefined}>
            {subject || "sem tarefas"}
          </span>
        </span>
      </button>
      {compact && hasActions ? (
        <Dropdown isOpen={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownTrigger
            aria-label={`Ações de ${toph.name}`}
            className="me-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary hover:bg-background-primary-hover hover:text-text-primary"
          >
            <MoreHorizontal className="size-4" />
          </DropdownTrigger>
          <DropdownPopover aria-label={`Ações de ${toph.name}`} placement="bottom end" className="z-[140] w-56">
            {onNew ? (
              <DropdownItem onSelect={() => run(onNew)}>
                <MessageSquarePlus size={14} className="shrink-0 text-text-tertiary" /> Nova tarefa
              </DropdownItem>
            ) : null}
            {onConfig ? (
              <DropdownItem onSelect={() => run(onConfig)}>
                <Settings2 size={14} className="shrink-0 text-text-tertiary" /> Configurar Toph
              </DropdownItem>
            ) : null}
            {onSessions ? (
              <DropdownItem onSelect={() => run(onSessions)}>
                <History size={14} className="shrink-0 text-text-tertiary" /> Conversas do Toph
              </DropdownItem>
            ) : null}
            {onRemove ? (
              <>
                <DropdownDivider />
                <DropdownItem onSelect={() => run(onRemove)} className="text-status-rose-text">
                  <Trash2 size={14} className="shrink-0" /> Apagar Toph
                </DropdownItem>
              </>
            ) : null}
          </DropdownPopover>
        </Dropdown>
      ) : (
        <>
          {onNew ? <Button variant="ghost" size="xs" iconOnly leadingIcon={MessageSquarePlus} aria-label={`Nova tarefa com ${toph.name}`} title="Nova tarefa" className={actionVisibility} onClick={onNew} /> : null}
          {onConfig ? <Button variant="ghost" size="xs" iconOnly leadingIcon={Settings2} aria-label={`Configurar ${toph.name}`} title="Configurar Toph" className={actionVisibility} onClick={onConfig} /> : null}
          {onSessions ? <Button variant="ghost" size="xs" iconOnly leadingIcon={History} aria-label={`Conversas de ${toph.name}`} title="Conversas do Toph" className={actionVisibility} onClick={onSessions} /> : null}
          {onRemove ? <Button variant="ghost" size="xs" iconOnly leadingIcon={Trash2} aria-label={`Apagar ${toph.name}`} title="Apagar Toph" className={cx("text-status-rose-text", actionVisibility)} onClick={onRemove} /> : null}
        </>
      )}
    </div>
  );
}
