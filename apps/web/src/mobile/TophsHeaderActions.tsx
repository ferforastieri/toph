import { Bot, History, MessageSquarePlus, Settings2, SlidersHorizontal, UserRound } from "@toph/icons";
import { useBots } from "../bots";
import { Button } from "@/boardui/base/buttons/button";

interface Props {
  projectId: string;
}

function fire(action: "config" | "settings" | "sessions" | "new") {
  window.dispatchEvent(new CustomEvent("toph:tophs-action", { detail: { action } }));
}

/** Tophs-only fixed header actions. The title is intentionally omitted here. */
export default function TophsHeaderActions({ projectId }: Props) {
  const workspace = useBots((state) => state.byProject[projectId]);
  const setMode = useBots((state) => state.setMode);
  const mode = workspace?.mode ?? "unset";
  const active = Boolean(workspace?.bots.length);

  if (!active) return null;

  return (
    <>
      <Button variant="ghost" size="small" iconOnly leadingIcon={Settings2} aria-label="Configurar Toph" title="Configurar Toph" onClick={() => fire("config")} className="size-7" />
      <Button variant="ghost" size="small" iconOnly leadingIcon={SlidersHorizontal} aria-label="Configurações de IA" title="Configurações de IA" onClick={() => fire("settings")} className="size-7" />
      <Button variant="ghost" size="small" iconOnly leadingIcon={History} aria-label="Sessões" title="Sessões" onClick={() => fire("sessions")} className="size-7" />
      {mode === "team" ? (
        <Button variant="ghost" size="small" iconOnly leadingIcon={MessageSquarePlus} aria-label="Novo Toph" title="Novo Toph" onClick={() => fire("new")} className="size-7" />
      ) : null}
      <div className="ms-auto flex shrink-0 items-center rounded-lg border border-border-button-default p-0.5">
        <Button variant={mode === "solo" ? "secondary" : "ghost"} size="xs" iconOnly leadingIcon={UserRound} aria-label="Modo solo" title="Modo solo" onClick={() => setMode(projectId, "solo")} className="size-7 rounded-md" />
        <Button variant={mode === "team" ? "secondary" : "ghost"} size="xs" iconOnly leadingIcon={Bot} aria-label="Modo equipe" title="Modo equipe" onClick={() => setMode(projectId, "team")} className="size-7 rounded-md" />
      </div>
    </>
  );
}
