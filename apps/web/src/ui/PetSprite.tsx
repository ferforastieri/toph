import { useEffect, useState } from "react";
import { Sparkles } from "@toph/icons";
import { cx } from "@/boardui/utils/cx";
import { petLevel, type PetKind } from "../pet";
import { usePointerLook } from "./usePointerLook";

const PET_BASE = `${import.meta.env.BASE_URL}tophs/`;
const FALLBACK = `${PET_BASE}toph-core.png`;

export default function PetSprite({
  kind,
  size = 44,
  commits = 0,
  animate = true,
  look = true,
  className,
}: {
  kind: PetKind;
  size?: number;
  commits?: number;
  animate?: boolean;
  look?: boolean;
  className?: string;
}) {
  const level = petLevel(commits);
  const source = `${PET_BASE}${kind}.png`;
  const [image, setImage] = useState(source);
  const lookRef = usePointerLook<HTMLSpanElement>();

  useEffect(() => setImage(source), [source]);

  return (
    <span
      ref={look ? lookRef : undefined}
      className={cx("relative inline-flex shrink-0 items-center justify-center", animate && "pet-bob", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Avatar Toph ${kind}, nível ${level}`}
    >
      {level >= 2 ? <span className={cx("absolute inset-[10%] rounded-full bg-accent-500/15 blur-md transition-all", level >= 4 && "inset-[4%] bg-accent-500/25")} /> : null}
      {level >= 4 ? <span className="absolute inset-[5%] rounded-full border border-accent-500/35" /> : null}
      <img
        src={image}
        alt=""
        draggable={false}
        onError={() => { if (image !== FALLBACK) setImage(FALLBACK); }}
        className="relative size-full select-none object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.18)] transition-[scale,filter] duration-500"
        style={{
          scale: String(0.82 + level * 0.045),
          transform: look ? "translate3d(var(--toph-look-x, 0px), var(--toph-look-y, 0px), 0) rotate(var(--toph-look-tilt, 0deg))" : undefined,
          filter: level >= 5 ? "saturate(1.16) brightness(1.06)" : level >= 3 ? "saturate(1.08)" : undefined,
        }}
      />
      {level >= 3 ? <Sparkles className="absolute right-0 top-0 size-[22%] text-status-amber-text drop-shadow-sm" /> : null}
      {level >= 5 ? <Sparkles className="absolute bottom-[4%] left-0 size-[18%] text-accent-500 drop-shadow-sm" /> : null}
    </span>
  );
}
