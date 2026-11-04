import { useEffect, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { Bell, Bot, HardDrive, Info, LogOut, Mail, PlugZap, Settings2, Wrench } from "@toph/icons";
import { api, getApiBase, probeServer, setApiBase, type User } from "../api";
import { useApp, type AppNotification } from "../store";
import { useSettings, type WorkspaceFeature } from "../settings";
import { PET_OPTIONS, petLevel, petLevelProgress, usePet } from "../pet";
import PetSprite from "../ui/PetSprite";
import AiSettings from "../panels/AiSettings";
import WorkspaceSettings from "../panels/WorkspaceSettings";
import AiConnectionsPanel from "./AiConnectionsPanel";
import ActivityPopover from "./ActivityPopover";
import EmailPanel from "./EmailPanel";
import McpPanel from "./McpPanel";
import { Badge } from "@/boardui/base/badges/badge";
import { Button } from "@/boardui/base/buttons/button";
import { Checkbox } from "@/boardui/base/checkbox/checkbox";
import { Input } from "@/boardui/base/input/input";
import { Modal } from "@/boardui/base/modal/modal";
import { cx } from "@/boardui/utils/cx";

type Section = "general" | "companion" | "appearance" | "ai" | "connections" | "mcp" | "email" | "workspace" | "about";

interface Props {
  user: User | null;
  projectRoot?: string;
  onOpenNotification: (notification: AppNotification) => void;
}

interface SectionItem {
  id: Section;
  label: string;
  icon: ComponentType<{ className?: string; size?: number }>;
}

const sections: Array<{ label?: string; items: SectionItem[] }> = [
  { items: [
    { id: "general", label: "Geral", icon: Settings2 },
    { id: "companion", label: "Toph pet", icon: Bot },
    { id: "appearance", label: "Layout e ferramentas", icon: Settings2 },
  ] },
  { label: "IA e ferramentas", items: [
    { id: "ai", label: "Inteligência artificial", icon: Bot },
    { id: "connections", label: "Conexões", icon: PlugZap },
    { id: "mcp", label: "Ferramentas MCP", icon: Wrench },
    { id: "email", label: "Email", icon: Mail },
  ] },
  { label: "Aplicativo", items: [
    { id: "workspace", label: "Workspace", icon: HardDrive },
    { id: "about", label: "Sobre", icon: Info },
  ] },
];

function timeAgo(timestamp: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

export default function TophSettings({ user, projectRoot, onOpenNotification }: Props) {
  const setUser = useApp((state) => state.setUser);
  const notify = useApp((state) => state.notify);
  const notifications = useApp((state) => state.notifications);
  const projects = useApp((state) => state.projects);
  const markAllNotificationsRead = useApp((state) => state.markAllNotificationsRead);
  const workspaceFeatures = useSettings((state) => state.workspaceFeatures);
  const updateSettings = useSettings((state) => state.update);
  const pet = usePet();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [section, setSection] = useState<Section>("general");
  const [busy, setBusy] = useState(false);
  const [serverBusy, setServerBusy] = useState(false);
  const [serverDraft, setServerDraft] = useState(() => getApiBase() || window.location.origin);
  const [version, setVersion] = useState("");
  const [buildId, setBuildId] = useState("");
  const level = petLevel(pet.commits);
  const petName = PET_OPTIONS.find((option) => option.kind === pet.kind)?.name ?? "Toph pet";
  const sortedNotifications = [...notifications].sort((a, b) => b.createdAt - a.createdAt);
  const unread = sortedNotifications.filter((notification) => !notification.read).length;

  function openFromAvatar() {
    if (notificationsOpen) {
      setNotificationsOpen(false);
      return;
    }
    if (sortedNotifications.length > 0) {
      setOpen(false);
      setNotificationsOpen(true);
      markAllNotificationsRead();
    } else {
      setSection("general");
      setNotificationsOpen(false);
      setOpen(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    setServerDraft(getApiBase() || window.location.origin);
    let cancelled = false;
    void api.version().then((info) => {
      if (cancelled) return;
      setVersion(info.version);
      setBuildId(info.buildId);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [open]);

  async function changeServer(event: FormEvent) {
    event.preventDefault();
    setServerBusy(true);
    try {
      const base = await probeServer(serverDraft);
      localStorage.setItem("toph_server_url", base);
      setApiBase(base);
      window.location.reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível conectar ao servidor.");
    } finally {
      setServerBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await api.logout();
      setOpen(false);
      setUser(null);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível sair.");
    } finally {
      setBusy(false);
    }
  }

  const setFeature = (feature: WorkspaceFeature, enabled: boolean) => updateSettings({ workspaceFeatures: { [feature]: enabled } });

  return (
    <>
      <ActivityPopover
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        panelClassName="bottom-0 top-auto max-h-[calc(100dvh-16px)] w-[min(340px,calc(100vw-64px))] overflow-hidden"
        trigger={
          <button
            type="button"
            aria-label={unread > 0 ? `Abrir ${unread} notificações novas` : sortedNotifications.length > 0 ? "Abrir notificações" : "Abrir configurações"}
            title={`${petName} · nível ${level}`}
            onClick={openFromAvatar}
            className={cx("relative flex size-10 items-center justify-center rounded-2xl outline-none transition-colors hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring", unread > 0 && "pet-notification")}
          >
            <PetSprite kind={pet.kind} size={38} commits={pet.commits} />
            {unread > 0 ? <Badge color="primary" className="pointer-events-none absolute -end-1 -top-1 min-w-4 px-1 text-[10px]">{unread > 9 ? "9+" : unread}</Badge> : null}
          </button>
        }
      >
        <div className="flex max-h-[min(520px,calc(100dvh-24px))] flex-col">
          <div className="flex shrink-0 items-center gap-2.5 border-b border-separator-border p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-500"><Bell size={16} /></span>
            <div className="min-w-0 flex-1"><strong className="text-body-2-medium text-text-primary">Notificações</strong><p className="truncate text-caption-2-regular text-text-tertiary">Atualizações dos seus Tophs e do sistema</p></div>
            <Badge color="neutral">{sortedNotifications.length}</Badge>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {sortedNotifications.map((notification) => {
              const projectName = projects.find((project) => project.id === notification.projectId)?.name;
              return (
                <button key={notification.id} type="button" onClick={() => { setNotificationsOpen(false); onOpenNotification(notification); }} className="flex w-full items-start gap-3 rounded-xl border border-transparent p-2.5 text-start transition-colors hover:border-accent-500/20 hover:bg-accent-500/[0.05]">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-500/10 text-accent-500"><Bell size={14} /></span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1"><span className="flex items-baseline justify-between gap-2"><strong className="truncate text-caption-1-semibold text-text-primary">{notification.title}</strong><span className="shrink-0 text-caption-2-regular text-text-tertiary">{timeAgo(notification.createdAt)}</span></span>{notification.botRole ? <span className="text-caption-2-regular text-accent-500">{notification.botRole}</span> : null}<span className="line-clamp-2 text-caption-1-regular leading-relaxed text-text-secondary">{notification.body}</span>{projectName ? <span className="truncate text-caption-2-regular text-text-tertiary">{projectName}</span> : null}</span>
                </button>
              );
            })}
          </div>
          <div className="shrink-0 border-t border-separator-border p-2"><Button variant="ghost" size="small" className="w-full justify-center" onClick={() => { setNotificationsOpen(false); setSection("general"); setOpen(true); }}>Abrir configurações</Button></div>
        </div>
      </ActivityPopover>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Configurações"
        description="Toph, workspace, integrações e informações do aplicativo."
        size="xl"
        className="h-[min(760px,calc(100dvh-32px))]"
        bodyClassName="overflow-hidden p-0"
      >
        <div className="grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)] max-sm:grid-cols-1 max-sm:grid-rows-[auto_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-e border-separator-border bg-background-secondary-default/55 p-3 max-sm:flex max-sm:overflow-x-auto max-sm:border-b max-sm:border-e-0">
            {sections.map((group, groupIndex) => (
              <div key={group.label ?? "main"} className={cx("flex flex-col gap-1 max-sm:flex-row", groupIndex > 0 && "mt-5 max-sm:mt-0")}>
                {group.label ? <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary max-sm:hidden">{group.label}</p> : null}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSection(item.id)}
                      className={cx(
                        "flex items-center gap-2 rounded-xl px-2.5 py-2 text-start text-caption-1-medium transition-colors max-sm:shrink-0",
                        section === item.id ? "bg-background-primary-default text-text-primary shadow-xs" : "text-text-secondary hover:bg-background-primary-hover hover:text-text-primary",
                      )}
                    >
                      <Icon size={15} className="shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </aside>

          <section className="min-h-0 overflow-y-auto p-5 sm:p-6">
            {section === "general" ? (
              <div className="flex flex-col gap-5">
                <SettingsHeading title="Geral" description="Conta e servidor usados neste dispositivo." />
                <div className="flex items-center gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default/45 p-3">
                  <PetSprite kind={pet.kind} size={52} commits={pet.commits} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-medium text-text-primary">{user?.username ?? "Conta"}</p>
                    <p className="truncate text-caption-1-regular text-text-secondary">{getApiBase() || window.location.origin}</p>
                  </div>
                  <Button variant="danger" size="small" leadingIcon={LogOut} disabled={busy} onClick={() => void logout()}>{busy ? "Saindo..." : "Sair"}</Button>
                </div>
                <form className="flex flex-col gap-2 rounded-2xl border border-border-button-default p-3" onSubmit={(event) => void changeServer(event)}>
                  <p className="text-body-medium text-text-primary">Servidor</p>
                  <Input value={serverDraft} onChange={setServerDraft} placeholder="https://seu-servidor" aria-label="URL do servidor" />
                  <Button type="submit" size="small" className="self-end" disabled={serverBusy || !serverDraft.trim()}>{serverBusy ? "Verificando..." : "Aplicar e reconectar"}</Button>
                </form>
              </div>
            ) : section === "companion" ? (
              <div className="flex flex-col gap-5">
                <SettingsHeading title="Seu Toph pet" description="Este companheiro é independente dos Tophs agentes de IA." />
                <div className="flex items-center gap-4 rounded-2xl border border-accent-500/25 bg-accent-500/[0.05] p-4">
                  <span className="flex size-20 shrink-0 items-center justify-center rounded-3xl bg-background-primary-default shadow-xs"><PetSprite kind={pet.kind} size={70} commits={pet.commits} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><strong className="text-title-3-medium text-text-primary">{petName}</strong><span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-caption-2-semibold text-accent-600">Nível {level}</span></div>
                    <p className="mt-1 text-caption-1-regular text-text-secondary">{pet.commits} commits. A aparência evolui a cada três commits.</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-background-tertiary-default"><div className="h-full rounded-full bg-accent-500 transition-[width] duration-500" style={{ width: `${petLevelProgress(pet.commits)}%` }} /></div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PET_OPTIONS.map((option) => (
                    <button
                      key={option.kind}
                      type="button"
                      onClick={() => pet.choose(option.kind)}
                      className={cx("flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-[background-color,border-color,color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]", pet.kind === option.kind ? "border-accent-500 bg-accent-500/10" : "border-border-button-default hover:bg-background-primary-hover")}
                    >
                      <PetSprite kind={option.kind} size={46} commits={pet.commits} animate={false} />
                      <span className="text-caption-1-semibold text-text-primary">{option.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : section === "appearance" ? (
              <div className="flex flex-col gap-5">
                <SettingsHeading title="Layout e ferramentas" description="Escolha diretamente o que aparece e é inicializado no workspace." />
                <SettingsGroup title="Layout">
                  <FeatureToggle label="Barra vertical" checked={workspaceFeatures.activityBar} onChange={(value) => setFeature("activityBar", value)} />
                  <FeatureToggle label="Painel lateral" checked={workspaceFeatures.primarySidebar} onChange={(value) => setFeature("primarySidebar", value)} />
                  <FeatureToggle label="Abas e conteúdo" checked={workspaceFeatures.tabs} onChange={(value) => setFeature("tabs", value)} />
                  <FeatureToggle label="Terminal e painel" checked={workspaceFeatures.terminal} onChange={(value) => setFeature("terminal", value)} />
                </SettingsGroup>
                <SettingsGroup title="Ferramentas">
                  <FeatureToggle label="Explorer e editor" checked={workspaceFeatures.files} onChange={(value) => setFeature("files", value)} />
                  <FeatureToggle label="Controle de código-fonte" checked={workspaceFeatures.sourceControl} onChange={(value) => setFeature("sourceControl", value)} />
                  <FeatureToggle label="Bancos de dados" checked={workspaceFeatures.databases} onChange={(value) => setFeature("databases", value)} />
                  <FeatureToggle label="Aplicativos web" checked={workspaceFeatures.webApps} onChange={(value) => setFeature("webApps", value)} />
                  <FeatureToggle label="Debug" checked={workspaceFeatures.debug} onChange={(value) => setFeature("debug", value)} />
                  <FeatureToggle label="Tophs" checked disabled onChange={() => undefined} />
                </SettingsGroup>
              </div>
            ) : section === "ai" ? (
              <><SettingsHeading title="Inteligência artificial" description="Provider e modelos padrão." /><div className="mt-5"><AiSettings /></div></>
            ) : section === "connections" ? (
              <><SettingsHeading title="Conexões" description="Contas e provedores de IA." /><div className="mt-5"><AiConnectionsPanel projectRoot={projectRoot} /></div></>
            ) : section === "mcp" ? (
              <><SettingsHeading title="Ferramentas MCP" description="Servidores e ferramentas conectadas." /><div className="mt-5"><McpPanel projectRoot={projectRoot} /></div></>
            ) : section === "email" ? (
              <><SettingsHeading title="Email" description="Contas disponíveis para os Tophs agentes." /><div className="mt-5"><EmailPanel /></div></>
            ) : section === "workspace" ? (
              <><SettingsHeading title="Workspace" description="Pastas acessíveis pelo Toph." /><div className="mt-5"><WorkspaceSettings /></div></>
            ) : (
              <div className="flex flex-col gap-5">
                <SettingsHeading title="Sobre o Toph" description="Informações desta instalação." />
                <div className="flex flex-col divide-y divide-separator-border rounded-2xl border border-border-button-default">
                  <Fact label="Versão" value={version ? `v${version}` : "—"} />
                  <Fact label="Build" value={buildId || "—"} />
                  <Fact label="Usuário" value={user?.username ?? "—"} />
                  <Fact label="Toph pet" value={`${petName} · nível ${level}`} />
                </div>
              </div>
            )}
          </section>
        </div>
      </Modal>
    </>
  );
}

function SettingsHeading({ title, description }: { title: string; description: string }) {
  return <header><h3 className="text-title-2-medium text-text-primary">{title}</h3><p className="mt-1 text-body-regular text-text-secondary">{description}</p></header>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 px-3 py-2.5"><span className="text-caption-1-regular text-text-secondary">{label}</span><span className="truncate text-caption-1-medium text-text-primary">{value}</span></div>;
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-border-button-default"><div className="border-b border-separator-border bg-background-secondary-default/60 px-3 py-2 text-caption-1-semibold text-text-secondary">{title}</div><div className="flex flex-col divide-y divide-separator-border">{children}</div></section>;
}

function FeatureToggle({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex min-h-10 items-center px-3 py-2"><Checkbox size="sm" isSelected={checked} isDisabled={disabled} onChange={onChange}>{label}</Checkbox></div>;
}
