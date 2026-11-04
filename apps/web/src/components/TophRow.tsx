import { History } from "@toph/icons";
import type { ChatToph } from "../chats";
import BotAvatar from "./BotAvatar";
import { Button } from "@/boardui/base/buttons/button";
import { cx } from "@/boardui/utils/cx";

interface Props {
  toph: Pick<ChatToph, "id" | "name" | "role" | "color" | "avatar" | "coordinator">;
  onOpen: () => void;
  onSessions: () => void;
  compact?: boolean;
}

/** Toph row used by the desktop sidebar and the mobile chat sheet. */
export default function TophRow({ toph, onOpen, onSessions, compact = false }: Props) {
  return (
    <div className="flex w-full items-center rounded-xl pe-1 transition-[background-color,color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-background-primary-hover">
      <button
        type="button"
        onClick={onOpen}
        className={cx("flex min-w-0 flex-1 items-center gap-2.5 text-start transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.99]", compact ? "px-2 py-1.5" : "px-2 py-2")}
      >
        <BotAvatar bot={toph} size={compact ? 28 : 32} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-caption-1-medium text-text-primary">{toph.name}</span>
            {toph.coordinator ? <span className="shrink-0 rounded-full bg-accent-500/15 px-1 text-[9px] font-medium text-accent-600">coord.</span> : null}
          </span>
          <span className="truncate text-caption-2-regular text-text-secondary">{toph.role || "Toph"}</span>
        </span>
      </button>
      <Button variant="ghost" size={compact ? "small" : "xs"} iconOnly leadingIcon={History} aria-label={`Sessões de ${toph.name}`} title="Sessões do Toph" onClick={onSessions} />
    </div>
  );
}
