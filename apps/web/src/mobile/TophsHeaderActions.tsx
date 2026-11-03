import { History, MessageSquarePlus, Settings2 } from "@toph/icons";
import { useBots } from "../bots";
import { Button } from "@/boardui/base/buttons/button";

interface Props {
  projectId: string;
}

function fire(action: "config" | "sessions" | "new") {
  window.dispatchEvent(new CustomEvent("toph:tophs-action", { detail: { action } }));
}

/** Tophs-only fixed header actions. The title is intentionally omitted here. */
export default function TophsHeaderActions({ projectId }: Props) {
  const workspace = useBots((state) => state.byProject[projectId]);
  const mode = workspace?.mode ?? "unset";
  const active = Boolean(workspace?.bots.length);

  if (!active) {
    return mode === "team"
      ? <Button variant="ghost" size="small" iconOnly leadingIcon={MessageSquarePlus} aria-label="Adicionar Toph à equipe" title="Adicionar Toph à equipe" onClick={() => fire("new")} className="size-7 shrink-0 [&_svg]:size-4" />
      : null;
  }

  return (
    <>
      <Button variant="ghost" size="small" iconOnly leadingIcon={Settings2} aria-label="Configurar Toph" title="Configurar Toph" onClick={() => fire("config")} className="size-7 shrink-0 [&_svg]:size-4" />
      <Button variant="ghost" size="small" iconOnly leadingIcon={History} aria-label="Sessões" title="Sessões" onClick={() => fire("sessions")} className="size-7 shrink-0 [&_svg]:size-4" />
      {mode === "team" ? (
        <Button variant="ghost" size="small" iconOnly leadingIcon={MessageSquarePlus} aria-label="Novo Toph" title="Novo Toph" onClick={() => fire("new")} className="size-7 shrink-0 [&_svg]:size-4" />
      ) : null}
    </>
  );
}
