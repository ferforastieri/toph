import { History, Settings2 } from "@toph/icons";
import type { MiniBot } from "../bots";
import BotAvatar from "./BotAvatar";
import { Button } from "@/boardui/base/buttons/button";
import { cx } from "@/boardui/utils/cx";

interface Props {
  bot: Pick<MiniBot, "id" | "name" | "role" | "color" | "avatar" | "coordinator">;
  active: boolean;
  onSelect: () => void;
  onConfig: () => void;
  onSessions: () => void;
  compact?: boolean;
}

/** Shared Toph row used by the desktop sidebar and the mobile conversations sheet. */
export default function TophRow({ bot, active, onSelect, onConfig, onSessions, compact = false }: Props) {
  return (
    <div
      className={cx(
        "flex w-full items-center rounded-xl pe-1 transition-[background-color,color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        active ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={cx("flex min-w-0 flex-1 items-center gap-2.5 text-start transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.99]", compact ? "px-2 py-1.5" : "px-2 py-2")}
      >
        <BotAvatar bot={bot} size={compact ? 28 : 32} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-caption-1-medium text-text-primary">{bot.name}</span>
            {bot.coordinator ? <span className="shrink-0 rounded-full bg-accent-500/15 px-1 text-[9px] font-medium text-accent-600">coord.</span> : null}
          </span>
          <span className="truncate text-caption-2-regular text-text-secondary">{bot.role || "Toph"}</span>
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size={compact ? "small" : "xs"} iconOnly leadingIcon={Settings2} aria-label={`Configurar ${bot.name}`} title="Configurar Toph" onClick={onConfig} />
        <Button variant="ghost" size={compact ? "small" : "xs"} iconOnly leadingIcon={History} aria-label={`Sessões de ${bot.name}`} title="Sessões do Toph" onClick={onSessions} />
      </span>
    </div>
  );
}
