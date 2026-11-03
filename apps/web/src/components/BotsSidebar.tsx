import { useEffect, useState, type ReactNode } from "react";
import { Bot, History, Plus, Settings2, Sparkles, UserRound } from "@toph/icons";
import type { Project } from "../api";
import { useAI } from "../ai";
import { botThread, TOPH_PRESETS, useBots, type TophMode } from "../bots";
import BotAvatar from "./BotAvatar";
import { Button } from "@/boardui/base/buttons/button";
import { Modal } from "@/boardui/base/modal/modal";
import { cx } from "@/boardui/utils/cx";
import SidebarHeader from "./SidebarHeader";
import { Accordion, AccordionItem } from "@/boardui/base/accordion/accordion";

interface Props {
  project: Project;
  headerControl?: ReactNode;
}

function fire(action: "config" | "sessions") {
  window.dispatchEvent(new CustomEvent("toph:tophs-action", { detail: { action } }));
}

export default function BotsSidebar({ project, headerControl }: Props) {
  const workspace = useBots((state) => state.byProject[project.id]);
  const ensure = useBots((state) => state.ensure);
  const addBot = useBots((state) => state.addBot);
  const setActiveBot = useBots((state) => state.setActiveBot);
  const setMode = useBots((state) => state.setMode);
  const createSolo = useBots((state) => state.createSolo);
  const config = useAI((state) => state.config);
  const models = useAI((state) => state.models);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [individualOpen, setIndividualOpen] = useState(true);

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  const mode: TophMode = workspace?.mode === "team" ? "team" : "solo";
  const soloThread = botThread(workspace, "solo");
  const teamThread = botThread(workspace, "team");
  const totalBots = soloThread.bots.length + teamThread.bots.length;

  function openConversation(nextMode: TophMode, botId?: string) {
    if (workspace?.mode !== nextMode) setMode(project.id, nextMode);
    if (nextMode === "solo" && botThread(useBots.getState().byProject[project.id], "solo").bots.length === 0) {
      createSolo(project.id);
    }
    const current = botThread(useBots.getState().byProject[project.id], nextMode);
    const selected = botId && current.bots.some((bot) => bot.id === botId)
      ? botId
      : current.activeBotId ?? current.bots.find((bot) => bot.coordinator)?.id ?? current.bots[0]?.id ?? null;
    setActiveBot(project.id, selected);
  }

  function openBot(nextMode: TophMode, botId: string) {
    openConversation(nextMode, botId);
    window.dispatchEvent(new CustomEvent("toph:close-mobile-panel"));
  }

  function openBotAction(nextMode: TophMode, botId: string, action: "config" | "sessions") {
    openConversation(nextMode, botId);
    window.setTimeout(() => fire(action), 0);
  }

  function addPreset(preset: (typeof TOPH_PRESETS)[number]) {
    if (workspace?.mode !== "team") setMode(project.id, "team");
    const teamBots = botThread(useBots.getState().byProject[project.id], "team").bots;
    const existing = new Set(teamBots.map((bot) => bot.name));
    let name = preset.name;
    let suffix = 2;
    while (existing.has(name)) {
      name = `${preset.name} ${suffix}`;
      suffix += 1;
    }
    const bot = addBot(project.id, {
      name,
      role: preset.role,
      description: preset.description,
      personality: preset.personality,
      color: preset.color,
      avatar: preset.avatar,
      model: config?.model || models[0]?.id || "",
      coordinator: teamBots.length === 0 || preset.coordinator === true,
    });
    setGalleryOpen(false);
    openBot("team", bot.id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-primary-default">
      <SidebarHeader control={headerControl} icon={<Bot size={15} className="text-accent-500" />} title="Tophs" count={<span className="rounded-full bg-background-tertiary-default px-1.5 text-caption-2-regular text-text-tertiary">{totalBots}</span>} actions={<Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Adicionar Toph à equipe" title="Adicionar Toph à equipe" onClick={() => setGalleryOpen(true)} />} />
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <Accordion expandedKeys={individualOpen ? ["individual"] : []} onExpandedChange={(keys) => setIndividualOpen(Array.from(keys).includes("individual"))}>
          <AccordionItem id="individual" title={<span className="flex min-w-0 flex-1 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary"><UserRound size={12} /><span className="flex-1 text-start">Individuais</span><span>{soloThread.bots.length}</span></span>} triggerClassName="mb-1.5 h-7 rounded-lg px-1 text-text-tertiary hover:bg-background-primary-hover" contentClassName="p-0">
            <div className="mb-3 flex flex-col gap-0.5">
          {soloThread.bots.length === 0 ? (
            <button
              type="button"
              onClick={() => openConversation("solo")}
              className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-border-button-default px-2.5 py-2.5 text-start text-caption-1-medium text-text-secondary transition-colors hover:bg-background-primary-hover hover:text-text-primary"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-background-secondary-default"><Plus size={14} /></span>
              Criar conversa individual
            </button>
          ) : soloThread.bots.map((bot) => (
            <div
              key={bot.id}
              className={cx(
                "flex w-full items-center rounded-xl pe-1 transition-colors",
                mode === "solo" && bot.id === workspace?.activeBotId ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover",
              )}
            >
              <button type="button" onClick={() => openBot("solo", bot.id)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-start">
                <BotAvatar bot={bot} size={32} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-caption-1-medium text-text-primary">{bot.name}</span>
                  <span className="truncate text-caption-2-regular text-text-secondary">{bot.role || "Assistente"}</span>
                </span>
              </button>
              <span className="flex shrink-0 items-center gap-0.5">
                <Button variant="ghost" size="xs" iconOnly leadingIcon={Settings2} aria-label={`Configurar ${bot.name}`} title="Configurar Toph" onClick={() => openBotAction("solo", bot.id, "config")} />
                <Button variant="ghost" size="xs" iconOnly leadingIcon={History} aria-label={`Sessões de ${bot.name}`} title="Sessões do Toph" onClick={() => openBotAction("solo", bot.id, "sessions")} />
              </span>
            </div>
          ))}
            </div>
          </AccordionItem>
        </Accordion>

        <div className="mb-1.5 flex items-center gap-2 px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
          <Sparkles size={12} /> <span className="flex-1">Equipe</span><span>{teamThread.bots.length}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {teamThread.bots.map((bot) => (
            <div
              key={bot.id}
              className={cx(
                "flex w-full items-center rounded-xl pe-1 transition-colors",
                mode === "team" && bot.id === workspace?.activeBotId ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover",
              )}
            >
              <button type="button" onClick={() => openBot("team", bot.id)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-start">
                <BotAvatar bot={bot} size={30} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-caption-1-medium text-text-primary">{bot.name}</span>
                    {bot.coordinator && <span className="shrink-0 rounded-full bg-accent-500/15 px-1 text-[9px] font-medium text-accent-600">coord.</span>}
                  </span>
                  <span className="truncate text-caption-2-regular text-text-secondary">{bot.role || "Especialista"}</span>
                </span>
              </button>
              <span className="flex shrink-0 items-center gap-0.5">
                <Button variant="ghost" size="xs" iconOnly leadingIcon={Settings2} aria-label={`Configurar ${bot.name}`} title="Configurar Toph" onClick={() => openBotAction("team", bot.id, "config")} />
                <Button variant="ghost" size="xs" iconOnly leadingIcon={History} aria-label={`Sessões de ${bot.name}`} title="Sessões do Toph" onClick={() => openBotAction("team", bot.id, "sessions")} />
              </span>
            </div>
          ))}
        </div>
      </div>
      <Modal isOpen={galleryOpen} onClose={() => setGalleryOpen(false)} title="Adicionar Toph" description="20 identidades com visuais e cores únicas." placement="bottom" size="lg" bodyClassName="p-3" swipeToClose>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {TOPH_PRESETS.filter((preset) => preset.name !== "Toph").map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => addPreset(preset)}
              className="flex min-w-0 items-center gap-2 rounded-2xl border border-border-button-white bg-background-primary-default p-2 text-start transition-colors hover:border-accent-500/40 hover:bg-accent-500/5"
            >
              <BotAvatar bot={{ name: preset.name, color: preset.color, avatar: preset.avatar }} size={34} />
              <span className="flex min-w-0 flex-col">
                {(() => { const exists = teamThread.bots.some((bot) => bot.name === preset.name); return <strong className="truncate text-caption-1-semibold text-text-primary">{exists ? `${preset.name} 2` : preset.name}</strong>; })()}
                <span className="truncate text-caption-2-regular text-text-tertiary">{preset.role}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
