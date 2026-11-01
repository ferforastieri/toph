import { useEffect, useRef, useState } from "react";
import { Bot, Bug, Database, FileCode2, Files, FolderPlus, GitBranch, Globe2, TerminalSquare } from "@toph/icons";
import { api, type Repository, type SchemaTable, type WebTarget } from "../api";
import { useApp, type AppNotification } from "../store";
import { useIsMobile } from "../ui/useIsMobile";
import { nativePushToken, requestMobileNotificationPermission } from "../notifications";
import { basename, quoteIdentifier } from "../lib";
import BrandMark from "@toph/brand";
import { Button } from "@/boardui/base/buttons/button";
import { Modal } from "@/boardui/base/modal/modal";
import BotStudioTab from "../panels/BotStudioTab";
import DbPanelTab from "../panels/DbPanelTab";
import DiffPanelTab from "../panels/DiffPanelTab";
import EditorPanel from "../panels/EditorPanel";
import DebugPanel from "../panels/DebugPanel";
import WebPanelTab from "../panels/WebPanelTab";
import Tabs from "../components/Tabs";
import MobileMenu, { type MobileScreen } from "./MobileMenu";
import RepoPicker from "../components/RepoPicker";
import TerminalPanel from "../panels/TerminalPanel";
import Toasts from "../components/Toasts";
import FilesScreen from "./screens/FilesScreen";
import GitScreen from "./screens/GitScreen";
import DatabasesScreen from "./screens/DatabasesScreen";
import WebAppsScreen from "./screens/WebAppsScreen";
import ProjectSwitcher from "../components/ProjectSwitcher";
import MobileTopBar from "./components/MobileTopBar";
import { useConfirm } from "../ui/confirm";
import { useBots } from "../bots";
import MobileBranchSheet from "./MobileBranchSheet";
import MobileNotificationsSheet from "./MobileNotificationsSheet";
import MobileAccountSheet from "./MobileAccountSheet";

export default function MobileApp() {
  const projects = useApp((state) => state.projects);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const setProjects = useApp((state) => state.setProjects);
  const setActiveProject = useApp((state) => state.setActiveProject);
  const tabs = useApp((state) => state.tabs);
  const activeTabId = useApp((state) => state.activeTabId);
  const openTab = useApp((state) => state.openTab);
  const notify = useApp((state) => state.notify);
  const user = useApp((state) => state.user);
  const notifications = useApp((state) => state.notifications);
  const markNotificationRead = useApp((state) => state.markNotificationRead);
  const closeProjectTab = useApp((state) => state.closeProjectTab);
  const confirm = useConfirm();

  const mobile = useIsMobile();
  const project = projects.find((item) => item.id === activeProjectId) ?? null;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const unreadCount = notifications.filter((notification) => !notification.read && notification.projectId === project?.id).length;

  const [screen, setScreen] = useState<MobileScreen>("bots");
  const pageTitle = screen === "bots" ? "Tophs" : screen === "files" ? "Arquivos" : screen === "scm" ? "Git" : screen === "db" ? "Bancos" : screen === "web" ? "Web apps" : screen === "debug" ? "Debug" : (activeTab?.title ?? "Editor");
  const pageIcon = screen === "bots" ? Bot : screen === "files" ? Files : screen === "scm" ? GitBranch : screen === "db" ? Database : screen === "web" ? Globe2 : screen === "debug" ? Bug : FileCode2;
  const [menuOpen, setMenuOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [currentBranch, setCurrentBranch] = useState("");
  const pageSubtitle = screen === "scm" && currentBranch ? currentBranch : (project?.name ?? "");

  useEffect(() => {
    setScreen("bots");
    setMenuOpen(false);
    setTerminalOpen(false);
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

  function openNotification(notification: AppNotification) {
    if (notification.projectId) {
      setActiveProject(notification.projectId);
      if (notification.botId) useBots.getState().setActiveBot(notification.projectId, notification.botId);
    }
    markNotificationRead(notification.id);
    setScreen("bots");
    setNotificationsOpen(false);
  }

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
    const openBot = () => setScreen("bots");
    const openTerminal = () => setTerminalOpen(true);
    window.addEventListener("toph:open-bot", openBot);
    window.addEventListener("toph:open-terminal", openTerminal);
    return () => {
      window.removeEventListener("toph:open-bot", openBot);
      window.removeEventListener("toph:open-terminal", openTerminal);
    };
  }, []);

  function selectScreen(next: MobileScreen) {
    setScreen(next);
    setMenuOpen(false);
    setTerminalOpen(false);
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
    setMenuOpen(false);
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
    setMenuOpen(false);
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
    setMenuOpen(false);
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
    setMenuOpen(false);
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
    setMenuOpen(false);
  }

  async function openRepo(repo: Repository) {
    const existing = projects.find((item) => item.root === repo.path);
    if (existing) {
      setActiveProject(existing.id);
      setRepoPickerOpen(false);
      return;
    }
    const next = await api.createProject(repo.name, repo.path, "#FFB547");
    setProjects([...projects, next]);
    setActiveProject(next.id);
    setRepoPickerOpen(false);
    notify("success", `Opened ${next.name}.`);
  }

  async function closeProject(id: string) {
    const target = projects.find((item) => item.id === id);
    if (!target) return;
    const ok = await confirm({
      title: "Fechar projeto?",
      message: `Fechar ${target.name}? Isso encerra terminais, abas de banco, web e agentes deste projeto. Ele continua disponível para reabrir.`,
      confirmLabel: "Fechar projeto",
    });
    if (!ok) return;
    try {
      await Promise.all([
        api.closeProjectTerminals(id),
        api.debugStop(id).catch(() => undefined),
      ]);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not stop project terminals.");
    }
    closeProjectTab(id);
    setProjectsOpen(false);
    notify("info", `Projeto ${target.name} fechado.`);
  }

  if (!project) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background-full p-4">
        <section className="flex w-full flex-col items-center gap-4 rounded-3xl border border-border-button-white bg-background-primary-default p-6 text-center shadow-xs">
          <BrandMark size="large" />
          <h1 className="text-title-2-medium text-text-primary">Bem-vindo ao Toph</h1>
          <p className="text-body-regular text-text-secondary">
            Abra um repositório Git para começar.
          </p>
          <Button leadingIcon={FolderPlus} className="w-full" onClick={() => setRepoPickerOpen(true)}>
            Abrir repositório
          </Button>
        </section>
      {repoPickerOpen && <RepoPicker onClose={() => setRepoPickerOpen(false)} onOpen={openRepo} />}
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
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (touch) swipeStart.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchMove={(event) => {
        if (!swipeStart.current) return;
        const touch = event.touches[0];
        if (!touch) return;
        const dx = touch.clientX - swipeStart.current.x;
        const dy = touch.clientY - swipeStart.current.y;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        if (dx > 0 && !menuOpen && swipeStart.current.x <= 48) {
          setMenuOpen(true);
          swipeStart.current = null;
        } else if (dx < 0 && menuOpen) {
          setMenuOpen(false);
          swipeStart.current = null;
        }
      }}
      onTouchEnd={() => { swipeStart.current = null; }}
    >
      <MobileTopBar
        title={pageTitle}
        subtitle={pageSubtitle}
        projectName={project.name}
        unreadCount={unreadCount}
        icon={pageIcon}
        onMenu={() => setMenuOpen(true)}
        onNotifications={() => setNotificationsOpen(true)}
        onProjects={() => setProjectsOpen(true)}
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background-primary-default">
        {screen === "bots" ? (
          <BotStudioTab project={project} mobile />
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
        ) : (
          <>
            {tabs.length > 1 ? <Tabs /> : null}
            <div className="relative flex min-h-0 flex-1 overflow-hidden">
              {!activeTab ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
                  <BrandMark size="large" />
                  <strong className="text-title-3-medium text-text-primary">Nenhuma aba aberta</strong>
                  <p className="max-w-sm text-caption-1-regular text-text-secondary">
                    Abra um arquivo, banco ou web app para começar.
                  </p>
                  <Button variant="secondary" className="w-full" onClick={() => selectScreen("bots")}>
                    Voltar para Bots
                  </Button>
                </div>
              ) : null}
              {activeTab?.kind === "editor" && <EditorPanel tab={activeTab} project={project} mobile onOpenChanges={(path) => openDiff(path, false)} />}
              {activeTab?.kind === "db" && <DbPanelTab tab={activeTab} />}
              {activeTab?.kind === "web" && <WebPanelTab tab={activeTab} />}
              {activeTab?.kind === "diff" && <DiffPanelTab tab={activeTab} project={project} />}
            </div>
          </>
        )}
      </main>

      {menuOpen && (
        <MobileMenu
          screen={screen}
          hasWorkspace={Boolean(activeTab)}
          user={user}
          projectName={project.name}
          branch={currentBranch}
          unreadCount={unreadCount}
          onSelect={selectScreen}
          onProjects={() => { setMenuOpen(false); setProjectsOpen(true); }}
          onBranch={() => { setMenuOpen(false); setBranchOpen(true); }}
          onNotifications={() => { setMenuOpen(false); setNotificationsOpen(true); }}
          onAccount={() => { setMenuOpen(false); setAccountOpen(true); }}
          onTerminal={() => { setMenuOpen(false); setTerminalOpen(true); }}
          onClose={() => setMenuOpen(false)}
        />
      )}

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
            projectName={project.name}
            unreadCount={unreadCount}
            icon={TerminalSquare}
            onMenu={() => setMenuOpen(true)}
            onNotifications={() => setNotificationsOpen(true)}
            onProjects={() => setProjectsOpen(true)}
          />
          <div className="min-h-0 flex-1">
            <TerminalPanel project={project} onOpenFile={openFile} sheet onClose={() => setTerminalOpen(false)} />
          </div>
        </div>
      )}

      <Modal isOpen={projectsOpen} onClose={() => setProjectsOpen(false)} label="Projetos" placement="bottom" size="sm" bodyClassName="p-2.5" swipeToClose>
        <ProjectSwitcher
          onSelect={(id) => { setActiveProject(id); setProjectsOpen(false); setScreen("bots"); }}
          onCloseProject={(id) => void closeProject(id)}
          onOpenRepo={() => { setProjectsOpen(false); setRepoPickerOpen(true); }}
        />
      </Modal>

      <MobileBranchSheet
        open={branchOpen}
        projectId={project.id}
        onClose={() => setBranchOpen(false)}
        onChanged={refreshBranch}
      />
      <MobileNotificationsSheet
        open={notificationsOpen}
        projectId={project.id}
        projectName={project.name}
        onClose={() => setNotificationsOpen(false)}
        onOpenNotification={openNotification}
      />
      <MobileAccountSheet open={accountOpen} user={user} onClose={() => setAccountOpen(false)} />
      {repoPickerOpen && <RepoPicker onClose={() => setRepoPickerOpen(false)} onOpen={openRepo} />}
      <Toasts />
    </div>
  );
}
