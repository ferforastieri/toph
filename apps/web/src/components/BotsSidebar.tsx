import { useEffect, useState, type ReactNode } from "react";
import { Bot, Plus, Settings2, UserRound } from "@toph/icons";
import type { Project } from "../api";
import { activeChat, chatTophs, useChats } from "../chats";
import TophGallery from "./TophGallery";
import TophRow from "./TophRow";
import { Button } from "@/boardui/base/buttons/button";
import SidebarHeader from "./SidebarHeader";
import { Textarea } from "@/boardui/base/textarea/textarea";
import { Modal } from "@/boardui/base/modal/modal";
import { cx } from "@/boardui/utils/cx";

interface Props {
  project: Project;
  headerControl?: ReactNode;
}

function fireTophAction(action: "config" | "sessions", tophId: string) {
  window.dispatchEvent(new CustomEvent("toph:toph-action", { detail: { action, tophId } }));
}

export default function BotsSidebar({ project, headerControl }: Props) {
  const chats = useChats((state) => state.byProject[project.id]);
  const ensure = useChats((state) => state.ensure);
  const setActiveChat = useChats((state) => state.setActiveChat);
  const updateChat = useChats((state) => state.updateChat);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamInfo, setTeamInfo] = useState("");

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  const chat = activeChat(chats);
  const tophs = chatTophs(chats, chat?.id);
  const team = chats?.chats.find((item) => item.kind === "team") ?? null;

  function openTeam() {
    if (!team) return;
    setTeamInfo(team.description);
    setTeamOpen(true);
  }

  function saveTeam() {
    if (!team) return;
    updateChat(project.id, team.id, { description: teamInfo });
    setTeamOpen(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-primary-default">
      <SidebarHeader
        control={headerControl}
        icon={<Bot size={15} className="text-accent-500" />}
        title="Toph"
        count={<span className="rounded-full bg-background-tertiary-default px-1.5 text-caption-2-regular text-text-tertiary">{tophs.length}</span>}
        actions={team ? <Button variant="ghost" size="xs" iconOnly leadingIcon={Settings2} aria-label="Configurar equipe" title="Configurar equipe" onClick={openTeam} /> : undefined}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {!chats?.hydrated ? (
          <div className="flex items-center justify-center gap-2 py-8 text-caption-1-regular text-text-tertiary">
            <span className="size-3 animate-spin rounded-full border-2 border-text-tertiary/30 border-t-text-tertiary" />
            Carregando...
          </div>
        ) : null}
        {chats?.hydrated ? (
          <>
            <div className="mb-1.5 flex items-center gap-2 px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
              <span className="flex-1">Modo</span>
              <span>2</span>
            </div>
            <div className="mb-4 flex flex-col gap-0.5">
              {chats.chats.map((item) => {
                const selected = chat?.id === item.id;
                const Icon = item.kind === "team" ? Bot : UserRound;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveChat(project.id, item.id)}
                    className={cx("flex w-full items-center gap-2.5 rounded-xl px-2 py-2.5 text-start transition-colors", selected ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover")}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-background-secondary-default text-text-tertiary"><Icon size={14} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-caption-1-medium text-text-primary">{item.kind === "team" ? "Equipe" : "Individual"}</span>
                      <span className="block truncate text-caption-2-regular text-text-tertiary">{item.kind === "team" ? "Coordenador + membros" : "Um Toph só"}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {chat ? (
              <>
                <div className="mb-1.5 flex items-center gap-2 px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                  <Bot size={12} />
                  <span className="flex-1">Agentes</span>
                  <span>{tophs.length}</span>
                  {chat.kind === "team" ? (
                    <Button variant="ghost" size="small" iconOnly leadingIcon={Plus} aria-label="Adicionar Toph à equipe" title="Adicionar Toph à equipe" onClick={() => setGalleryOpen(true)} />
                  ) : null}
                </div>
                <div className="flex flex-col gap-0.5">
                  {tophs.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setGalleryOpen(true)}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-border-button-default px-2.5 py-2.5 text-start text-caption-1-medium text-text-secondary transition-colors hover:bg-background-primary-hover hover:text-text-primary"
                    >
                      <span className="flex size-8 items-center justify-center rounded-full bg-background-secondary-default"><Plus size={14} /></span>
                      Adicionar Toph
                    </button>
                  ) : tophs.map((toph) => (
                    <TophRow
                      key={toph.id}
                      toph={toph}
                      onOpen={() => fireTophAction("config", toph.id)}
                      onSessions={() => fireTophAction("sessions", toph.id)}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      <Modal
        isOpen={teamOpen}
        onClose={() => setTeamOpen(false)}
        title="Configurar equipe"
        description="Informações gerais compartilhadas com todos os Tophs da equipe."
        placement="center"
        size="md"
        bodyClassName="p-4"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTeamOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={saveTeam}>Salvar</Button>
          </div>
        }
      >
        <Textarea
          label="Informações gerais"
          rows={6}
          value={teamInfo}
          onChange={setTeamInfo}
          placeholder="Contexto do projeto, padrões, tecnologias, regras que todos os Tophs devem seguir."
        />
      </Modal>

      <TophGallery
        open={galleryOpen}
        projectId={project.id}
        chatId={chat?.id ?? null}
        onClose={() => setGalleryOpen(false)}
        onCreated={() => setGalleryOpen(false)}
      />
    </div>
  );
}
