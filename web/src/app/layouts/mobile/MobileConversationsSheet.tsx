import { useEffect, useState } from "react";
import { Bot, MessageSquarePlus, Plus } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { activeChat, chatTophs, individualTophs, teamChat, useChats } from "../../../features/conversations/store";
import TophGallery from "../../../features/agents/components/TophGallery";
import TophRow from "../../../features/agents/components/TophRow";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Modal } from "@/shared/boardui/base/modal/modal";
import { cx } from "@/shared/boardui/utils/cx";

interface Props {
  open: boolean;
  project: Project;
  onClose: () => void;
  onSelected: () => void;
  onAction: (tophId: string, action: "config" | "sessions") => void;
}

export default function MobileConversationsSheet({ open, project, onClose, onSelected, onAction }: Props) {
  const chats = useChats((state) => state.byProject[project.id]);
  const ensure = useChats((state) => state.ensure);
  const createChat = useChats((state) => state.createChat);
  const setActiveChat = useChats((state) => state.setActiveChat);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryChatId, setGalleryChatId] = useState<string | null>(null);

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  const chat = activeChat(chats);
  const tophs = individualTophs(chats);
  const team = teamChat(chats);
  const teamMembers = chatTophs(chats, team?.id);

  function selectChat(chatId: string) {
    setActiveChat(project.id, chatId);
    onClose();
    onSelected();
  }

  function addToph() {
    const created = createChat(project.id, "Toph");
    setActiveChat(project.id, created.id);
    setGalleryChatId(created.id);
    setGalleryOpen(true);
  }

  function openGallery(chatId: string | null) {
    setGalleryChatId(chatId);
    setGalleryOpen(true);
  }

  return (
    <>
      <Modal
        isOpen={open && !galleryOpen}
        onClose={onClose}
        title="Tophs"
        description="Escolha um Toph ou a equipe."
        placement="bottom"
        size="sm"
        bodyClassName="p-2"
        swipeToClose
      >
        <div className="flex max-h-[min(60dvh,500px)] flex-col gap-0.5 overflow-y-auto">
          <div className="mb-1 flex items-center gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            <span className="flex-1">Tophs</span>
            <Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Novo Toph" title="Novo Toph" onClick={addToph} />
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
          ) : tophs.map((toph) => (
            <TophRow
              key={toph.id}
              toph={toph}
              compact
              selected={chat?.id === toph.chatId}
              onOpen={() => selectChat(toph.chatId)}
              onConfig={() => { onClose(); onAction(toph.id, "config"); }}
              onSessions={() => { onClose(); onAction(toph.id, "sessions"); }}
            />
          ))}

          {team ? (
            <>
              <div className="mb-1 mt-3 flex items-center gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                <Bot size={12} />
                <span className="flex-1">Equipe</span>
                <span>{teamMembers.length}</span>
                <Button variant="ghost" size="small" iconOnly leadingIcon={MessageSquarePlus} aria-label="Adicionar Toph à equipe" title="Adicionar Toph à equipe" onClick={() => openGallery(team.id)} />
              </div>
              <button
                type="button"
                onClick={() => selectChat(team.id)}
                aria-current={chat?.id === team.id ? "true" : undefined}
                className={cx("flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-start transition-colors", chat?.id === team.id ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover")}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-500/12 text-accent-500"><Bot size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-caption-1-medium text-text-primary">{team.name || "Equipe"}</span>
                  <span className="block truncate text-caption-2-regular text-text-tertiary">{teamMembers.length === 0 ? "Sem membros" : "Conversa compartilhada"}</span>
                </span>
              </button>
            </>
          ) : null}
        </div>
      </Modal>

      <TophGallery
        open={galleryOpen}
        projectId={project.id}
        chatId={galleryChatId}
        onClose={() => { setGalleryOpen(false); setGalleryChatId(null); }}
        onCreated={(tophId) => {
          setGalleryOpen(false);
          setGalleryChatId(null);
          onClose();
          onAction(tophId, "config");
        }}
      />
    </>
  );
}
