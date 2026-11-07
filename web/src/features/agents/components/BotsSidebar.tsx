import { useEffect, useState, type ReactNode } from "react";
import { Bot, Plus, Settings2 } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { activeChat, chatTophs, individualTophs, teamChat, useChats } from "../../conversations/store";
import TophGallery from "./TophGallery";
import TophRow from "./TophRow";
import { Button } from "@/shared/boardui/base/buttons/button";
import SidebarHeader from "../../../app/components/SidebarHeader";
import { Textarea } from "@/shared/boardui/base/textarea/textarea";
import { Modal } from "@/shared/boardui/base/modal/modal";
import { cx } from "@/shared/boardui/utils/cx";

interface Props {
  project: Project;
  headerControl?: ReactNode;
  onSelectChat?: () => void;
}

function fireTophAction(action: "config" | "sessions", tophId: string) {
  window.dispatchEvent(new CustomEvent("toph:toph-action", { detail: { action, tophId } }));
}

/** Toph-first sidebar: one row per Toph plus the shared team conversation. */
export default function BotsSidebar({ project, headerControl, onSelectChat }: Props) {
  const chats = useChats((state) => state.byProject[project.id]);
  const ensure = useChats((state) => state.ensure);
  const createChat = useChats((state) => state.createChat);
  const setActiveChat = useChats((state) => state.setActiveChat);
  const updateChat = useChats((state) => state.updateChat);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryChatId, setGalleryChatId] = useState<string | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamInfo, setTeamInfo] = useState("");

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  const chat = activeChat(chats);
  const tophs = individualTophs(chats);
  const team = teamChat(chats);
  const teamMembers = chatTophs(chats, team?.id);

  function openChat(chatId: string) {
    setActiveChat(project.id, chatId);
    onSelectChat?.();
  }

  function addToph() {
    const created = createChat(project.id, "Toph");
    setActiveChat(project.id, created.id);
    setGalleryChatId(created.id);
    setGalleryOpen(true);
    onSelectChat?.();
  }

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
        title="Tophs"
        count={<span className="rounded-full bg-background-tertiary-default px-1.5 text-caption-2-regular text-text-tertiary">{tophs.length}</span>}
        actions={<Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Novo Toph" title="Novo Toph" onClick={addToph} />}
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
              <span className="flex-1">Tophs</span>
            </div>
            {tophs.length === 0 ? (
              <button
                type="button"
                onClick={addToph}
                className="mb-3 flex w-full items-center gap-2.5 rounded-xl border border-dashed border-border-button-default px-2.5 py-2.5 text-start text-caption-1-medium text-text-secondary transition-colors hover:bg-background-primary-hover hover:text-text-primary"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-background-secondary-default"><Plus size={14} /></span>
                Escolher primeiro Toph
              </button>
            ) : (
              <div className="mb-4 flex flex-col gap-0.5">
                {tophs.map((toph) => (
                  <TophRow
                    key={toph.id}
                    toph={toph}
                    selected={chat?.id === toph.chatId}
                    onOpen={() => openChat(toph.chatId)}
                    onConfig={() => fireTophAction("config", toph.id)}
                    onSessions={() => fireTophAction("sessions", toph.id)}
                  />
                ))}
              </div>
            )}

            {team ? (
              <>
                <div className="mb-1.5 flex items-center gap-2 px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                  <span className="flex-1">Equipe</span>
                  <span>{teamMembers.length}</span>
                </div>
                <div className={cx("flex items-center gap-1 rounded-xl pe-1 transition-colors", chat?.id === team.id ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover")}>
                  <button type="button" onClick={() => openChat(team.id)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-start">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-500/12 text-accent-500"><Bot size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-caption-1-medium text-text-primary">{team.name || "Equipe"}</span>
                      <span className="block truncate text-caption-2-regular text-text-tertiary">{teamMembers.length === 0 ? "Sem membros" : "Conversa compartilhada"}</span>
                    </span>
                  </button>
                  <Button variant="ghost" size="xs" iconOnly leadingIcon={Settings2} aria-label="Configurar equipe" title="Configurar equipe" onClick={openTeam} />
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
        chatId={galleryChatId}
        onClose={() => { setGalleryOpen(false); setGalleryChatId(null); }}
        onCreated={(tophId) => { setGalleryOpen(false); setGalleryChatId(null); fireTophAction("config", tophId); }}
      />
    </div>
  );
}
