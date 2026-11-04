import type { CSSProperties, HTMLAttributes } from "react";
import { cx } from "@/boardui/utils/cx";
import { TOPH_EYES, type TophEyeBox } from "../tophEyes";

/** Extra room around each eye so the patch always covers the original eye. */
const EYE_PAD_X = 18;
const EYE_PAD_Y = 10;
const EYE_BLUR = "4 2";

const EYE_TRANSFORM = "translate3d(var(--toph-look-x, 0px), var(--toph-look-y, 0px), 0)";

function eyeMask(box: TophEyeBox): string {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rx = box.w / 2 + EYE_PAD_X;
  const ry = box.h / 2 + EYE_PAD_Y;
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">',
    '<defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%">',
    `<feGaussianBlur stdDeviation="${EYE_BLUR}"/>`,
    "</filter></defs>",
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white" filter="url(#b)"/>`,
    "</svg>",
  ].join("");
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function avatarColorStyle(color: string, image: string): CSSProperties {
  return {
    backgroundColor: color,
    WebkitMaskImage: `url("${image}")`,
    maskImage: `url("${image}")`,
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    mixBlendMode: "color",
  };
}

interface ColorOverlayProps extends HTMLAttributes<HTMLSpanElement> {
  color: string;
  image: string;
}

export function TophColorOverlay({ color, image, className, style, ...props }: ColorOverlayProps) {
  return (
    <span
      {...props}
      className={cx("pointer-events-none absolute inset-0 size-full", className)}
      style={{ ...avatarColorStyle(color, image), ...style }}
    />
  );
}

interface Props {
  /** Avatar slug, e.g. "toph-prism". */
  avatar: string;
  /** Resolved image URL currently rendered by the base layer. */
  image: string;
  color?: string;
  imageClassName?: string;
  imageStyle?: CSSProperties;
  /** Mirrors the CSS `scale` applied to the base image, when any. */
  scale?: number;
}

/**
 * Renders only the eye regions on top of an avatar. The patches are copies of
 * the same image, so the body stays completely still while both eyes follow
 * the pointer through the `--toph-look-x` / `--toph-look-y` CSS variables.
 */
export default function TophEyes({ avatar, image, color, imageClassName, imageStyle, scale }: Props) {
  const eyes = TOPH_EYES[avatar] ?? TOPH_EYES["toph-core"];
  if (!eyes) return null;

  return (
    <>
      {eyes.map((box, index) => {
        const mask = eyeMask(box);
        return (
          <span
            key={index}
            aria-hidden
            data-toph-eye={index}
            className="pointer-events-none absolute inset-0 block"
            style={{
              WebkitMaskImage: mask,
              maskImage: mask,
              WebkitMaskPosition: "center",
              maskPosition: "center",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
              transform: EYE_TRANSFORM,
              transition: "transform 70ms linear",
              scale: scale === undefined ? undefined : String(scale),
            }}
          >
            <img
              src={image}
              alt=""
              width={256}
              height={256}
              draggable={false}
              className={cx("size-full select-none object-contain", imageClassName)}
              style={imageStyle}
            />
            {color ? <TophColorOverlay color={color} image={image} /> : null}
          </span>
        );
      })}
    </>
  );
}
