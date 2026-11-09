import { Plus, Users } from "@toph/icons";
import { cx } from "@/shared/boardui/utils/cx";

interface Props {
  onCreateToph: () => void;
  onCreateGroup: () => void;
  compact?: boolean;
}

/** The two primary entries of the Tophs screen: a single Toph or a group task. */
export default function TophStartActions({ onCreateToph, onCreateGroup, compact = false }: Props) {
  return (
    <div className={cx("grid grid-cols-2", compact ? "gap-1.5" : "gap-2")}>
      <button
        type="button"
        onClick={onCreateToph}
        className={cx(
          "group relative overflow-hidden rounded-2xl border border-accent-500/30 bg-accent-500/[0.07] text-start transition-[transform,background-color,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-accent-500/45 hover:bg-accent-500/[0.11] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          compact ? "rounded-xl p-2.5" : "p-3",
        )}
      >
        <span className="pointer-events-none absolute -end-5 -top-7 size-20 rounded-full bg-accent-500/15 blur-2xl transition-transform duration-500 group-hover:scale-125" />
        <span className={cx(
          "relative flex items-center justify-center rounded-xl bg-accent-500 text-[#1b1b1b] shadow-sm",
          compact ? "size-7" : "size-9",
        )}>
          <Plus size={compact ? 15 : 18} strokeWidth={2.5} />
        </span>
        <span className={cx("relative mt-2 block text-text-primary", compact ? "text-caption-1-semibold" : "text-body-2-medium")}>Novo Toph</span>
        <span className="relative block truncate text-caption-2-regular text-text-tertiary">Escolha um perfil</span>
      </button>
      <button
        type="button"
        onClick={onCreateGroup}
        className={cx(
          "group relative overflow-hidden rounded-2xl border border-border-button-white bg-background-secondary-default text-start transition-[transform,background-color,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-border-button-hover hover:bg-background-primary-hover active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          compact ? "rounded-xl p-2.5" : "p-3",
        )}
      >
        <span className="pointer-events-none absolute -end-5 -top-7 size-20 rounded-full bg-foreground-icon-primary/[0.06] blur-2xl transition-transform duration-500 group-hover:scale-125" />
        <span className={cx(
          "relative flex items-center justify-center rounded-xl border border-border-button-default bg-background-tertiary-default text-text-primary shadow-xs",
          compact ? "size-7" : "size-9",
        )}>
          <Users size={compact ? 14 : 17} />
        </span>
        <span className={cx("relative mt-2 block text-text-primary", compact ? "text-caption-1-semibold" : "text-body-2-medium")}>Novo grupo</span>
        <span className="relative block truncate text-caption-2-regular text-text-tertiary">Junte 2+ Tophs</span>
      </button>
    </div>
  );
}
