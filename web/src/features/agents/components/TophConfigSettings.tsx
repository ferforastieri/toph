import { useEffect } from "react";
import { Bot, Plus } from "@toph/icons";
import { useChats } from "../../conversations/store";
import { Button } from "@/shared/toph-ui/base/buttons/button";
import { ensureToph } from "../default-toph";
import BotConfig from "./BotConfig";

interface Props {
  projectId?: string;
  projectRoot?: string;
}

/** Settings → Toph: the identity, model and tools of the project's only Toph. */
export default function TophConfigSettings({ projectId, projectRoot }: Props) {
  const toph = useChats((state) => (projectId ? state.byProject[projectId]?.tophs[0] ?? null : null));
  const ensure = useChats((state) => state.ensure);

  useEffect(() => {
    if (projectId) ensure(projectId);
  }, [ensure, projectId]);

  if (!projectId) {
    return <p className="text-caption-1-regular text-text-secondary">Abra um projeto para configurar o Toph.</p>;
  }

  if (!toph) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border-button-default p-4">
        <span className="flex size-9 items-center justify-center rounded-full bg-background-secondary-default text-accent-500">
          <Bot size={18} />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="text-caption-1-semibold text-text-primary">Este projeto ainda não tem um Toph.</p>
          <p className="text-caption-2-regular text-text-tertiary">Um Toph por projeto, conectado aos harnesses.</p>
        </div>
        <Button size="small" leadingIcon={Plus} onClick={() => ensureToph(projectId)}>Criar o Toph</Button>
      </div>
    );
  }

  return <BotConfig projectId={projectId} projectRoot={projectRoot} bot={toph} embedded showDelete={false} />;
}
