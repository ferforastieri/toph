import { History, MessageSquarePlus, Settings2, Trash2, UserRound, Users } from "@toph/icons";
import type { ChatToph } from "../../conversations/store";
import BotAvatar from "./BotAvatar";
import { Button } from "@/shared/boardui/base/buttons/button";
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
}

/** Toph row used by the desktop sidebar and the mobile chat sheet. */
export default function TophRow({ toph, onOpen, onNew, onConfig, onSessions, onRemove, compact = false, selected = false, groupCount = 0, groupNames = [] }: Props) {
  const actionVisibility = compact ? undefined : selected
    ? "opacity-100"
    : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";
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
          <span className="flex min-w-0 items-center gap-1 text-caption-2-regular text-text-secondary">
            <span className="truncate">{toph.role || "Toph"}</span>
            <span className="text-text-tertiary" aria-hidden="true">·</span>
            {groupCount > 0 ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-accent-600"><Users size={9} />em grupo</span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-text-tertiary"><UserRound size={9} />individual</span>
            )}
          </span>
        </span>
      </button>
      {onNew ? <Button variant="ghost" size={compact ? "small" : "xs"} iconOnly leadingIcon={MessageSquarePlus} aria-label={`Nova tarefa com ${toph.name}`} title="Nova tarefa" className={actionVisibility} onClick={onNew} /> : null}
      {onConfig ? <Button variant="ghost" size={compact ? "small" : "xs"} iconOnly leadingIcon={Settings2} aria-label={`Configurar ${toph.name}`} title="Configurar Toph" className={actionVisibility} onClick={onConfig} /> : null}
      {onSessions ? <Button variant="ghost" size={compact ? "small" : "xs"} iconOnly leadingIcon={History} aria-label={`Conversas de ${toph.name}`} title="Conversas do Toph" className={actionVisibility} onClick={onSessions} /> : null}
      {onRemove ? <Button variant="ghost" size={compact ? "small" : "xs"} iconOnly leadingIcon={Trash2} aria-label={`Apagar ${toph.name}`} title="Apagar Toph" className={cx("text-status-rose-text", actionVisibility)} onClick={onRemove} /> : null}
    </div>
  );
}
