import { cx } from "@/boardui/utils/cx";
import { petLevel, type PetKind } from "../pet";

export default function PetSprite({
  kind,
  size = 44,
  commits = 0,
  animate = true,
  className,
}: {
  kind: PetKind;
  size?: number;
  commits?: number;
  animate?: boolean;
  className?: string;
}) {
  const level = petLevel(commits);
  const growth = 0.78 + level * 0.07;

  return (
    <svg
      viewBox="0 0 80 80"
      width={size}
      height={size}
      role="img"
      aria-label={`Pet ${kind}`}
      className={cx("shrink-0", animate && "pet-bob", className)}
    >
      <ellipse cx="40" cy="69" rx="19" ry="3.5" fill="currentColor" opacity="0.16" />
      <g transform={`translate(40 44) scale(${growth}) translate(-40 -44)`}>
        {kind === "momo" && <Momo />}
        {kind === "pip" && <Pip />}
        {kind === "byte" && <Byte />}
        {kind === "nori" && <Nori />}
      </g>
      {level >= 3 && (
        <path d="M65 9l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7z" fill="#fbbf24" stroke="#b45309" strokeWidth="0.8" />
      )}
    </svg>
  );
}

function Eyes({ y = 39 }: { y?: number }) {
  return (
    <>
      <circle className="pet-eye" cx="31" cy={y} r="2.6" fill="#24160a" />
      <circle className="pet-eye" cx="49" cy={y} r="2.6" fill="#24160a" />
      <circle cx="31.9" cy={y - 0.8} r="0.8" fill="#ffffff" />
      <circle cx="49.9" cy={y - 0.8} r="0.8" fill="#ffffff" />
    </>
  );
}

function Blush({ y = 48 }: { y?: number }) {
  return (
    <>
      <ellipse cx="23" cy={y} rx="3.4" ry="2" fill="#fb7185" opacity="0.45" />
      <ellipse cx="57" cy={y} rx="3.4" ry="2" fill="#fb7185" opacity="0.45" />
    </>
  );
}

function Momo() {
  return (
    <g>
      <path d="M22 30L18 13l15 9z" fill="#ffb547" stroke="#d97706" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M58 30l4-17-15 9z" fill="#ffb547" stroke="#d97706" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M22 26l-2-8 7 4zM58 26l2-8-7 4z" fill="#ffe2a8" />
      <path d="M66 49c7 0 8 8 1 10" fill="none" stroke="#e07a00" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="40" cy="44" rx="27" ry="23" fill="#ffb547" stroke="#d97706" strokeWidth="1.5" />
      <ellipse cx="40" cy="50" rx="16" ry="13" fill="#ffe2a8" opacity="0.95" />
      <Eyes />
      <Blush />
      <path d="M37 45h6l-3 3z" fill="#e07a00" />
      <path d="M40 48c0 3-3 4-5 2M40 48c0 3 3 4 5 2" fill="none" stroke="#7c2d12" strokeWidth="1.4" strokeLinecap="round" />
    </g>
  );
}

function Pip() {
  return (
    <g>
      <rect x="21" y="7" width="11" height="29" rx="5.5" fill="#f9a8d4" stroke="#db2777" strokeWidth="1.4" />
      <rect x="48" y="7" width="11" height="29" rx="5.5" fill="#f9a8d4" stroke="#db2777" strokeWidth="1.4" />
      <rect x="24" y="11" width="5" height="19" rx="2.5" fill="#fce7f3" />
      <rect x="51" y="11" width="5" height="19" rx="2.5" fill="#fce7f3" />
      <ellipse cx="40" cy="46" rx="27" ry="23" fill="#f9a8d4" stroke="#db2777" strokeWidth="1.5" />
      <ellipse cx="40" cy="52" rx="15" ry="12" fill="#fce7f3" opacity="0.9" />
      <Eyes y={40} />
      <Blush y={49} />
      <path d="M37 46h6l-3 2.5z" fill="#db2777" />
      <path d="M40 49v2M40 51c-2 2-4 1-5 0M40 51c2 2 4 1 5 0" fill="none" stroke="#9d174d" strokeWidth="1.3" strokeLinecap="round" />
    </g>
  );
}

function Byte() {
  return (
    <g>
      <path d="M40 20V11" stroke="#64748b" strokeWidth="3" strokeLinecap="round" />
      <circle cx="40" cy="8" r="3.5" fill="#ffb547" stroke="#b45309" strokeWidth="1.2" />
      <rect x="8" y="33" width="7" height="14" rx="3.5" fill="#64748b" />
      <rect x="65" y="33" width="7" height="14" rx="3.5" fill="#64748b" />
      <rect x="14" y="20" width="52" height="42" rx="14" fill="#94a3b8" stroke="#475569" strokeWidth="1.6" />
      <rect x="22" y="28" width="36" height="24" rx="8" fill="#0f172a" />
      <circle className="pet-eye" cx="33" cy="40" r="2.6" fill="#67e8f9" />
      <circle className="pet-eye" cx="47" cy="40" r="2.6" fill="#67e8f9" />
      <path d="M35 47h10" stroke="#67e8f9" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="24" cy="59" r="2.5" fill="#fbbf24" />
      <circle cx="56" cy="59" r="2.5" fill="#fbbf24" />
    </g>
  );
}

function Nori() {
  return (
    <g>
      <path d="M17 45c0-20 46-20 46 0v20c-6-4-10 3-16-1-5-3-9 4-15 0-6-4-9 3-15-1z" fill="#c4b5fd" stroke="#8b5cf6" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M36 24c2-6 8-6 8 0-4-2-6 0-8 0z" fill="#ddd6fe" />
      <Eyes y={42} />
      <Blush y={51} />
      <ellipse cx="40" cy="49" rx="2" ry="1.5" fill="#7c3aed" />
      <path d="M40 51v2M40 53c-2 2-4 1-5 0M40 53c2 2 4 1 5 0" fill="none" stroke="#6d28d9" strokeWidth="1.2" strokeLinecap="round" />
    </g>
  );
}
