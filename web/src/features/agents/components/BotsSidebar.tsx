import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bot, Plus } from "@toph/icons";
import type { Project } from "../../../shared/api";
import { chatSessionTitle, chatsForToph, latestChatForToph, useChats, type TophPreset } from "../../conversations/store";
import { openChatTab } from "../../conversations/navigation";
import { ensureChatSubjects } from "../../conversations/subjects";
import TophRow from "./TophRow";
import BotConfig from "./BotConfig";
import TophTasksSheet from "../../conversations/components/TophTasksSheet";
import { Modal } from "@/shared/boardui/base/modal/modal";
import SidebarHeader from "../../../app/components/SidebarHeader";
import { useApp } from "../../../app/store";

interface Props {
  project: Project;
  headerControl?: ReactNode;
  onSelectChat?: () => void;
}

/** The project's single Toph. It opens its latest task; a new one is created on demand. */
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

export default function BotsSidebar({ project, headerControl, onSelectChat }: Props) {
  const chats = useChats((state) => state.byProject[project.id]);
  const ensure = useChats((state) => state.ensure);
  const createConversation = useChats((state) => state.createConversation);
  const notifications = useApp((state) => state.notifications);
  const [configId, setConfigId] = useState<string | null>(null);
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
  const configToph = toph && toph.id === configId ? toph : null;
  const tasks = toph ? chatsForToph(chats, toph.id) : [];
  const unread = useMemo(() => {
    if (!toph) return 0;
    const chatIds = new Set((chats?.chats ?? []).filter((chat) => chat.participantIds.includes(toph.id)).map((chat) => chat.id));
    return notifications.filter(
      (notification) => !notification.read
        && notification.projectId === project.id
        && (notification.botId === toph.id || (notification.chatId ? chatIds.has(notification.chatId) : false)),
    ).length;
  }, [chats?.chats, notifications, project.id, toph]);

  function openTask(chatId: string) {
    const current = useChats.getState().byProject[project.id];
    const chat = current?.chats.find((item) => item.id === chatId);
    if (!chat) return;
    useApp.getState().markChatNotificationsRead(chatId);
    useChats.getState().setActiveChat(project.id, chatId);
    useChats.getState().touchConversation(project.id, chatId);
    openChatTab(project.id, chatId, "Toph");
    onSelectChat?.();
  }

  function newTask() {
    if (!toph) return;
    const created = createConversation(project.id, [toph.id], { name: toph.name });
    if (created) openTask(created.id);
  }

  function openToph() {
    if (!toph) return;
    const latest = latestChatForToph(chats, toph.id);
    if (latest) {
      openTask(latest.id);
      return;
    }
    newTask();
  }

  function createFirst() {
    const created = useChats.getState().createToph(project.id, FIRST_TOPH);
    if (created) {
      const chat = createConversation(project.id, [created.id], { name: created.name });
      if (chat) openTask(chat.id);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-primary-default">
      <SidebarHeader control={headerControl} icon={<Bot size={15} className="text-accent-500" />} title="Toph" />
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5 pt-1">
        {!chats?.hydrated ? (
          <div className="flex items-center justify-center gap-2 py-8 text-caption-1-regular text-text-tertiary">
            <span className="size-3 animate-spin rounded-full border-2 border-text-tertiary/30 border-t-text-tertiary" />
            Carregando...
          </div>
        ) : null}
        {chats?.hydrated && !toph ? (
          <button
            type="button"
            onClick={createFirst}
            className="mt-1 flex w-full flex-col items-start gap-2 rounded-2xl border border-dashed border-border-button-default px-3 py-4 text-start transition-colors hover:bg-background-primary-hover"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-background-secondary-default text-accent-500"><Plus size={16} /></span>
            <span className="text-caption-1-semibold text-text-primary">Criar o Toph</span>
            <span className="text-caption-2-regular text-text-tertiary">Um Toph por projeto, conectado aos harnesses.</span>
          </button>
        ) : null}
        {toph ? (
          <div className="flex flex-col gap-0.5">
            <TophRow
              toph={toph}
              subject={(() => {
                const latest = latestChatForToph(chats, toph.id);
                return latest ? chatSessionTitle(chats, latest) : "";
              })()}
              unread={unread}
              onOpen={openToph}
              onNew={newTask}
              onConfig={() => setConfigId(toph.id)}
              onSessions={() => setTasksOpen(true)}
            />
          </div>
        ) : null}
      </div>

      {configToph ? (
        <Modal isOpen onClose={() => setConfigId(null)} title={configToph.name} description="Identidade, prompt, modelo e ferramentas do Toph." size="lg" bodyClassName="p-0">
          <BotConfig projectId={project.id} projectRoot={project.root} bot={configToph} />
        </Modal>
      ) : null}

      <TophTasksSheet
        open={Boolean(toph) && tasksOpen}
        projectId={project.id}
        toph={toph}
        projectChats={chats}
        chats={tasks}
        onClose={() => setTasksOpen(false)}
        onOpen={(chatId) => { setTasksOpen(false); openTask(chatId); }}
        onNew={() => { setTasksOpen(false); newTask(); }}
      />
    </div>
  );
}
