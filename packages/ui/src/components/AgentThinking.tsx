import type { ReactNode } from "react";
import { cx } from "../cx";
import type { AgentColor } from "./AgentLook";
import { PixelSpinner } from "./PixelSpinner";

/**
 * The agent at work before it has words: the pixel orbit in its color, what it
 * is doing and three dots that keep the line alive. A sentence, never a bare
 * spinner, so the pause has a reason on screen.
 */
export function AgentThinking({
  label = "Pensando",
  detail,
  color,
  className,
}: {
  label?: ReactNode;
  /** The quieter line under it ("lendo 3 arquivos"). */
  detail?: ReactNode;
  color?: AgentColor;
  className?: string;
}) {
  return (
    <div className={cx("ac-thinking", className)} role="status">
      <PixelSpinner size={16} color={color} />
      <span className="ac-thinking__label">{label}</span>
      <span className="ac-thinking__dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {detail ? <span className="ac-thinking__detail">{detail}</span> : null}
    </div>
  );
}
