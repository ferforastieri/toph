import { useEffect, useState, type ReactNode } from "react";
import { Bot, Plus, Settings2 } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { useChats } from "../../conversations/store";
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

/** One normal conversation per project: a team with one or more Tophs. */
export default function BotsSidebar({ project, headerControl, onSelectChat }: Props) {
  const chats = useChats((state) => state.byProject[project.id]);
  const ensure = useChats((state) => state.ensure);
  const updateChat = useChats((state) => state.updateChat);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamInfo, setTeamInfo] = useState("");

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  const chat = chats?.chat ?? null;
  const tophs = chats?.tophs ?? [];

  function openChat() {
    onSelectChat?.();
  }

  function addToph() {
    setGalleryOpen(true);
    onSelectChat?.();
  }

  function openTeam() {
    if (!chat) return;
    setTeamInfo(chat.description);
    setTeamOpen(true);
  }

  function saveTeam() {
    if (!chat) return;
    updateChat(project.id, chat.id, { description: teamInfo });
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
        {chats?.hydrated && chat ? (
          <>
            <div className="mb-1.5 flex items-center gap-2 px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
              <span className="flex-1">Conversa</span>
              <span>{tophs.length}</span>
            </div>
            <div className={cx("mb-4 flex items-center gap-1 rounded-xl bg-background-tertiary-default pe-1")}>
              <button type="button" onClick={openChat} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-start">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-500/12 text-accent-500"><Bot size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-caption-1-medium text-text-primary">{chat.name || "Equipe"}</span>
                  <span className="block truncate text-caption-2-regular text-text-tertiary">{tophs.length === 0 ? "Sem Tophs" : `${tophs.length} Toph${tophs.length === 1 ? "" : "s"} · conversa compartilhada`}</span>
                </span>
              </button>
              <Button variant="ghost" size="xs" iconOnly leadingIcon={Settings2} aria-label="Configurar conversa" title="Configurar conversa" onClick={openTeam} />
            </div>

            <div className="mb-1.5 flex items-center gap-2 px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
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
            ) : (
              <div className="flex flex-col gap-0.5">
                {tophs.map((toph) => (
                  <TophRow
                    key={toph.id}
                    toph={toph}
                    selected={Boolean(toph.coordinator)}
                    onOpen={() => fireTophAction("config", toph.id)}
                    onConfig={() => fireTophAction("config", toph.id)}
                    onSessions={() => fireTophAction("sessions", toph.id)}
                  />
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>

      <Modal
        isOpen={teamOpen}
        onClose={() => setTeamOpen(false)}
        title="Configurar conversa"
        description="Informações gerais compartilhadas com todos os Tophs."
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
        onClose={() => setGalleryOpen(false)}
        onCreated={(tophId) => { setGalleryOpen(false); fireTophAction("config", tophId); }}
      />
    </div>
  );
}
