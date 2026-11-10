import type { Project } from "../../../shared/api";
import { cx } from "@/shared/boardui/utils/cx";

interface Props {
  project: Project;
  size?: number;
  className?: string;
}

/** Always two letters when possible: "toph" → TO, "minha-api" → MA. */
export function projectInitials(name: string): string {
  const words = name
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter(Boolean);
  if (words.length === 0) return name.slice(0, 2).toUpperCase() || "?";
  if (words.length >= 2) return `${words[0].slice(0, 1)}${words[1].slice(0, 1)}`.toUpperCase();
  return words[0].slice(0, 2).toUpperCase();
}

/** The project's own identity: initials on the project colour, never a Toph. */
export default function ProjectMonogram({ project, size = 28, className }: Props) {
  const color = project.color || "#FFB547";
  return (
    <span
      className={cx("flex shrink-0 select-none items-center justify-center font-semibold leading-none", className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(8, Math.round(size * 0.32)),
        backgroundColor: `${color}26`,
        color,
        fontSize: Math.max(9, Math.round(size * 0.38)),
        boxShadow: `inset 0 0 0 1px ${color}33`,
      }}
      aria-hidden="true"
    >
      {projectInitials(project.name)}
    </span>
  );
}
