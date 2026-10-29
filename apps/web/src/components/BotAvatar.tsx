import type { CSSProperties } from "react";
import type { BotAvatar as BotAvatarShape, MiniBot } from "../bots";

interface Props {
  bot: Pick<MiniBot, "name" | "color" | "avatar">;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

const SHAPES: Record<BotAvatarShape, string> = {
  shield: "M24 3 43 10v12c0 10-8 17-19 22C13 39 5 32 5 22V10z",
  star: "M24 3l6.5 13.5L45 18l-10.5 10.2L37 43l-13-7.2L11 43l2.5-14.8L3 18l14.5-1.5z",
  diamond: "M24 3 44 20 24 45 4 20z",
  blob: "M24 4c10 0 18 6 19 14 1 8-4 13-9 18-5 5-10 8-17 5-8-4-13-10-13-19C4 12 12 4 24 4z",
  circle: "M24 3a21 21 0 1 1 0 42A21 21 0 0 1 24 3z",
};

export default function BotAvatar({ bot, size = 36, className, style }: Props) {
  const shape = SHAPES[bot.avatar] ?? SHAPES.shield;
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
