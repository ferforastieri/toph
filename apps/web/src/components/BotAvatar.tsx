import { useEffect, useState, type CSSProperties } from "react";
import type { MiniBot } from "../bots";

interface Props {
  bot: Pick<MiniBot, "name" | "color" | "avatar">;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

const AVATAR_BASE = `${import.meta.env.BASE_URL}tophs/`;
const CORE_AVATAR = `${AVATAR_BASE}toph-core.png`;

export default function BotAvatar({ bot, size = 36, className, style }: Props) {
  const source = `${AVATAR_BASE}${bot.avatar}.png`;
  const [image, setImage] = useState(source);

  useEffect(() => setImage(source), [source]);

  return (
    <span
      className={className}
      style={{ width: size, height: size, display: "inline-flex", flexShrink: 0, ...style }}
      title={bot.name}
      aria-hidden
    >
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        draggable={false}
        onError={() => { if (image !== CORE_AVATAR) setImage(CORE_AVATAR); }}
        className="size-full select-none object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.18)]"
      />
    </span>
  );
}
