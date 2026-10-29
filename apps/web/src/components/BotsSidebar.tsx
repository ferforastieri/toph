import { useEffect } from "react";
import { Bot, Plus, Sparkles } from "@toph/icons";
import type { Project } from "../api";
import { useAI } from "../ai";
import { useBots } from "../bots";
import BotAvatar from "./BotAvatar";
import { Button } from "@/boardui/base/buttons/button";
import { cx } from "@/boardui/utils/cx";

interface Props {
  project: Project;
}

export default function BotsSidebar({ project }: Props) {
  const workspace = useBots((state) => state.byProject[project.id]);
  const ensure = useBots((state) => state.ensure);
  const addBot = useBots((state) => state.addBot);
  const setActiveBot = useBots((state) => state.setActiveBot);
  const config = useAI((state) => state.config);
  const models = useAI((state) => state.models);

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  const bots = workspace?.bots ?? [];
  const activeId = workspace?.activeBotId ?? null;

  function openBot(botId: string) {
    setActiveBot(project.id, botId);
    window.dispatchEvent(new CustomEvent("toph:close-mobile-panel"));
  }

  function createBot() {
    const bot = addBot(project.id, {
      name: "Novo bot",
      role: "Especialista",
      description: "Descreva o papel deste bot.",
      personality: "Direto, útil e focado em resultado.",
      model: config?.model || models[0]?.id || "",
    });
    openBot(bot.id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-primary-default">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Bot size={15} className="text-accent-500" />
        <strong className="text-body-medium text-text-primary">Bots</strong>
        <span className="ms-auto rounded-full bg-background-tertiary-default px-1.5 text-caption-2-regular text-text-tertiary">{bots.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("toph:close-mobile-panel"))}
          className="mb-2 flex w-full items-center gap-2 rounded-xl border border-accent-500/25 bg-accent-500/10 px-2.5 py-2 text-start text-caption-1-medium text-text-primary hover:bg-accent-500/15"
        >
          <Sparkles size={14} className="shrink-0 text-accent-500" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Equipe do projeto</span>
            <span className="block truncate text-caption-2-regular text-text-secondary">Conversar com todos os bots</span>
          </span>
        </button>
        <div className="flex flex-col gap-0.5">
          {bots.map((bot) => (
            <button
              key={bot.id}
              type="button"
              onClick={() => openBot(bot.id)}
              className={cx(
                "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-start transition-colors",
                bot.id === activeId ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover",
              )}
            >
              <BotAvatar bot={bot} size={30} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-caption-1-medium text-text-primary">{bot.name}</span>
                  {bot.coordinator && <span className="shrink-0 rounded-full bg-accent-500/15 px-1 text-[9px] font-medium text-accent-600">coord.</span>}
                </span>
                <span className="truncate text-caption-2-regular text-text-secondary">{bot.role || "Especialista"}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t p-2">
        <Button type="button" variant="secondary" size="small" className="w-full justify-start" leadingIcon={Plus} onClick={createBot}>
          Novo bot
        </Button>
      </div>
    </div>
  );
}
