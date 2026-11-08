import { useEffect, useState } from "react";
import { Plus, Trash2 } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { activeChat, chatTophs, teamChats, useChats } from "../../../features/conversations/store";
import { agentApi } from "../../../features/agents/api";
import TophGallery from "../../../features/agents/components/TophGallery";
import TeamAvatar from "../../../features/agents/components/TeamAvatar";
import TophRow from "../../../features/agents/components/TophRow";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Modal } from "@/shared/boardui/base/modal/modal";
import { useConfirm } from "../../../shared/ui/confirm";
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
  const removeToph = useChats((state) => state.removeToph);
  const deleteChat = useChats((state) => state.deleteChat);
  const confirm = useConfirm();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryChatId, setGalleryChatId] = useState<string | null>(null);

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  const teams = teamChats(chats);
  const chat = activeChat(chats);
  const tophs = chatTophs(chats, chat?.id);

  function selectChat(chatId: string) {
    setActiveChat(project.id, chatId);
    onClose();
    onSelected();
  }

  function addTeam() {
    const created = createChat(project.id, "Equipe");
    setActiveChat(project.id, created.id);
    setGalleryChatId(created.id);
    setGalleryOpen(true);
  }

  function addToph() {
    if (!chat) return;
    setGalleryChatId(chat.id);
    setGalleryOpen(true);
  }

  async function deleteTeam(team: { id: string; name: string }) {
    const ok = await confirm({
      title: `Apagar a equipe “${team.name || "Equipe"}”?`,
      message: "As mensagens, sessões e Tophs desta equipe serão removidos. Essa ação não pode ser desfeita.",
      confirmLabel: "Apagar equipe",
      danger: true,
    });
    if (!ok) return;
    try {
      await agentApi.deleteChat(project.id, team.id);
    } catch {
      // Local removal still wins when the server has nothing left to delete.
    }
    deleteChat(project.id, team.id);
  }

  async function removeMember(tophId: string, name: string) {
    const ok = await confirm({
      title: `Remover ${name} da equipe?`,
      message: "O Toph e o histórico dele nesta equipe serão removidos. Essa ação não pode ser desfeita.",
      confirmLabel: "Remover da equipe",
      danger: true,
    });
    if (ok) removeToph(project.id, tophId);
  }

  return (
    <>
      <Modal
        isOpen={open && !galleryOpen}
        onClose={onClose}
        title="Tophs"
        description="Equipes normais; cada uma pode ter um ou mais Tophs."
        placement="bottom"
        size="sm"
        bodyClassName="p-2"
        swipeToClose
      >
        <div className="flex max-h-[min(60dvh,500px)] flex-col gap-0.5 overflow-y-auto">
          <div className="mb-1 flex items-center gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            <span className="flex-1">Equipes</span>
            <Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Nova equipe" title="Nova equipe" onClick={addTeam} />
          </div>
          {teams.map((team) => {
            const count = (chats?.tophs ?? []).filter((toph) => toph.chatId === team.id).length;
            const selected = chat?.id === team.id;
            return (
              <div key={team.id} className={cx("flex items-center gap-1 rounded-xl pe-1 transition-colors", selected ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover")}>
                <button type="button" onClick={() => selectChat(team.id)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-start">
                  <TeamAvatar tophs={(chats?.tophs ?? []).filter((toph) => toph.chatId === team.id)} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-caption-1-medium text-text-primary">{team.name || "Equipe"}</span>
                    <span className="block truncate text-caption-2-regular text-text-tertiary">{count} Toph{count === 1 ? "" : "s"}</span>
                  </span>
                </button>
                <Button variant="ghost" size="xs" iconOnly leadingIcon={Trash2} aria-label={`Apagar equipe ${team.name}`} title="Apagar equipe" className="text-status-rose-text" onClick={() => void deleteTeam(team)} />
              </div>
            );
          })}

          <div className="mb-1 mt-3 flex items-center gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            <span className="flex-1">Tophs da equipe</span>
            <Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Adicionar Toph" title="Adicionar Toph" onClick={addToph} />
          </div>
          {tophs.length === 0 ? (
            <button
              type="button"
              onClick={addToph}
              className="mb-3 flex w-full items-center gap-2.5 rounded-xl border border-dashed border-border-button-default px-2.5 py-2.5 text-start text-caption-1-medium text-text-secondary transition-colors hover:bg-background-primary-hover hover:text-text-primary"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-background-secondary-default"><Plus size={14} /></span>
              Adicionar primeiro Toph
            </button>
          ) : tophs.map((toph) => (
            <TophRow
              key={toph.id}
              toph={toph}
              compact
              onOpen={() => { onClose(); onAction(toph.id, "config"); }}
              onConfig={() => { onClose(); onAction(toph.id, "config"); }}
              onSessions={() => { onClose(); onAction(toph.id, "sessions"); }}
              onRemove={() => void removeMember(toph.id, toph.name)}
            />
          ))}
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
