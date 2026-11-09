import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bot, Plus } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { chatDisplayName, chatsForToph, latestChatForToph, useChats } from "../../conversations/store";
import { openChatTab } from "../../conversations/navigation";
import { agentApi } from "../api";
import TophGallery from "./TophGallery";
import TophStartActions from "./TophStartActions";
import TophRow from "./TophRow";
import CreateGroupModal from "../../conversations/components/CreateGroupModal";
import BotConfig from "./BotConfig";
import TophTasksSheet from "../../conversations/components/TophTasksSheet";
import { Modal } from "@/shared/boardui/base/modal/modal";
import SidebarHeader from "../../../app/components/SidebarHeader";
import { useConfirm } from "../../../shared/ui/confirm";

interface Props {
  project: Project;
  headerControl?: ReactNode;
  onSelectChat?: () => void;
}

/** The project's Tophs. Clicking one opens a task; group tasks are created on demand. */
export default function BotsSidebar({ project, headerControl, onSelectChat }: Props) {
  const chats = useChats((state) => state.byProject[project.id]);
  const ensure = useChats((state) => state.ensure);
  const createConversation = useChats((state) => state.createConversation);
  const removeToph = useChats((state) => state.removeToph);
  const confirm = useConfirm();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [tasksTophId, setTasksTophId] = useState<string | null>(null);

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  const tophs = chats?.tophs ?? [];
  const selectedIds = useMemo(() => {
    const active = chats?.chats.find((chat) => chat.id === chats.activeChatId);
    return new Set(active?.participantIds ?? []);
  }, [chats?.chats, chats?.activeChatId]);
  const configToph = tophs.find((toph) => toph.id === configId) ?? null;
  const tasksToph = tophs.find((toph) => toph.id === tasksTophId) ?? null;
  const tasks = tasksToph ? chatsForToph(chats, tasksToph.id) : [];

  function groupsOf(tophId: string) {
    return (chats?.chats ?? []).filter(
      (chat) => chat.participantIds.length > 1 && chat.participantIds.includes(tophId),
    );
  }

  function openTask(chatId: string) {
    const current = useChats.getState().byProject[project.id];
    const chat = current?.chats.find((item) => item.id === chatId);
    if (!chat) return;
    useChats.getState().setActiveChat(project.id, chatId);
    useChats.getState().touchConversation(project.id, chatId);
    openChatTab(project.id, chatId, chatDisplayName(current, chat, 2));
    onSelectChat?.();
  }

  function openToph(tophId: string) {
    const latest = latestChatForToph(chats, tophId);
    if (latest) {
      openTask(latest.id);
      return;
    }
    const toph = tophs.find((item) => item.id === tophId);
    const created = createConversation(project.id, [tophId], { name: toph?.name ?? "" });
    if (created) openTask(created.id);
  }

  function newTask(tophId: string) {
    const toph = tophs.find((item) => item.id === tophId);
    const created = createConversation(project.id, [tophId], { name: toph?.name ?? "" });
    if (created) openTask(created.id);
  }

  function createGroup(name: string, description: string, participantIds: string[]) {
    const created = createConversation(project.id, participantIds, { name, description });
    setGroupOpen(false);
    if (created) openTask(created.id);
  }

  async function deleteToph(tophId: string, name: string) {
    const ok = await confirm({
      title: `Apagar ${name}?`,
      message: "A configuração e o histórico deste Toph em todas as conversas serão removidos. Essa ação não pode ser desfeita.",
      confirmLabel: "Apagar Toph",
      danger: true,
    });
    if (!ok) return;
    await agentApi.deleteToph(project.id, tophId).catch(() => undefined);
    removeToph(project.id, tophId);
    setConfigId(null);
    setTasksTophId(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-primary-default">
      <SidebarHeader
        control={headerControl}
        icon={<Bot size={15} className="text-accent-500" />}
        title="Tophs"
        count={<span className="rounded-full bg-background-tertiary-default px-1.5 text-caption-2-regular text-text-tertiary">{tophs.length}</span>}
      />
      <div className="px-2.5 pb-1 pt-2">
        <TophStartActions compact onCreateToph={() => setGalleryOpen(true)} onCreateGroup={() => setGroupOpen(true)} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5 pt-1">
        {!chats?.hydrated ? (
          <div className="flex items-center justify-center gap-2 py-8 text-caption-1-regular text-text-tertiary">
            <span className="size-3 animate-spin rounded-full border-2 border-text-tertiary/30 border-t-text-tertiary" />
            Carregando...
          </div>
        ) : null}
        {chats?.hydrated && tophs.length === 0 ? (
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="mt-1 flex w-full flex-col items-start gap-2 rounded-2xl border border-dashed border-border-button-default px-3 py-4 text-start transition-colors hover:bg-background-primary-hover"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-background-secondary-default text-accent-500"><Plus size={16} /></span>
            <span className="text-caption-1-semibold text-text-primary">Crie seu primeiro Toph</span>
            <span className="text-caption-2-regular text-text-tertiary">Escolha um perfil pronto ou comece do zero.</span>
          </button>
        ) : null}
        {tophs.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {tophs.map((toph) => {
              const groups = groupsOf(toph.id);
              return (
                <TophRow
                  key={toph.id}
                  toph={toph}
                  selected={selectedIds.has(toph.id)}
                  groupCount={groups.length}
                  groupNames={groups.map((chat) => chatDisplayName(chats, chat))}
                  onOpen={() => openToph(toph.id)}
                  onNew={() => newTask(toph.id)}
                  onConfig={() => setConfigId(toph.id)}
                  onSessions={() => setTasksTophId(toph.id)}
                  onRemove={() => void deleteToph(toph.id, toph.name)}
                />
              );
            })}
          </div>
        ) : null}
      </div>

      {configToph ? (
        <Modal isOpen onClose={() => setConfigId(null)} title={configToph.name} description="Identidade, prompt, modelo e ferramentas deste Toph." size="lg" bodyClassName="p-0">
          <BotConfig projectId={project.id} projectRoot={project.root} bot={configToph} />
        </Modal>
      ) : null}

      <TophTasksSheet
        open={Boolean(tasksToph)}
        toph={tasksToph}
        projectChats={chats}
        chats={tasks}
        onClose={() => setTasksTophId(null)}
        onOpen={(chatId) => { setTasksTophId(null); openTask(chatId); }}
        onNew={() => { if (tasksToph) { setTasksTophId(null); newTask(tasksToph.id); } }}
      />

      <CreateGroupModal open={groupOpen} tophs={tophs} onClose={() => setGroupOpen(false)} onCreate={createGroup} />

      <TophGallery
        open={galleryOpen}
        projectId={project.id}
        onClose={() => setGalleryOpen(false)}
        onCreated={(tophId) => {
          setGalleryOpen(false);
          const createdToph = useChats.getState().byProject[project.id]?.tophs.find((item) => item.id === tophId);
          const created = createConversation(project.id, [tophId], { name: createdToph?.name ?? "" });
          setConfigId(tophId);
          if (created) openTask(created.id);
        }}
      />
    </div>
  );
}
