import { useEffect } from "react";
import type { Project } from "../../../shared/api";
import { useApp } from "../../../app/store";
import { useChats } from "../../conversations/store";
import BotAvatar from "../../agents/components/BotAvatar";
import { activeTophFromChats, useProjectTophs } from "../project-tophs";
import { cx } from "@toph/ui";

interface Props {
  project: Project;
  size?: number;
  className?: string;
  look?: boolean;
  /** Overlays the project initial so the avatar still identifies the project. */
  showInitial?: boolean;
}

/** Project badge that prefers the project's active Toph over the name initial. */
export default function ProjectTophAvatar({ project, size = 28, className, look = true, showInitial = false }: Props) {
  const chats = useChats((state) => state.byProject[project.id]);
  const summary = useProjectTophs((state) => state.summaries[project.id]);
  const open = useApp((state) => state.openProjectIds.includes(project.id));
  const remember = useProjectTophs((state) => state.remember);
  const ensure = useProjectTophs((state) => state.ensure);

  useEffect(() => {
    if (chats?.hydrated) remember(project.id, chats);
    else if (open) void ensure(project.id);
  }, [chats, open, project.id, remember, ensure]);

  const toph = activeTophFromChats(chats) ?? summary;

  if (toph) {
    if (!showInitial) {
      return <BotAvatar bot={toph} size={size} look={look} className={cx("shrink-0", className)} />;
    }
    const badge = Math.max(11, Math.round(size * 0.45));
    return (
      <span className={cx("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
        <BotAvatar bot={toph} size={size} look={look} />
        <span
          className="absolute -bottom-0.5 -end-0.5 z-10 flex items-center justify-center rounded-full border border-border-button-default bg-background-primary-default font-semibold leading-none shadow-sm"
          style={{
            width: badge,
            height: badge,
            color: project.color || "#FFB547",
            fontSize: Math.max(7, Math.round(badge * 0.55)),
          }}
          aria-hidden="true"
        >
          {project.name.slice(0, 1).toUpperCase()}
        </span>
      </span>
    );
  }

  return (
    <span
      className={cx("flex shrink-0 items-center justify-center rounded-lg font-semibold", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: `${project.color || "#FFB547"}22`,
        color: project.color || "#FFB547",
        fontSize: Math.max(9, Math.round(size * 0.38)),
      }}
      aria-hidden="true"
    >
      {project.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
