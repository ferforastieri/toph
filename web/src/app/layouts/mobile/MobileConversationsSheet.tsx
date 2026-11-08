import { useEffect, useState } from "react";
import { Bot, Plus } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { useChats } from "../../../features/conversations/store";
import TophGallery from "../../../features/agents/components/TophGallery";
import TophRow from "../../../features/agents/components/TophRow";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Modal } from "@/shared/boardui/base/modal/modal";

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
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  const chat = chats?.chat ?? null;
  const tophs = chats?.tophs ?? [];

  function selectChat() {
    onClose();
    onSelected();
  }

  function addToph() {
    setGalleryOpen(true);
  }

  return (
    <>
      <Modal
        isOpen={open && !galleryOpen}
        onClose={onClose}
        title="Tophs"
        description="A conversa é uma só; a equipe pode ter um ou mais Tophs."
        placement="bottom"
        size="sm"
        bodyClassName="p-2"
        swipeToClose
      >
        <div className="flex max-h-[min(60dvh,500px)] flex-col gap-0.5 overflow-y-auto">
          <div className="mb-1 flex items-center gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            <span className="flex-1">Conversa</span>
            <Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Novo Toph" title="Novo Toph" onClick={addToph} />
          </div>
          {chat ? (
            <button
              type="button"
              onClick={selectChat}
              className="mb-3 flex w-full items-center gap-2.5 rounded-xl bg-background-tertiary-default px-2 py-2 text-start"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-500/12 text-accent-500"><Bot size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-caption-1-medium text-text-primary">{chat.name || "Equipe"}</span>
                <span className="block truncate text-caption-2-regular text-text-tertiary">{tophs.length === 0 ? "Sem Tophs" : `${tophs.length} Toph${tophs.length === 1 ? "" : "s"} · conversa compartilhada`}</span>
              </span>
            </button>
          ) : null}

          <div className="mb-1 flex items-center gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            <span className="flex-1">Tophs</span>
            <Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Adicionar Toph" title="Adicionar Toph" onClick={addToph} />
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
              selected={Boolean(toph.coordinator)}
              onOpen={() => { onClose(); onAction(toph.id, "config"); }}
              onConfig={() => { onClose(); onAction(toph.id, "config"); }}
              onSessions={() => { onClose(); onAction(toph.id, "sessions"); }}
            />
          ))}
        </div>
      </Modal>

      <TophGallery
        open={galleryOpen}
        projectId={project.id}
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
