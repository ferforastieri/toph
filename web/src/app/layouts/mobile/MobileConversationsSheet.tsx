import { useEffect, useState } from "react";
import { Plus } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { chatDisplayName, chatSessionTitle, chatsForToph, latestChatForToph, useChats } from "../../../features/conversations/store";
import { agentApi } from "../../../features/agents/api";
import { ensureChatSubjects } from "../../../features/conversations/subjects";
import TophGallery from "../../../features/agents/components/TophGallery";
import TophStartActions from "../../../features/agents/components/TophStartActions";
import TophRow from "../../../features/agents/components/TophRow";
import BotConfig from "../../../features/agents/components/BotConfig";
import CreateGroupModal from "../../../features/conversations/components/CreateGroupModal";
import TophTasksSheet from "../../../features/conversations/components/TophTasksSheet";
import { Modal } from "@/shared/boardui/base/modal/modal";
import { useConfirm } from "../../../shared/ui/confirm";
import { useApp } from "../../store";

interface Props {
  open: boolean;
  project: Project;
  onClose: () => void;
  onSelected: () => void;
}

/** Mobile Toph list: a conversation is opened from the Toph, never from a team. */
export default function MobileConversationsSheet({ open, project, onClose, onSelected }: Props) {
  const chats = useChats((state) => state.byProject[project.id]);
  const ensure = useChats((state) => state.ensure);
  const createConversation = useChats((state) => state.createConversation);
  const removeToph = useChats((state) => state.removeToph);
  const notifications = useApp((state) => state.notifications);
  const confirm = useConfirm();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [tasksTophId, setTasksTophId] = useState<string | null>(null);

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  useEffect(() => {
    const latest = (chats?.tophs ?? [])
      .map((toph) => latestChatForToph(chats, toph.id))
      .filter((chat): chat is NonNullable<typeof chat> => Boolean(chat));
    void ensureChatSubjects(project.id, latest);
  }, [project.id, chats?.chats, chats?.tophs]);

  const tophs = chats?.tophs ?? [];
  const configToph = tophs.find((toph) => toph.id === configId) ?? null;
  const tasksToph = tophs.find((toph) => toph.id === tasksTophId) ?? null;
  const tasks = tasksToph ? chatsForToph(chats, tasksToph.id) : [];

  function groupsOf(tophId: string) {
    return (chats?.chats ?? []).filter(
      (chat) => chat.participantIds.length > 1 && chat.participantIds.includes(tophId),
    );
  }

  function unreadForToph(tophId: string): number {
    const chatIds = new Set((chats?.chats ?? []).filter((chat) => chat.participantIds.includes(tophId)).map((chat) => chat.id));
    return notifications.filter(
      (notification) => !notification.read
        && notification.projectId === project.id
        && (notification.botId === tophId || (notification.chatId ? chatIds.has(notification.chatId) : false)),
    ).length;
  }

  function select(chatId: string) {
    useApp.getState().markChatNotificationsRead(chatId);
    useChats.getState().setActiveChat(project.id, chatId);
    useChats.getState().touchConversation(project.id, chatId);
    onClose();
    onSelected();
  }

  function openToph(tophId: string) {
    const latest = latestChatForToph(chats, tophId);
    if (latest) return select(latest.id);
    const toph = tophs.find((item) => item.id === tophId);
    const created = createConversation(project.id, [tophId], { name: toph?.name ?? "" });
    if (created) select(created.id);
  }

  function newTask(tophId: string) {
    const toph = tophs.find((item) => item.id === tophId);
    const created = createConversation(project.id, [tophId], { name: toph?.name ?? "" });
    if (created) select(created.id);
  }

  function createGroup(name: string, description: string, participantIds: string[]) {
    const created = createConversation(project.id, participantIds, { name, description });
    setGroupOpen(false);
    if (created) select(created.id);
  }

  async function deleteToph(tophId: string, name: string) {
    const ok = await confirm({
      title: `Apagar ${name}?`,
      message: "A configuração e o histórico deste Toph em todas as conversas serão removidos.",
      confirmLabel: "Apagar Toph",
      danger: true,
    });
    if (!ok) return;
    await agentApi.deleteToph(project.id, tophId).catch(() => undefined);
    removeToph(project.id, tophId);
  }

  return (
    <>
      <Modal
        isOpen={open && !galleryOpen && !groupOpen && !configToph && !tasksToph}
        onClose={onClose}
        title="Tophs"
        description="Cada Toph tem tarefas individuais ou em grupo."
        placement="bottom"
        size="sm"
        bodyClassName="p-2"
        swipeToClose
      >
        <div className="px-1 pb-2.5">
          <TophStartActions onCreateToph={() => setGalleryOpen(true)} onCreateGroup={() => setGroupOpen(true)} />
        </div>
        <div className="flex max-h-[min(60dvh,500px)] flex-col gap-0.5 overflow-y-auto">
          {tophs.length === 0 ? (
            <button type="button" onClick={() => setGalleryOpen(true)} className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-border-button-default px-2.5 py-3 text-start text-caption-1-medium text-text-secondary">
              <span className="flex size-8 items-center justify-center rounded-full bg-background-secondary-default"><Plus size={14} /></span>
              Criar o primeiro Toph
            </button>
          ) : tophs.map((toph) => {
            const groups = groupsOf(toph.id);
            const latest = latestChatForToph(chats, toph.id);
            return (
              <TophRow
                key={toph.id}
                toph={toph}
                compact
                groupCount={groups.length}
                groupNames={groups.map((chat) => chatDisplayName(chats, chat))}
                subject={latest ? chatSessionTitle(chats, latest) : ""}
                unread={unreadForToph(toph.id)}
                onOpen={() => openToph(toph.id)}
                onNew={() => newTask(toph.id)}
                onConfig={() => setConfigId(toph.id)}
                onSessions={() => setTasksTophId(toph.id)}
                onRemove={() => void deleteToph(toph.id, toph.name)}
              />
            );
          })}
        </div>
      </Modal>

      {configToph ? (
        <Modal isOpen onClose={() => setConfigId(null)} title={configToph.name} description="Identidade, prompt, modelo e ferramentas deste Toph." size="lg" placement="bottom" bodyClassName="p-0" swipeToClose>
          <BotConfig projectId={project.id} projectRoot={project.root} bot={configToph} />
        </Modal>
      ) : null}

      <TophTasksSheet
        open={Boolean(tasksToph)}
        projectId={project.id}
        toph={tasksToph}
        projectChats={chats}
        chats={tasks}
        onClose={() => setTasksTophId(null)}
        onOpen={(chatId) => { setTasksTophId(null); select(chatId); }}
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
          if (created) select(created.id);
        }}
      />
    </>
  );
}
