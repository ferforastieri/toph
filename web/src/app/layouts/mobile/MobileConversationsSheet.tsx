import { useEffect, useState } from "react";
import { Bot, Plus } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { activeChat, chatTophs, useChats } from "../../../features/conversations/store";
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
  const setActiveChat = useChats((state) => state.setActiveChat);
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  const chat = activeChat(chats);
  const tophs = chatTophs(chats, chat?.id);

  function selectChat(chatId: string) {
    setActiveChat(project.id, chatId);
    onClose();
    onSelected();
  }

  return (
    <>
      <Modal
        isOpen={open && !galleryOpen}
        onClose={onClose}
        title="Toph"
        description="Escolha individual ou equipe e veja os Tophs."
        placement="bottom"
        size="sm"
        bodyClassName="p-2"
        swipeToClose
      >
        <div className="flex max-h-[min(60dvh,500px)] flex-col gap-0.5 overflow-y-auto">
          <div className="mb-1 flex items-center gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            <span className="text-sm leading-none">#</span>
            <span className="flex-1">Modo</span>
            <span>{chats?.chats.length ?? 0}</span>
          </div>
          {!chats || chats.chats.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border-button-default px-3 py-4 text-center text-caption-2-regular leading-relaxed text-text-tertiary">
              Abra o Toph no desktop para começar.
            </p>
          ) : chats.chats.map((item) => {
            const selected = chat?.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectChat(item.id)}
                aria-current={selected ? "true" : undefined}
                className={cx("flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-start transition-colors", selected ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover")}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-background-secondary-default text-caption-1-semibold text-text-tertiary">#</span>
                <span className="min-w-0 flex-1 truncate text-caption-1-medium text-text-primary">{item.kind === "team" ? "Equipe" : "Individual"}</span>
              </button>
            );
          })}

          {chat ? (
            <>
              <div className="mb-1 mt-3 flex items-center gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                <Bot size={12} />
                <span className="flex-1">Agentes</span>
                <span>{tophs.length}</span>
                {chat.kind === "team" ? <Button variant="ghost" size="small" iconOnly leadingIcon={Plus} aria-label="Adicionar Toph à equipe" title="Adicionar Toph à equipe" onClick={() => setGalleryOpen(true)} /> : null}
              </div>
              {tophs.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setGalleryOpen(true)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-border-button-default px-2.5 py-2.5 text-start text-caption-1-medium text-text-secondary transition-colors hover:bg-background-primary-hover hover:text-text-primary"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-background-secondary-default"><Plus size={14} /></span>
                  Adicionar primeiro Toph
                </button>
              ) : tophs.map((toph) => (
                <TophRow key={toph.id} toph={toph} compact onOpen={() => { onClose(); onAction(toph.id, "config"); }}
                  onSessions={() => { onClose(); onAction(toph.id, "sessions"); }} />
              ))}
            </>
          ) : null}
        </div>
      </Modal>

      <TophGallery
        open={galleryOpen}
        projectId={project.id}
        chatId={chat?.id ?? null}
        onClose={() => setGalleryOpen(false)}
        onCreated={(tophId) => {
          setGalleryOpen(false);
          onClose();
          onAction(tophId, "config");
        }}
      />
    </>
  );
}
