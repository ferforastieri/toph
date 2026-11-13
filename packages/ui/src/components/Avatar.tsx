"use client";

import type { HTMLAttributes } from "react";
import type { Expression } from "../agent/engine.js";
import { cx } from "../cx";
import { Icon } from "../icons/Icon";
import { initialsOf } from "../names";
import { recipeOfUrl } from "../person/engine.js";
import { canDrawPortraits, PersonPortrait } from "../person/PersonPortrait";
import { type AgentAppearance, appearanceStyle } from "./AgentLook";
import { type BadgePresence, PresenceBadge } from "./PresenceBadge";

export type AvatarKind = "person" | "agent";

/**
 * What the agent is doing: `thinking` and `writing` add the working halo,
 * `waiting` waits on a person, `sleeping` marks a paused agent. The mark
 * itself stays the same; the state is read from the tile's ring and the
 * words next to it.
 */
export type AgentState = "idle" | "thinking" | "writing" | "waiting" | "sleeping";

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  kind?: AvatarKind;
  /** Display name; initials are derived from it unless `initials` is given. */
  name: string;
  initials?: string;
  /** 18 (receipts), 24, 36 (default), 56 or 112px (the customizer preview). */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  imageUrl?: string | null;
  /** Agent is executing: the halo (same as `state="thinking"` unless `state` says otherwise). */
  running?: boolean;
  /** The living agent symbol's state (agents only). */
  state?: AgentState;
  /** The agent's look: color, eyes and an accessory (agents only). */
  appearance?: AgentAppearance;
  /**
   * The presence badge on the corner (ADR 0084): a person's (online, away, busy, hidden to themselves, offline) or
   * an agent's, from its work. Null or left out: none.
   */
  presence?: BadgePresence | null;
  /** The presence in words, on hover over the badge ("Ocupado"). */
  presenceLabel?: string;
  /** Set when no visible name is next to the avatar: exposes `name` to screen readers. */
  labelled?: boolean;
  /** A held expression (agents only), e.g. "happy" for a moment of joy. */
  expression?: Expression;
  /** Agents only: plays the face started by `playAgentReaction(reactionKey, …)` (a message id). */
  reactionKey?: string;
  /**
   * The tile: a rounded square with a hairline. On by default; off for the
   * 18px receipts (`xs`) and the 112px hero (`xl`).
   */
  framed?: boolean;
}

/**
 * The agent's mark: a flat tile in its colour with the agent glyph. No
 * character art and no assets to ship: the same component for every agent,
 * told apart by `appearance.color`.
 */
function AgentMark() {
  return (
    <span className="ac-avatar__agentmark" aria-hidden="true">
      <Icon name="agent" size={20} />
    </span>
  );
}

/**
 * One tile for everyone: a rounded square (radius 30% of the side) with a
 * hairline and a faint top highlight. People show their photo, their drawn
 * portrait or initials; agents show their glyph on a tile tinted by
 * `appearance.color`, with an optional presence badge on the corner.
 */
export function Avatar({
  kind = "person",
  name,
  initials,
  size = "md",
  imageUrl,
  running,
  state,
  appearance,
  presence,
  presenceLabel,
  labelled,
  expression,
  reactionKey,
  framed,
  className,
  style,
  ...rest
}: AvatarProps) {
  const tile = framed ?? (size !== "xs" && size !== "xl");
  const a11y = labelled ? ({ role: "img", "aria-label": name } as const) : ({ "aria-hidden": true } as const);
  const agent = kind === "agent";
  const mood: AgentState = state ?? (running ? "thinking" : "idle");
  // A photo that is a drawn portrait (ADR 0166) is drawn here from its recipe, crisp at this size.
  const portrait = !agent && imageUrl && canDrawPortraits() ? recipeOfUrl(imageUrl) : null;
  return (
    <span
      className={cx(
        "ac-avatar",
        kind === "agent" && "ac-avatar--agent",
        size !== "md" && `ac-avatar--${size}`,
        tile && "ac-avatar--framed",
        agent && mood !== "idle" && mood !== "waiting" && mood !== "sleeping" && "ac-avatar--running",
        agent && mood !== "idle" && `ac-avatar--${mood}`,
        className,
      )}
      {...a11y}
      data-kind={kind}
      data-state={agent ? mood : undefined}
      data-accessory={
        agent && appearance?.accessory && appearance.accessory !== "none" ? appearance.accessory : undefined
      }
      data-eyes={agent && appearance?.eyes && appearance.eyes !== "round" ? appearance.eyes : undefined}
      style={agent ? { ...appearanceStyle(appearance), ...style } : style}
      {...rest}
    >
      {agent ? (
        <AgentMark />
      ) : portrait ? (
        <PersonPortrait recipe={portrait} />
      ) : imageUrl ? (
        <img src={imageUrl} alt="" />
      ) : (
        <span className="ac-avatar__initials">{initials ?? initialsOf(name)}</span>
      )}
      {presence && (
        // Pixels of 1 px on the small faces, 1.5 px from the profile cards' 56 px up.
        <span className="ac-avatar__badge" title={presenceLabel}>
          <PresenceBadge presence={presence} size={size === "lg" || size === "xl" ? "lg" : "sm"} />
        </span>
      )}
    </span>
  );
}

/** Overlapping avatars (channel header, invitation). A span, so it may sit in a button (a vote's option, a pill). */
export function AvatarStack({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("ac-avatar-stack", className)} {...rest} />;
}
