import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "@toph/icons";
import ComposerMenu from "../../features/conversations/components/ComposerMenu";

interface Props {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

interface Hsv {
  h: number;
  s: number;
  v: number;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function parseHex(value: string): { r: number; g: number; b: number } {
  const raw = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16),
    };
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) {
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }
  return { r: 255, g: 181, b: 71 };
}

function toHex(n: number): string {
  return Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
}

function hexToHsv(value: string): Hsv {
  const { r, g, b } = parseHex(value);
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === rr) h = ((gg - bb) / delta) % 6;
    else if (max === gg) h = (bb - rr) / delta + 2;
    else h = (rr - gg) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return `#${toHex((r + m) * 255)}${toHex((g + m) * 255)}${toHex((b + m) * 255)}`;
}

/** Arbitrary color picker with a saturation/value surface and hue strip. */
export default function ColorPicker({ value, onChange, ariaLabel = "Cor do Toph" }: Props) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [open, setOpen] = useState(false);
  const dragging = useRef<"surface" | "hue" | null>(null);

  useEffect(() => {
    setHsv(hexToHsv(value));
  }, [value]);

  function emit(next: Hsv) {
    setHsv(next);
    onChange(hsvToHex(next));
  }

  function updateSurface(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const s = clamp((event.clientX - rect.left) / rect.width);
    const v = 1 - clamp((event.clientY - rect.top) / rect.height);
    emit({ ...hsv, s, v });
  }

  function updateHue(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    emit({ ...hsv, h: clamp((event.clientX - rect.left) / rect.width) * 360 });
  }

  const swatch = hsvToHex(hsv);

  return (
    <ComposerMenu
      label={ariaLabel}
      onOpenChange={setOpen}
      isOpen={open}
      trigger={(
        <>
          <span className="size-4 rounded-full border border-black/20 shadow-xs" style={{ backgroundColor: swatch }} />
          <span className="font-mono text-caption-1-regular text-text-secondary">{swatch.toUpperCase()}</span>
          <ChevronDown size={12} className="size-3 text-foreground-icon-tertiary" />
        </>
      )}
      triggerClassName="h-9 gap-2 rounded-xl border border-border-button-default bg-background-primary-default px-2.5"
      popoverClassName="w-[280px] p-0"
      contentClassName="p-2"
    >
      {() => (
        <div className="flex flex-col gap-3">
          <div
            role="slider"
            aria-label={`${ariaLabel}: saturação e brilho`}
            tabIndex={0}
            className="relative h-36 w-full touch-none overflow-hidden rounded-xl"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              dragging.current = "surface";
              event.currentTarget.setPointerCapture(event.pointerId);
              updateSurface(event);
            }}
            onPointerMove={(event) => { if (dragging.current === "surface") updateSurface(event); }}
            onPointerUp={(event) => { dragging.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
            onPointerCancel={() => { dragging.current = null; }}
          >
            <span
              className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.5)]"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: swatch }}
            />
          </div>
          <div
            role="slider"
            aria-label={`${ariaLabel}: matiz`}
            tabIndex={0}
            className="relative h-3 w-full touch-none rounded-full"
            style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
            onPointerDown={(event) => {
              event.preventDefault();
              dragging.current = "hue";
              event.currentTarget.setPointerCapture(event.pointerId);
              updateHue(event);
            }}
            onPointerMove={(event) => { if (dragging.current === "hue") updateHue(event); }}
            onPointerUp={(event) => { dragging.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
            onPointerCancel={() => { dragging.current = null; }}
          >
            <span
              className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.5)]"
              style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
            />
          </div>
          <div className="flex items-center justify-between px-0.5 text-caption-2-regular text-text-tertiary">
            <span>Escolha qualquer cor</span>
            <span className="size-4 rounded-full border border-black/20" style={{ backgroundColor: swatch }} />
          </div>
        </div>
      )}
    </ComposerMenu>
  );
}
