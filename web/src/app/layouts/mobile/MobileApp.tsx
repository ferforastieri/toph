import { useEffect, useRef, useState } from "react";
import { Bot, Boxes, Bug, Database, Files, GitBranch, Globe2, MoreHorizontal, TerminalSquare } from "@toph/icons";
import { api, type Project, type SchemaTable, type WebTarget } from "../../../shared/api";
import { useApp } from "../../store";
import { useIsMobile } from "../../../shared/ui/useIsMobile";
import { nativePushToken, requestMobileNotificationPermission } from "../../../features/notifications/notifications";
import { basename, quoteIdentifier } from "../../../shared/lib";
import BrandMark from "@toph/brand";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Modal } from "@/shared/boardui/base/modal/modal";
import BotStudioTab from "../../../features/conversations/components/BotStudioTab";
import DbPanelTab from "../../../features/databases/components/DbPanelTab";
import DiffPanelTab from "../../../features/editor/components/DiffPanelTab";
import EditorPanel from "../../../features/editor/components/EditorPanel";
import DebugPanel from "../../../features/debug/components/DebugPanel";
import WebPanelTab from "../../../features/previews/components/WebPanelTab";
import Tabs from "../../components/Tabs";
import TerminalPanel from "../../../features/terminal/components/TerminalPanel";
import Toasts from "../../../features/notifications/components/Toasts";
import FilesScreen from "./screens/FilesScreen";
import GitScreen from "./screens/GitScreen";
import DatabasesScreen from "./screens/DatabasesScreen";
import WebAppsScreen from "./screens/WebAppsScreen";
import ProjectSwitcher from "../../../features/projects/components/ProjectSwitcher";
import CloseProjectModal from "../../../features/projects/components/CloseProjectModal";
import MobileTopBar from "./components/MobileTopBar";
import { latestChatForToph, useChats } from "../../../features/conversations/store";
import { useTophDrafts } from "../../../features/agents/drafts";
import MobileBranchSheet from "./MobileBranchSheet";
import MobileAccountSheet from "./MobileAccountSheet";
import MobileConversationsSheet from "./MobileConversationsSheet";
import MobileBottomNav from "./MobileBottomNav";
import MobileMoreScreen from "./MobileMoreScreen";
import { type MobileScreen } from "./mobile-nav";
import GlobalSearch from "../../../features/search/components/GlobalSearch";
import TophSettings from "../../../features/settings/components/TophSettings";

export default function MobileApp() {
  const projects = useApp((state) => state.projects);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const setActiveProject = useApp((state) => state.setActiveProject);
  const tabs = useApp((state) => state.tabs);
  const activeTabId = useApp((state) => state.activeTabId);
  const openTab = useApp((state) => state.openTab);
  const notify = useApp((state) => state.notify);
  const user = useApp((state) => state.user);
  const notifications = useApp((state) => state.notifications);
  const closeProjectTab = useApp((state) => state.closeProjectTab);
  const mobile = useIsMobile();
  const project = projects.find((item) => item.id === activeProjectId) ?? null;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const screen = useApp((state) => state.mobileScreen);
  const setScreen = useApp((state) => state.setMobileScreen);
  const screenTitles: Record<MobileScreen, string> = {
    bots: "Toph",
    files: "Arquivos",
    scm: "Git",
    db: "Bancos",
    web: "Web apps",
    debug: "Debug",
    workspace: activeTab?.title ?? "Trabalho",
    more: "Mais",
  };
  const screenIcons = { bots: Bot, files: Files, scm: GitBranch, db: Database, web: Globe2, debug: Bug, workspace: Boxes, more: MoreHorizontal };
  const pageTitle = screenTitles[screen];
  const pageIcon = screenIcons[screen];
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<Project | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [branchOpen, setBranchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const pendingBot = useRef<{ projectId: string; botId: string; chatId?: string } | null>(null);
  const chatsHydrated = useChats((state) => activeProjectId ? state.byProject[activeProjectId]?.hydrated === true : false);
  const activeConversationId = useChats((state) => activeProjectId ? state.byProject[activeProjectId]?.activeChatId ?? null : null);
  const [currentBranch, setCurrentBranch] = useState("");
  const pageSubtitle = screen === "scm" && currentBranch ? currentBranch : (project?.name ?? "");

  useEffect(() => {
    setScreen("bots");
    setTerminalOpen(false);
    setConversationsOpen(false);
  }, [activeProjectId]);

  function refreshBranch() {
    if (!project) {
      setCurrentBranch("");
      return;
    }
    api.gitBranches(project.id)
      .then((info) => setCurrentBranch(info.current))
      .catch(() => setCurrentBranch(""));
  }

  useEffect(() => {
    refreshBranch();
  }, [project?.id]);

  useEffect(() => {
    if (!mobile) return;
    const timer = window.setTimeout(() => requestMobileNotificationPermission(), 900);
    let stopped = false;
    let attempts = 0;
    const register = async () => {
      const token = nativePushToken();
      if (!token || stopped) return false;
      try {
        await api.registerPushToken(token, "android");
        return true;
      } catch {
        return false;
      }
    };
    void register();
    const poll = window.setInterval(() => {
      attempts += 1;
      void register().then((registered) => {
        if ((registered || attempts > 20) && !stopped) {
          stopped = true;
          window.clearInterval(poll);
        }
      });
    }, 2500);
    const onToken = (token: string) => {
      if (token) void api.registerPushToken(token, "android").catch(() => undefined);
    };
    (window as unknown as { __tophPushToken?: (token: string) => void }).__tophPushToken = onToken;
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
      delete (window as unknown as { __tophPushToken?: (token: string) => void }).__tophPushToken;
    };
  }, [mobile]);

  useEffect(() => {
    const openBot = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string; botId?: string; chatId?: string }>).detail;
      if (!detail?.projectId) return;
      setActiveProject(detail.projectId);
      const chats = useChats.getState().byProject[detail.projectId];
      if (!chats?.hydrated) {
        pendingBot.current = { projectId: detail.projectId, botId: detail.botId ?? "", chatId: detail.chatId };
        setScreen("bots");
        return;
      }
      if (detail.chatId && chats.chats.some((chat) => chat.id === detail.chatId)) {
        useChats.getState().setActiveChat(detail.projectId, detail.chatId);
      } else if (detail.botId) {
        const latest = latestChatForToph(chats, detail.botId)
          ?? useChats.getState().createConversation(detail.projectId, [detail.botId], { name: chats.tophs.find((toph) => toph.id === detail.botId)?.name ?? "" });
        if (latest) useChats.getState().setActiveChat(detail.projectId, latest.id);
      }
      setScreen("bots");
    };
    const openTerminal = () => setTerminalOpen(true);
    window.addEventListener("toph:open-bot", openBot);
    window.addEventListener("toph:open-chat", openBot);
    window.addEventListener("toph:open-terminal", openTerminal);
    return () => {
      window.removeEventListener("toph:open-bot", openBot);
      window.removeEventListener("toph:open-chat", openBot);
      window.removeEventListener("toph:open-terminal", openTerminal);
    };
  }, [setActiveProject]);

  useEffect(() => {
    const pending = pendingBot.current;
    if (!pending || pending.projectId !== activeProjectId || !chatsHydrated) return;
    const chats = useChats.getState().byProject[pending.projectId];
    const chat = pending.chatId
      ? chats?.chats.find((item) => item.id === pending.chatId)
      : latestChatForToph(chats, pending.botId)
        ?? (pending.botId ? useChats.getState().createConversation(pending.projectId, [pending.botId], { name: chats?.tophs.find((toph) => toph.id === pending.botId)?.name ?? "" }) : null);
    if (chat) useChats.getState().setActiveChat(pending.projectId, chat.id);
    pendingBot.current = null;
  }, [activeProjectId, chatsHydrated]);

  function selectScreen(next: MobileScreen) {
    setScreen(next);
    setTerminalOpen(false);
  }

  function openConversations() {
    setTerminalOpen(false);
    setConversationsOpen(true);
  }

  function selectConversationScreen() {
    setConversationsOpen(false);
    setTerminalOpen(false);
    setScreen("bots");
  }

  function openFile(path: string, line?: number) {
    if (!project) return;
    openTab({
      id: `editor:${project.id}:${path}`,
      kind: "editor",
      title: basename(path),
      projectId: project.id,
      path,
      line,
    });
    setScreen("workspace");
  }

  function openQuery(profileId: string, sql: string) {
    if (!project) return;
    openTab({
      id: `db:${project.id}:${crypto.randomUUID()}`,
      kind: "db",
      title: "SQL query",
      projectId: project.id,
      profileId,
      sql,
    });
    setScreen("workspace");
  }

  function openTable(profileId: string, table: SchemaTable, driver: string) {
    if (!project) return;
    const schema = table.schema;
    let sql = "";
    if (driver === "mongodb") {
      sql = JSON.stringify({ database: schema, collection: table.name, filter: {}, limit: 100 }, null, 2);
    } else if (driver === "redis") {
      sql = "SCAN 0 COUNT 100";
    } else if (driver === "elasticsearch") {
      sql = JSON.stringify({ index: table.name, body: { query: { match_all: {} }, size: 100 } }, null, 2);
    } else if (driver === "neo4j") {
      sql = `MATCH (n:${table.name}) RETURN n LIMIT 100;`;
    } else if (driver === "cassandra") {
      sql = `SELECT * FROM ${schema}.${table.name} LIMIT 100;`;
    } else {
      sql = `SELECT * FROM ${quoteIdentifier(driver, schema, table.name)} LIMIT 100;`;
    }
    const editable = !["mongodb", "redis", "elasticsearch", "neo4j", "cassandra"].includes(driver);
    openTab({
      id: `db:table:${project.id}:${profileId}:${schema}.${table.name}`,
      kind: "db",
      title: table.name,
      projectId: project.id,
      profileId,
      sql,
      autoRun: true,
      table: editable
        ? {
            schema,
            name: table.name,
            primary: table.columns.filter((column) => column.primary).map((column) => column.name),
          }
        : undefined,
    });
    setScreen("workspace");
  }

  function openDiff(path: string, staged: boolean) {
    if (!project) return;
    openTab({
      id: `diff:${project.id}:${staged ? "staged" : "worktree"}:${path}`,
      kind: "diff",
      title: basename(path),
      projectId: project.id,
      path,
      staged,
    });
    setScreen("workspace");
  }

  function openWeb(target: WebTarget) {
    if (!project) return;
    openTab({
      id: `web:${project.id}:${target.id}`,
      kind: "web",
      title: target.name,
      projectId: project.id,
      url: target.url,
    });
    setScreen("workspace");
  }

  function requestCloseProject(id: string) {
    const target = projects.find((item) => item.id === id);
    if (!target) return;
    setProjectsOpen(false);
    setCloseError("");
    setCloseTarget(target);
  }

  async function confirmCloseProject() {
    if (!closeTarget || closeBusy) return;
    const id = closeTarget.id;
    const target = closeTarget;
    setCloseBusy(true);
    setCloseError("");
    try {
      const result = await api.closeProject(id);
      useChats.getState().forget(id);
      useTophDrafts.getState().clearProject(id);
      const wasActive = activeProjectId === id;
      closeProjectTab(id);
      setCloseTarget(null);
      if (wasActive) setScreen("bots");
      const count = result.processes.length;
      notify("info", `Projeto ${target.name} fechado. ${count} processo${count === 1 ? "" : "s"} encerrado${count === 1 ? "" : "s"}.`);
      if (result.failed.length > 0) {
        notify("error", `${result.failed.length} processo${result.failed.length === 1 ? "" : "s"} não puderam ser encerrados.`);
      }
    } catch (error) {
      setCloseError(error instanceof Error ? error.message : "Não foi possível fechar o projeto.");
    } finally {
      setCloseBusy(false);
    }
  }

  if (!project) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background-full p-4">
        <section className="flex w-full flex-col items-center gap-4 rounded-3xl border border-border-button-white bg-background-primary-default p-6 text-center shadow-xs">
          <BrandMark size="large" />
          <h1 className="text-title-2-medium text-text-primary">Bem-vindo ao Toph</h1>
          <p className="text-body-regular text-text-secondary">
            Crie um projeto pela interface para começar.
          </p>
        </section>
        <Toasts />
      </main>
    );
  }

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden bg-background-full"
      style={{
        height: "min(var(--visual-viewport-height, 100dvh), calc(100dvh - var(--keyboard-inset, 0px)))",
        paddingTop: "var(--safe-top)",
        paddingBottom: "var(--safe-bottom)",
        paddingLeft: "var(--safe-left)",
        paddingRight: "var(--safe-right)",
      }}
    >
      <MobileTopBar
        title={pageTitle}
        subtitle={pageSubtitle}
        project={project}
        unreadCount={unreadCount}
        icon={pageIcon}
        onTophs={openConversations}
        onProjects={() => setProjectsOpen(true)}
        brandIcon={screen === "bots"}
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background-primary-default">
        {screen === "bots" ? (
          activeConversationId ? (
            <BotStudioTab
              key={activeConversationId}
              project={project}
              conversationId={activeConversationId}
              mobile
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-500"><Bot size={22} /></span>
              <strong className="text-title-3-medium text-text-primary">Escolha um Toph</strong>
              <p className="max-w-xs text-caption-1-regular text-text-secondary">Abra uma tarefa individual ou uma conversa em grupo.</p>
              <Button variant="secondary" size="small" onClick={openConversations}>Ver Tophs</Button>
            </div>
          )
        ) : screen === "files" ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <FilesScreen project={project} onOpenFile={openFile} />
          </div>
        ) : screen === "scm" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <GitScreen
              project={project}
              branch={currentBranch}
              onOpenDiff={openDiff}
              onBranch={() => setBranchOpen(true)}
            />
          </div>
        ) : screen === "db" ? (
          <DatabasesScreen project={project} onOpenQuery={openQuery} onOpenTable={openTable} />
        ) : screen === "web" ? (
          <WebAppsScreen onOpenWeb={openWeb} />
        ) : screen === "debug" ? (
          <DebugPanel project={project} mobile />
        ) : screen === "more" ? (
          <MobileMoreScreen
            project={project}
            user={user}
            unreadCount={unreadCount}
            activeTitle={activeTab?.title}
            onScreen={selectScreen}
            onTophs={openConversations}
            onTerminal={() => setTerminalOpen(true)}
            onProjects={() => setProjectsOpen(true)}
            onBranch={() => setBranchOpen(true)}
            onAccount={() => setAccountOpen(true)}
          />
        ) : (
          <>
            {tabs.length > 0 ? <Tabs /> : null}
            <div className="relative flex min-h-0 flex-1 overflow-hidden">
              {!activeTab ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
                  <BrandMark size="large" />
                  <strong className="text-title-3-medium text-text-primary">Nenhuma aba aberta</strong>
                  <p className="max-w-sm text-caption-1-regular text-text-secondary">
                    Abra um arquivo, banco ou web app para começar. As abas ficam salvas por projeto.
                  </p>
                  <div className="flex w-full max-w-xs flex-col gap-2">
                    <Button variant="secondary" className="w-full justify-center" onClick={() => selectScreen("files")}>
                      Abrir arquivos
                    </Button>
                    <Button variant="ghost" className="w-full justify-center" onClick={() => selectScreen("more")}>
                      Ver todas as ferramentas
                    </Button>
                  </div>
                </div>
              ) : null}
              {activeTab?.kind === "editor" && <EditorPanel tab={activeTab} project={project} mobile onOpenChanges={(path) => openDiff(path, false)} />}
              {activeTab?.kind === "db" && <DbPanelTab tab={activeTab} />}
              {activeTab?.kind === "web" && <WebPanelTab tab={activeTab} />}
              {activeTab?.kind === "diff" && <DiffPanelTab tab={activeTab} project={project} />}
              {activeTab?.kind === "ai" && activeTab.chatId && <BotStudioTab project={project} conversationId={activeTab.chatId} mobile />}
            </div>
          </>
        )}
      </main>

      <MobileBottomNav
        screen={screen}
        unreadCount={unreadCount}
        onSelect={selectScreen}
      />

      {terminalOpen && (
        <div
          className="fixed inset-0 z-[120] flex flex-col bg-background-primary-default"
          style={{
            paddingTop: "var(--safe-top)",
            paddingBottom: "var(--safe-bottom)",
            paddingLeft: "var(--safe-left)",
            paddingRight: "var(--safe-right)",
          }}
        >
          <MobileTopBar
            title="Terminal"
            subtitle={project.name}
            project={project}
            unreadCount={unreadCount}
            icon={TerminalSquare}
            onProjects={() => { setTerminalOpen(false); setProjectsOpen(true); }}
            onClose={() => setTerminalOpen(false)}
          />
          <div className="min-h-0 flex-1">
            <TerminalPanel project={project} onOpenFile={openFile} sheet onClose={() => setTerminalOpen(false)} />
          </div>
        </div>
      )}

      <Modal isOpen={projectsOpen} onClose={() => setProjectsOpen(false)} label="Projetos" placement="bottom" size="sm" bodyClassName="p-2.5" swipeToClose>
        <ProjectSwitcher
          onSelect={(id) => {
            // Choosing a project must clear its badge, like the desktop rail.
            useApp.getState().markProjectNotificationsRead(id);
            setActiveProject(id);
            setProjectsOpen(false);
            setScreen("bots");
          }}
          onCloseProject={(id) => requestCloseProject(id)}
        />
      </Modal>

      <MobileBranchSheet
        open={branchOpen}
        projectId={project.id}
        onClose={() => setBranchOpen(false)}
        onChanged={refreshBranch}
      />
      <MobileConversationsSheet
        open={conversationsOpen}
        project={project}
        onClose={() => setConversationsOpen(false)}
        onSelected={selectConversationScreen}
      />
      <MobileAccountSheet open={accountOpen} user={user} onClose={() => setAccountOpen(false)} />
      <TophSettings user={user} projectRoot={project.root} projectId={project.id} hideTrigger />
      <GlobalSearch />
      <CloseProjectModal
        open={Boolean(closeTarget)}
        project={closeTarget}
        busy={closeBusy}
        error={closeError}
        mobile
        onClose={() => { if (!closeBusy) setCloseTarget(null); }}
        onConfirm={() => void confirmCloseProject()}
      />
      <Toasts />
    </div>
  );
}
