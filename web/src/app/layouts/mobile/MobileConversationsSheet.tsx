import { useEffect, useState } from "react";
import { Plus } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { chatSessionTitle, chatsForToph, latestChatForToph, useChats, type TophPreset } from "../../../features/conversations/store";
import { ensureChatSubjects } from "../../../features/conversations/subjects";
import TophRow from "../../../features/agents/components/TophRow";
import BotConfig from "../../../features/agents/components/BotConfig";
import TophTasksSheet from "../../../features/conversations/components/TophTasksSheet";
import { Modal } from "@/shared/boardui/base/modal/modal";
import { useApp } from "../../store";

interface Props {
  open: boolean;
  project: Project;
  onClose: () => void;
  onSelected: () => void;
}

const FIRST_TOPH: TophPreset = {
  name: "Toph",
  role: "Toph",
  description: "",
  personality: "",
  prompt: "",
  color: "#FFB547",
  avatar: "toph-logo",
  agentMode: "build",
  permissionMode: "yolo",
  mcpServers: [],
  emailAccountIds: [],
  tools: ["generate_image"],
  language: "auto",
};

/** Mobile Toph sheet: one Toph per project. */
export default function MobileConversationsSheet({ open, project, onClose, onSelected }: Props) {
  const chats = useChats((state) => state.byProject[project.id]);
  const ensure = useChats((state) => state.ensure);
  const createConversation = useChats((state) => state.createConversation);
  const notifications = useApp((state) => state.notifications);
  const [configOpen, setConfigOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);

  useEffect(() => {
    ensure(project.id);
  }, [ensure, project.id]);

  useEffect(() => {
    const latest = (chats?.tophs ?? [])
      .map((toph) => latestChatForToph(chats, toph.id))
      .filter((chat): chat is NonNullable<typeof chat> => Boolean(chat));
    void ensureChatSubjects(project.id, latest);
  }, [project.id, chats?.chats, chats?.tophs]);

  const toph = chats?.tophs[0] ?? null;
  const tasks = toph ? chatsForToph(chats, toph.id) : [];
  const unread = toph
    ? notifications.filter(
        (notification) => !notification.read
          && notification.projectId === project.id
          && (notification.botId === toph.id
            || (notification.chatId
              ? (chats?.chats ?? []).some(
                  (chat) => chat.id === notification.chatId && chat.participantIds.includes(toph.id),
                )
              : false)),
      ).length
    : 0;

  function select(chatId: string) {
    useApp.getState().markChatNotificationsRead(chatId);
    useChats.getState().setActiveChat(project.id, chatId);
    useChats.getState().touchConversation(project.id, chatId);
    onClose();
    onSelected();
  }

  function openToph() {
    if (!toph) return;
    const latest = latestChatForToph(chats, toph.id);
    if (latest) {
      select(latest.id);
      return;
    }
    newTask();
  }

  function newTask() {
    if (!toph) return;
    const created = createConversation(project.id, [toph.id], { name: toph.name });
    if (created) select(created.id);
  }

  function createFirst() {
    const created = useChats.getState().createToph(project.id, FIRST_TOPH);
    if (created) {
      const chat = createConversation(project.id, [created.id], { name: created.name });
      if (chat) select(chat.id);
    }
  }

  return (
    <>
      <Modal
        isOpen={open && !configOpen && !tasksOpen}
        onClose={onClose}
        title="Toph"
        description="Um Toph por projeto, conectado aos harnesses."
        placement="bottom"
        size="sm"
        bodyClassName="p-2"
        swipeToClose
      >
        <div className="flex max-h-[min(60dvh,500px)] flex-col gap-0.5 overflow-y-auto">
          {!toph ? (
            <button type="button" onClick={createFirst} className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-border-button-default px-2.5 py-3 text-start text-caption-1-medium text-text-secondary">
              <span className="flex size-8 items-center justify-center rounded-full bg-background-secondary-default"><Plus size={14} /></span>
              Criar o Toph
            </button>
          ) : (
            <TophRow
              toph={toph}
              compact
              subject={(() => {
                const latest = latestChatForToph(chats, toph.id);
                return latest ? chatSessionTitle(chats, latest) : "";
              })()}
              unread={unread}
              onOpen={openToph}
              onNew={newTask}
              onConfig={() => setConfigOpen(true)}
              onSessions={() => setTasksOpen(true)}
            />
          )}
        </div>
      </Modal>

      {toph && configOpen ? (
        <Modal isOpen onClose={() => setConfigOpen(false)} title={toph.name} description="Identidade, prompt, modelo e ferramentas do Toph." size="lg" placement="bottom" bodyClassName="p-0" swipeToClose>
          <BotConfig projectId={project.id} projectRoot={project.root} bot={toph} />
        </Modal>
      ) : null}

      <TophTasksSheet
        open={Boolean(toph) && tasksOpen}
        projectId={project.id}
        toph={toph}
        projectChats={chats}
        chats={tasks}
        onClose={() => setTasksOpen(false)}
        onOpen={(chatId) => { setTasksOpen(false); select(chatId); }}
        onNew={() => { setTasksOpen(false); newTask(); }}
      />
    </>
  );
}
