import { useEffect, useState } from "react";
import { Bot, Check, MessageSquare, Plus, UserRound } from "@toph/icons";
import type { Project } from "../api";
import { botThread, useBots, type TophMode } from "../bots";
import TophGallery from "../components/TophGallery";
import TophRow from "../components/TophRow";
import { Button } from "@/boardui/base/buttons/button";
import { Modal } from "@/boardui/base/modal/modal";

interface Props {
  open: boolean;
  project: Project;
  onClose: () => void;
  onSelected: () => void;
  onAction: (mode: TophMode, botId: string, action: "config" | "sessions") => void;
}

export default function MobileConversationsSheet({ open, project, onClose, onSelected, onAction }: Props) {
  const workspace = useBots((state) => state.byProject[project.id]);
  const setActiveBot = useBots((state) => state.setActiveBot);
  const setMode = useBots((state) => state.setMode);
  const [tab, setTab] = useState<TophMode>("solo");
  const [galleryTarget, setGalleryTarget] = useState<TophMode | null>(null);

  const mode: TophMode = workspace?.mode === "team" ? "team" : "solo";
  const soloBots = botThread(workspace, "solo").bots;
  const teamBots = botThread(workspace, "team").bots;
  const coordinator = teamBots.find((bot) => bot.coordinator) ?? teamBots[0] ?? null;
  const activeId = workspace?.activeBotId;
  const activeWorker = mode === "team" && activeId && activeId !== coordinator?.id ? activeId : null;
  const teamGeneralActive = mode === "team" && !activeWorker;

  useEffect(() => {
    if (open) setTab(mode);
    else setGalleryTarget(null);
  }, [open, mode]);

  function selectConversation(target: TophMode, botId?: string) {
    if ((useBots.getState().byProject[project.id]?.mode ?? "solo") !== target) setMode(project.id, target);
    const thread = botThread(useBots.getState().byProject[project.id], target);
    if (thread.bots.length === 0) {
      setGalleryTarget(target);
      return;
    }
    const selected = botId && thread.bots.some((bot) => bot.id === botId)
      ? botId
      : thread.activeBotId ?? thread.bots.find((bot) => bot.coordinator)?.id ?? thread.bots[0]?.id ?? null;
    setActiveBot(project.id, selected);
    onClose();
    onSelected();
  }

  function openTeamGeneral() {
    selectConversation("team", coordinator?.id);
  }

  return (
    <>
      <Modal
        isOpen={open && galleryTarget === null}
        onClose={onClose}
        title="Conversas"
        description="Escolha um Toph individual ou a conversa da equipe."
        placement="bottom"
        size="sm"
        bodyClassName="p-2"
        swipeToClose
      >
        <div className="mb-2 flex items-center gap-1 rounded-2xl bg-background-secondary-default p-1">
          <Button variant={tab === "solo" ? "secondary" : "ghost"} size="small" leadingIcon={UserRound} className="flex-1" onClick={() => setTab("solo")}>Individual</Button>
          <Button variant={tab === "team" ? "secondary" : "ghost"} size="small" leadingIcon={Bot} className="flex-1" onClick={() => setTab("team")}>Equipe</Button>
        </div>

        {tab === "solo" ? (
          <div className="flex max-h-[min(56dvh,460px)] flex-col gap-0.5 overflow-y-auto">
            <div className="mb-1 flex items-center gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
              <UserRound size={12} />
              <span className="flex-1">Individuais</span>
              <span>{soloBots.length}</span>
              <Button variant="ghost" size="small" iconOnly leadingIcon={Plus} aria-label="Adicionar Toph individual" title="Adicionar Toph individual" onClick={() => setGalleryTarget("solo")} />
            </div>
            {soloBots.length === 0 ? (
              <button
                type="button"
                onClick={() => setGalleryTarget("solo")}
                className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-border-button-default px-2.5 py-2.5 text-start text-caption-1-medium text-text-secondary transition-colors hover:bg-background-primary-hover hover:text-text-primary"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-background-secondary-default"><Plus size={14} /></span>
                Adicionar Toph individual
              </button>
            ) : soloBots.map((bot) => (
              <TophRow
                key={bot.id}
                bot={bot}
                compact
                active={mode === "solo" && activeId === bot.id}
                onSelect={() => selectConversation("solo", bot.id)}
                onConfig={() => onAction("solo", bot.id, "config")}
                onSessions={() => onAction("solo", bot.id, "sessions")}
              />
            ))}
          </div>
        ) : (
          <div className="flex max-h-[min(56dvh,460px)] flex-col gap-0.5 overflow-y-auto">
            <div className="mb-1 flex items-center gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
              <Bot size={12} />
              <span className="flex-1">Equipe</span>
              <span>{teamBots.length}</span>
              <Button variant="ghost" size="small" iconOnly leadingIcon={Plus} aria-label="Adicionar Toph à equipe" title="Adicionar Toph à equipe" onClick={() => setGalleryTarget("team")} />
            </div>
            {teamBots.length === 0 ? (
              <button
                type="button"
                onClick={() => setGalleryTarget("team")}
                className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-border-button-default px-2.5 py-2.5 text-start text-caption-1-medium text-text-secondary transition-colors hover:bg-background-primary-hover hover:text-text-primary"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-background-secondary-default"><Plus size={14} /></span>
                Adicionar primeiro Toph
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={openTeamGeneral}
                  aria-current={teamGeneralActive ? "true" : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-start transition-colors ${teamGeneralActive ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover"}`}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-500/10 text-accent-500"><MessageSquare size={14} /></span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-caption-1-medium text-text-primary">Conversa da equipe</span>
                    <span className="truncate text-caption-2-regular text-text-secondary">Todos os Tophs colaborando</span>
                  </span>
                  {teamGeneralActive ? <Check size={14} className="shrink-0 text-accent-500" /> : null}
                </button>
                {teamBots.map((bot) => (
                  <TophRow
                    key={bot.id}
                    bot={bot}
                    compact
                    active={mode === "team" && activeWorker === bot.id}
                    onSelect={() => selectConversation("team", bot.id)}
                    onConfig={() => onAction("team", bot.id, "config")}
                    onSessions={() => onAction("team", bot.id, "sessions")}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </Modal>

      <TophGallery
        open={galleryTarget !== null}
        projectId={project.id}
        target={galleryTarget ?? "solo"}
        onClose={() => setGalleryTarget(null)}
        onCreated={() => {
          setGalleryTarget(null);
          onClose();
          onSelected();
        }}
      />
    </>
  );
}
