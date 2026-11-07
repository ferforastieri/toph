import { useEffect, useState, type ReactNode } from "react";
import { Bot, MoreHorizontal, Pencil, Plus, Settings2, Trash2, UserRound } from "@toph/icons";
import { api, type Project } from "../../../shared/api";
import { activeChat, chatTophs, useChats } from "../../conversations/store";
import TophGallery from "./TophGallery";
import TophRow from "./TophRow";
import { Button } from "@/shared/boardui/base/buttons/button";
import SidebarHeader from "../../../app/components/SidebarHeader";
import { Textarea } from "@/shared/boardui/base/textarea/textarea";
import { Modal } from "@/shared/boardui/base/modal/modal";
import { Dropdown, DropdownItem, DropdownPopover, DropdownTrigger } from "@/shared/boardui/base/dropdown/dropdown";
import { cx } from "@/shared/boardui/utils/cx";

interface Props {
  project: Project;
  headerControl?: ReactNode;
  onSelectChat?: () => void;
}

function fireTophAction(action: "config" | "sessions", tophId: string) {
  window.dispatchEvent(new CustomEvent("toph:toph-action", { detail: { action, tophId } }));
}

export default function BotsSidebar({ project, headerControl, onSelectChat }: Props) {
  const chats = useChats((state) => state.byProject[project.id]);
  const ensure = useChats((state) => state.ensure);
  const setActiveChat = useChats((state) => state.setActiveChat);
  const createChat = useChats((state) => state.createChat);
  const updateChat = useChats((state) => state.updateChat);
  const deleteChat = useChats((state) => state.deleteChat);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryChatId, setGalleryChatId] = useState<string | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamInfo, setTeamInfo] = useState("");

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  const chat = activeChat(chats);
  const tophs = chatTophs(chats, chat?.id);
  const individuals = chats?.chats.filter((item) => item.kind === "individual") ?? [];
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

  function addIndividual() {
    const created = createChat(project.id, "Individual");
    setActiveChat(project.id, created.id);
    setGalleryChatId(created.id);
    setGalleryOpen(true);
    onSelectChat?.();
  }

  function openGallery() {
    setGalleryChatId(chat?.id ?? null);
    setGalleryOpen(true);
  }

  function openChat(id: string) {
    setActiveChat(project.id, id);
    onSelectChat?.();
  }

  function renameChat(id: string, current: string) {
    const name = window.prompt("Nome da aba", current);
    if (!name?.trim()) return;
    updateChat(project.id, id, { name: name.trim() });
  }

  function removeChat(id: string, name: string) {
    if (individuals.length <= 1) {
      window.alert("Mantenha pelo menos uma aba individual.");
      return;
    }
    if (!window.confirm(`Excluir a aba “${name}” e o histórico dela?`)) return;
    void api.deleteChatMessages(project.id, id).catch(() => undefined);
    deleteChat(project.id, id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-primary-default">
      <SidebarHeader
        control={headerControl}
        icon={<Bot size={15} className="text-accent-500" />}
        title="Toph"
        count={<span className="rounded-full bg-background-tertiary-default px-1.5 text-caption-2-regular text-text-tertiary">{tophs.length}</span>}
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
              <span className="flex-1">Individual</span>
              <span>{individuals.length}</span>
              <Button variant="ghost" size="small" iconOnly leadingIcon={Plus} aria-label="Nova aba individual" title="Nova aba individual" onClick={addIndividual} />
            </div>
            <div className="mb-4 flex flex-col gap-0.5">
              {individuals.map((item) => {
                const selected = chat?.id === item.id;
                return (
                  <div key={item.id} className={cx("group flex w-full items-center rounded-xl pe-1 transition-colors", selected ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover")}>
                    <button type="button" onClick={() => openChat(item.id)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-start">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-background-secondary-default text-text-tertiary"><UserRound size={14} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-caption-1-medium text-text-primary">{item.name}</span>
                        <span className="block truncate text-caption-2-regular text-text-tertiary">Um Toph só</span>
                      </span>
                    </button>
                    <Dropdown>
                      <DropdownTrigger aria-label={`Opções de ${item.name}`} className="flex size-7 items-center justify-center rounded-lg text-text-tertiary opacity-0 transition-opacity hover:bg-background-primary-hover hover:text-text-primary group-hover:opacity-100">
                        <MoreHorizontal size={14} />
                      </DropdownTrigger>
                      <DropdownPopover aria-label={`Opções de ${item.name}`} placement="bottom end" className="w-40 p-1">
                        <DropdownItem onSelect={() => renameChat(item.id, item.name)}><Pencil size={14} /> Renomear</DropdownItem>
                        <DropdownItem onSelect={() => removeChat(item.id, item.name)}><Trash2 size={14} /> Excluir</DropdownItem>
                      </DropdownPopover>
                    </Dropdown>
                  </div>
                );
              })}
            </div>

            {team ? (
              <>
                <div className="mb-1.5 flex items-center gap-2 px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                  <span className="flex-1">Equipe</span>
                </div>
                <div className="mb-4 flex flex-col gap-0.5">
                  <div className={cx("flex w-full items-center rounded-xl pe-1 transition-colors", chat?.id === team.id ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover")}>
                    <button type="button" onClick={() => openChat(team.id)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-start">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-background-secondary-default text-text-tertiary"><Bot size={14} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-caption-1-medium text-text-primary">{team.name}</span>
                        <span className="block truncate text-caption-2-regular text-text-tertiary">Coordenador + membros</span>
                      </span>
                    </button>
                    <Button variant="ghost" size="xs" iconOnly leadingIcon={Settings2} aria-label="Configurar equipe" title="Configurar equipe" onClick={openTeam} />
                  </div>
                </div>
              </>
            ) : null}

            {chat ? (
              <>
                <div className="mb-1.5 flex items-center gap-2 px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                  <Bot size={12} />
                  <span className="flex-1">Agentes</span>
                  <span>{tophs.length}</span>
                  {chat.kind === "team" ? (
                    <Button variant="ghost" size="small" iconOnly leadingIcon={Plus} aria-label="Adicionar Toph à equipe" title="Adicionar Toph à equipe" onClick={openGallery} />
                  ) : null}
                </div>
                <div className="flex flex-col gap-0.5">
                  {tophs.length === 0 ? (
                    <button
                      type="button"
                      onClick={openGallery}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-border-button-default px-2.5 py-2.5 text-start text-caption-1-medium text-text-secondary transition-colors hover:bg-background-primary-hover hover:text-text-primary"
                    >
                      <span className="flex size-8 items-center justify-center rounded-full bg-background-secondary-default"><Plus size={14} /></span>
                      Escolher Toph
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
        chatId={galleryChatId ?? chat?.id ?? null}
        onClose={() => { setGalleryOpen(false); setGalleryChatId(null); }}
        onCreated={() => { setGalleryOpen(false); setGalleryChatId(null); }}
      />
    </div>
  );
}
