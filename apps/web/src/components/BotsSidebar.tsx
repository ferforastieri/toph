import { useEffect, useState, type ReactNode } from "react";
import { Bot, MoreHorizontal, Pencil, Plus, Trash2 } from "@toph/icons";
import { api, type Project } from "../api";
import { activeChat, chatTophs, useChats, type TophChat } from "../chats";
import TophGallery from "./TophGallery";
import TophRow from "./TophRow";
import { Button } from "@/boardui/base/buttons/button";
import SidebarHeader from "./SidebarHeader";
import { Dropdown, DropdownItem, DropdownPopover, DropdownTrigger } from "@/boardui/base/dropdown/dropdown";
import { Input } from "@/boardui/base/input/input";
import { Textarea } from "@/boardui/base/textarea/textarea";
import { Modal } from "@/boardui/base/modal/modal";
import { useConfirm } from "../ui/confirm";
import { cx } from "@/boardui/utils/cx";

interface Props {
  project: Project;
  headerControl?: ReactNode;
}

function fireTophAction(action: "config" | "sessions", tophId: string) {
  window.dispatchEvent(new CustomEvent("toph:toph-action", { detail: { action, tophId } }));
}

interface ChatDialogProps {
  open: boolean;
  chat: TophChat | null;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
}

function ChatDialog({ open, chat, onClose, onSave }: ChatDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(chat?.name ?? "");
    setDescription(chat?.description ?? "");
  }, [chat, open]);

  function submit() {
    if (!name.trim()) return;
    onSave(name, description);
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={chat ? "Editar chat" : "Novo chat"}
      description={chat ? "Altere o nome e a descrição deste chat." : "Crie o chat e adicione os Tophs dentro dele."}
      placement="center"
      size="md"
      bodyClassName="p-4"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={submit}>{chat ? "Salvar" : "Criar chat"}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Nome" value={name} onChange={setName} placeholder="Ex.: checkout" autoFocus />
        <Textarea label="Descrição" value={description} onChange={setDescription} placeholder="Ex.: pagamentos e carrinho" rows={3} />
      </div>
    </Modal>
  );
}

export default function BotsSidebar({ project, headerControl }: Props) {
  const chats = useChats((state) => state.byProject[project.id]);
  const ensure = useChats((state) => state.ensure);
  const setActiveChat = useChats((state) => state.setActiveChat);
  const createChat = useChats((state) => state.createChat);
  const updateChat = useChats((state) => state.updateChat);
  const deleteChat = useChats((state) => state.deleteChat);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChat, setEditingChat] = useState<TophChat | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  useEffect(() => {
    const handler = () => {
      setEditingChat(null);
      setDialogOpen(true);
    };
    window.addEventListener("toph:create-chat", handler);
    return () => window.removeEventListener("toph:create-chat", handler);
  }, []);

  const chat = activeChat(chats);
  const tophs = chatTophs(chats, chat?.id);

  function openCreate() {
    setEditingChat(null);
    setDialogOpen(true);
  }

  function openEdit(target: TophChat) {
    setEditingChat(target);
    setDialogOpen(true);
  }

  function saveChat(name: string, description: string) {
    if (editingChat) updateChat(project.id, editingChat.id, { name, description });
    else createChat(project.id, name, description);
    setDialogOpen(false);
    setEditingChat(null);
  }

  async function removeChat(target: TophChat) {
    const ok = await confirm({
      title: "Excluir chat?",
      message: `Excluir “${target.name}” e todo o histórico dele? Os Tophs e mensagens deste chat serão apagados.`,
      confirmLabel: "Excluir chat",
      danger: true,
    });
    if (!ok) return;
    const targetTophs = chatTophs(chats, target.id);
    await Promise.all(targetTophs.map((toph) =>
      toph.sessionId ? api.interruptOpencodeSession(toph.sessionId).catch(() => undefined) : Promise.resolve(),
    ));
    await api.deleteChatMessages(project.id, target.id).catch(() => undefined);
    deleteChat(project.id, target.id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-primary-default">
      <SidebarHeader
        control={headerControl}
        icon={<Bot size={15} className="text-accent-500" />}
        title="Toph"
        count={<span className="rounded-full bg-background-tertiary-default px-1.5 text-caption-2-regular text-text-tertiary">{tophs.length}</span>}
        actions={<Button variant="ghost" size="xs" iconOnly leadingIcon={Plus} aria-label="Criar chat" title="Criar chat" disabled={!chats?.hydrated} onClick={openCreate} />}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {!chats?.hydrated ? (
          <div className="flex items-center justify-center gap-2 py-8 text-caption-1-regular text-text-tertiary">
            <span className="size-3 animate-spin rounded-full border-2 border-text-tertiary/30 border-t-text-tertiary" />
            Carregando chats...
          </div>
        ) : null}
        {chats?.hydrated ? <>
        <div className="mb-1.5 flex items-center gap-2 px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
          <span className="text-sm leading-none">#</span>
          <span className="flex-1">Canais</span>
          <span>{chats?.chats.length ?? 0}</span>
        </div>
        <div className="mb-4 flex flex-col gap-0.5">
          {!chats || chats.chats.length === 0 ? (
            <button
              type="button"
              onClick={openCreate}
              className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-border-button-default px-2.5 py-2.5 text-start text-caption-1-medium text-text-secondary transition-colors hover:bg-background-primary-hover hover:text-text-primary"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-background-secondary-default"><Plus size={14} /></span>
              Criar primeiro chat
            </button>
          ) : chats.chats.map((item) => {
            const selected = chat?.id === item.id;
            return (
              <div key={item.id} className={cx("flex w-full items-center rounded-xl pe-1 transition-colors", selected ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover")}>
                <button
                  type="button"
                  onClick={() => setActiveChat(project.id, item.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-start"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-background-secondary-default text-caption-1-semibold text-text-tertiary">#</span>
                  <span className="min-w-0 flex-1 truncate text-caption-1-medium text-text-primary">{item.name}</span>
                </button>
                <Dropdown>
                  <DropdownTrigger aria-label={`Opções de ${item.name}`} className="flex size-7 items-center justify-center rounded-lg text-text-tertiary hover:bg-background-primary-hover hover:text-text-primary">
                    <MoreHorizontal size={14} />
                  </DropdownTrigger>
                  <DropdownPopover aria-label={`Opções de ${item.name}`} placement="bottom end" className="w-44 p-1">
                    <DropdownItem onSelect={() => openEdit(item)}><Pencil size={14} /> Editar chat</DropdownItem>
                    <DropdownItem onSelect={() => void removeChat(item)}><Trash2 size={14} /> Excluir chat</DropdownItem>
                  </DropdownPopover>
                </Dropdown>
              </div>
            );
          })}
        </div>

        {chat ? (
          <>
            <div className="mb-1.5 flex items-center gap-2 px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
              <Bot size={12} />
              <span className="flex-1">Agentes</span>
              <span>{tophs.length}</span>
              <Button variant="ghost" size="small" iconOnly leadingIcon={Plus} aria-label="Adicionar Toph ao chat" title="Adicionar Toph ao chat" onClick={() => setGalleryOpen(true)} />
            </div>
            <div className="flex flex-col gap-0.5">
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
                <TophRow
                  key={toph.id}
                  toph={toph}
                  onOpen={() => fireTophAction("config", toph.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-border-button-default px-3 py-6 text-center text-caption-2-regular leading-relaxed text-text-tertiary">
            Selecione um chat para ver os Tophs.
          </div>
        )}
        </> : null}
      </div>

      <ChatDialog
        open={dialogOpen}
        chat={editingChat}
        onClose={() => { setDialogOpen(false); setEditingChat(null); }}
        onSave={saveChat}
      />

      <TophGallery
        open={galleryOpen}
        projectId={project.id}
        chatId={chat?.id ?? null}
        onClose={() => setGalleryOpen(false)}
        onCreated={(tophId) => fireTophAction("config", tophId)}
      />
    </div>
  );
}
