"use client";

import { cx } from "../cx";
import type { AgentAppearance } from "./AgentLook";
import { tophCharacterOf } from "./toph";

export type StickerMood = "celebrate" | "love" | "deal" | "thinking" | "wow" | "dizzy" | "wave";

export interface AgentStickerProps {
  /** The agent's look (color, eyes, accessory); its color picks which Toph shows. */
  appearance?: AgentAppearance;
  mood: StickerMood;
  /** Kept for the callers that played it once: a still sticker holds its frame anyway. */
  playFor?: number;
  /** The side in CSS pixels: about 88 in the picker, 120 in a message. */
  size?: number;
  /** Keeps stickers of different agents apart: the agent's id picks the character. */
  seed?: string;
  /** The accessible name ("Figurinha do Dev: comemorando"); without it the sticker is decorative. */
  label?: string;
  className?: string;
}

/**
 * One of an agent's stickers (ADR 0091): the agent's own Toph, still, in a mood that gives it a small motion
 * (a hop, a tilt) and stands still with reduced motion. No frame and no background: it stands on the page.
 */
export function AgentSticker({ appearance, mood, size = 120, seed, label, className }: AgentStickerProps) {
  const id = tophCharacterOf(seed ?? "", appearance?.color);
  return (
    <span
      className={cx("ac-sticker", className)}
      style={{ width: size, height: size }}
      data-mood={mood}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <img src={`/tophs/${id}.png`} alt="" width={size} height={size} draggable={false} className="ac-sticker__toph" />
    </span>
  );
}
