import type { CSSProperties } from "react";
import type { BotAvatar as BotAvatarShape, MiniBot } from "../bots";

interface Props {
  bot: Pick<MiniBot, "name" | "color" | "avatar">;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

const SHAPES: Partial<Record<BotAvatarShape, string>> = {
  shield: "M24 3 43 10v12c0 10-8 17-19 22C13 39 5 32 5 22V10z",
  star: "M24 3l6.5 13.5L45 18l-10.5 10.2L37 43l-13-7.2L11 43l2.5-14.8L3 18l14.5-1.5z",
  diamond: "M24 3 44 20 24 45 4 20z",
  blob: "M24 4c10 0 18 6 19 14 1 8-4 13-9 18-5 5-10 8-17 5-8-4-13-10-13-19C4 12 12 4 24 4z",
  circle: "M24 3a21 21 0 1 1 0 42A21 21 0 0 1 24 3z",
  hexagon: "M24 3 42 13v22L24 45 6 35V13z",
  flower: "M24 4c5 0 8 5 6 9 4-2 9 0 9 5s-5 7-9 5c2 4-1 9-6 9s-8-5-6-9c-4 2-9 0-9-5s5-7 9-5c-2-4 1-9 6-9z",
  gear: "M24 4l4 6 7-2 2 7 6 4-4 6 4 6-6 4-2 7-7-2-4 6-4-6-7 2-2-7-6-4 4-6-4-6 6-4 2-7 7 2z",
  cloud: "M12 38c-5 0-9-4-9-9s4-9 9-9c1-6 6-10 12-10s11 4 12 10c5 0 9 4 9 9s-4 9-9 9z",
  leaf: "M24 4C12 10 6 20 8 34c14 2 26-6 32-18-4-8-10-12-16-12z",
  drop: "M24 3c8 12 16 19 16 27a16 16 0 0 1-32 0c0-8 8-15 16-27z",
  spark: "M24 3l4 15 15 6-15 4-4 17-4-17-15-4 15-6z",
  ring: "M24 3a21 21 0 1 0 0 42 21 21 0 0 0 0-42zm0 9a12 12 0 1 1 0 24 12 12 0 0 1 0-24z",
  wave: "M3 25c6-9 12-9 18 0s12 9 18 0v10c-6 7-12 7-18 0s-12-7-18 0z",
  ghost: "M24 4c-9 0-16 7-16 16v24l6-5 5 5 5-5 5 5 5-5 6 5V20c0-9-7-16-16-16z",
  egg: "M24 4c9 0 16 14 16 24a16 16 0 0 1-32 0C8 18 15 4 24 4z",
  square: "M8 8h32v32H8z",
  triangle: "M24 4 45 42H3z",
  moon: "M30 4a20 20 0 1 0 14 34A17 17 0 0 1 30 4z",
  cat: "M8 14 14 4l8 7h4l8-7 6 10v22a8 8 0 0 1-8 8H16a8 8 0 0 1-8-8z",
};

const MARK_AVATARS = new Set<BotAvatarShape>(["mark-smile", "mark-wink", "mark-cool", "mark-star", "mark-blush"]);

export default function BotAvatar({ bot, size = 36, className, style }: Props) {
  if (MARK_AVATARS.has(bot.avatar)) {
    const mark = "#FFB547";
    const ink = "#20251d";
    const wink = bot.avatar === "mark-wink";
    const cool = bot.avatar === "mark-cool";
    const star = bot.avatar === "mark-star";
    const blush = bot.avatar === "mark-blush";
    return (
      <span
        className={className}
        style={{ width: size, height: size, display: "inline-flex", flexShrink: 0, ...style }}
        aria-hidden
      >
        <svg viewBox="0 0 48 48" width={size} height={size} role="img">
          {/* Toph mark used as the character itself: the face lives inside the bars. */}
          <rect x="4" y="3" width="40" height="10" rx="5" fill={bot.color} />
          <rect x="8" y="16" width="32" height="12" rx="6" fill={mark} />
          <rect x="14" y="31" width="20" height="8" rx="4" fill={mark} opacity="0.92" />
          <rect x="20" y="42" width="8" height="3.5" rx="1.75" fill={mark} opacity="0.8" />
          <path d="M12 8c4-4 10-5 16-4" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" strokeLinecap="round" />
          {cool ? (
            <>
              <rect x="11" y="19.5" width="10" height="5" rx="2.5" fill={ink} />
              <rect x="26" y="19.5" width="10" height="5" rx="2.5" fill={ink} />
              <path d="M21 21.5h5" stroke={ink} strokeWidth="1.4" />
              <path d="M20 34.5c2.4 1.2 5.6 1.2 8 0" fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
            </>
          ) : star ? (
            <>
              <path d="m17 18.2 1.1 2.2 2.4.3-1.8 1.6.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.6 2.4-.3z" fill={ink} />
              <path d="m31 18.2 1.1 2.2 2.4.3-1.8 1.6.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.6 2.4-.3z" fill={ink} />
              <ellipse cx="24" cy="35" rx="2.8" ry="2.1" fill={ink} />
            </>
          ) : (
            <>
              <ellipse cx="18" cy="22" rx="2.1" ry="2.6" fill={ink} />
              {wink ? <path d="M27 22h5" stroke={ink} strokeWidth="2.1" strokeLinecap="round" /> : <ellipse cx="30" cy="22" rx="2.1" ry="2.6" fill={ink} />}
              <circle cx="18.7" cy="21.2" r="0.65" fill="#fff" opacity="0.9" />
              {!wink && <circle cx="30.7" cy="21.2" r="0.65" fill="#fff" opacity="0.9" />}
              <path d="M20 34.5c2.3 1.8 5.7 1.8 8 0" fill="none" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
            </>
          )}
          {blush && <><circle cx="12" cy="26" r="2" fill="rgba(255,120,120,0.4)" /><circle cx="36" cy="26" r="2" fill="rgba(255,120,120,0.4)" /></>}
        </svg>
      </span>
    );
  }

  const shape = SHAPES[bot.avatar] ?? SHAPES.shield!;
  return (
    <span
      className={className}
      style={{ width: size, height: size, display: "inline-flex", flexShrink: 0, ...style }}
      aria-hidden
    >
      <svg viewBox="0 0 48 48" width={size} height={size} role="img">
        <path d={shape} fill={bot.color} stroke="rgba(0,0,0,0.18)" strokeWidth="1.2" />
        <path d="M12 14c4-5 10-7 16-6" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="18.5" cy="23" rx="2.6" ry="3.3" fill="#20251d" />
        <ellipse cx="29.5" cy="23" rx="2.6" ry="3.3" fill="#20251d" />
        <circle cx="19.3" cy="21.9" r="0.8" fill="#fff" opacity="0.9" />
        <circle cx="30.3" cy="21.9" r="0.8" fill="#fff" opacity="0.9" />
        <path d="M20 30c2.4 2.1 5.6 2.1 8 0" fill="none" stroke="#20251d" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="13" cy="29" r="2" fill="rgba(255,120,120,0.28)" />
        <circle cx="35" cy="29" r="2" fill="rgba(255,120,120,0.28)" />
      </svg>
    </span>
  );
}
