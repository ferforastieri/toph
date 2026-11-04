import { useEffect, useState, type CSSProperties } from "react";
import type { MiniBot } from "../bots";
import { cx } from "@/boardui/utils/cx";
import { usePointerLook } from "../ui/usePointerLook";
import TophEyes, { TophColorOverlay } from "./TophEyes";

interface Props {
  bot: Pick<MiniBot, "name" | "color" | "avatar">;
  size?: number;
  className?: string;
  style?: CSSProperties;
  look?: boolean;
}

const AVATAR_BASE = `${import.meta.env.BASE_URL}tophs/`;
const CORE_AVATAR = `${AVATAR_BASE}toph-core.png`;

export default function BotAvatar({ bot, size = 36, className, style, look = true }: Props) {
  const source = `${AVATAR_BASE}${bot.avatar}.png`;
  const [image, setImage] = useState(source);
  const lookRef = usePointerLook<HTMLSpanElement>({ disabled: !look });
  const activeAvatar = image === CORE_AVATAR ? "toph-core" : bot.avatar;

  useEffect(() => setImage(source), [source]);

  return (
    <span
      ref={look ? lookRef : undefined}
      className={cx("relative isolate overflow-visible", className)}
      style={{ width: size, height: size, display: "inline-flex", flexShrink: 0, ...style }}
      title={bot.name}
      aria-hidden
    >
      <span className="pointer-events-none absolute inset-0 block">
        <img
          src={image}
          alt=""
          width={size}
          height={size}
          draggable={false}
          onError={() => { if (image !== CORE_AVATAR) setImage(CORE_AVATAR); }}
          className="size-full select-none object-contain grayscale drop-shadow-[0_1px_1px_rgba(0,0,0,0.18)]"
        />
        <TophColorOverlay color={bot.color} image={image} data-avatar-color={bot.color} />
      </span>
      {look ? (
        <TophEyes
          avatar={activeAvatar}
          image={image}
          color={bot.color}
          imageClassName="grayscale"
        />
      ) : null}
    </span>
  );
}
