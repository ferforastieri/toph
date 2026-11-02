import { useEffect, useState } from "react";
import { Input } from "@/boardui/base/input/input";

interface Props {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

function normalizeHex(value: string): string {
  const raw = value.trim();
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9a-f]{3}$/i.test(withHash)) {
    return `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`.toLowerCase();
  }
  return /^#[0-9a-f]{6}$/i.test(withHash) ? withHash.toLowerCase() : "";
}

/** Reusable arbitrary-color field used by Toph identity settings. */
export default function ColorPicker({ value, onChange, ariaLabel = "Cor do Toph" }: Props) {
  const safeValue = normalizeHex(value) || "#ffb547";
  const [text, setText] = useState(safeValue);

  useEffect(() => {
    setText(normalizeHex(value) || value);
  }, [value]);

  function commit(next: string) {
    setText(next);
    const normalized = normalizeHex(next);
    if (normalized) onChange(normalized);
  }

  return (
    <div className="flex items-center gap-2">
      <label
        className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border-button-default shadow-xs"
        style={{ backgroundColor: safeValue }}
        title="Escolher qualquer cor"
      >
        <input
          type="color"
          value={safeValue}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          aria-label={ariaLabel}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
      <Input
        value={text}
        onChange={commit}
        onBlur={() => { const normalized = normalizeHex(text); if (normalized) commit(normalized); else setText(safeValue); }}
        aria-label={`${ariaLabel} em hexadecimal`}
        placeholder="#FFB547"
        className="max-w-[130px] font-mono"
      />
    </div>
  );
}
