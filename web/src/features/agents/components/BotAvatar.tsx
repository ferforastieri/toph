import { useEffect, useState, type CSSProperties } from "react";
import type { ChatToph } from "../../conversations/store";
import { cx } from "@/shared/boardui/utils/cx";
import { usePointerLook } from "../../../shared/ui/usePointerLook";
import TophEyes, { TophColorOverlay } from "./TophEyes";

interface Props {
  bot: Pick<ChatToph, "name" | "color" | "avatar">;
  size?: number;
  className?: string;
  style?: CSSProperties;
  look?: boolean;
}

const AVATAR_BASE = `${import.meta.env.BASE_URL}tophs/`;
const AVATAR_VERSION = "?v=4";
const CORE_AVATAR = `${AVATAR_BASE}toph-core.png${AVATAR_VERSION}`;
const CORE_EYELESS = `${AVATAR_BASE}toph-core-eyeless.png${AVATAR_VERSION}`;

export default function BotAvatar({ bot, size = 36, className, style, look = true }: Props) {
  const source = `${AVATAR_BASE}${bot.avatar}.png${AVATAR_VERSION}`;
  const eyeless = `${AVATAR_BASE}${bot.avatar}-eyeless.png${AVATAR_VERSION}`;
  const [image, setImage] = useState(source);
  const lookRef = usePointerLook<HTMLSpanElement>({ disabled: !look });
  const core = image === CORE_AVATAR;
  const base = look ? (core ? CORE_EYELESS : eyeless) : image;
  const activeAvatar = core ? "toph-core" : bot.avatar;

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
          src={base}
          alt=""
          width={size}
          height={size}
          draggable={false}
          onError={() => { if (!core) setImage(CORE_AVATAR); }}
          className="size-full select-none object-contain grayscale drop-shadow-[0_1px_1px_rgba(0,0,0,0.18)]"
        />
        <TophColorOverlay color={bot.color} image={base} data-avatar-color={bot.color} />
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
