import { lazy, Suspense, useEffect, useState, type ComponentType, type FormEvent } from "react";
import { HardDrive, Info, LogOut, Mail, PlugZap, SlidersHorizontal, Sparkles, UserRound } from "@toph/icons";
import { SettingRow, SettingsSection } from "@toph/ui";
import { api, getApiBase, probeServer, setApiBase, type User } from "../../../shared/api";
import { useApp } from "../../../app/store";
import { useSettings, type WorkspaceFeature } from "../store";
const WorkspaceSettings = lazy(() => import("./WorkspaceSettings"));
const EmailPanel = lazy(() => import("../../integrations/components/EmailPanel"));
const SkillsPanel = lazy(() => import("../../skills/components/SkillsPanel"));
const HarnessSettings = lazy(() => import("./HarnessSettings"));
import { Button } from "@toph/ui/app";
import { Input } from "@toph/ui/app";
import { Modal } from "@toph/ui/app";
import { Switch } from "@toph/ui/app";
import { cx } from "@toph/ui/app/utils/cx";

type Section = "general" | "appearance" | "skills" | "harness" | "email" | "workspace" | "about";

interface Props {
  user: User | null;
  projectRoot?: string;
  projectId?: string;
  /** Mount only the modal/listener, without the settings trigger button. */
  hideTrigger?: boolean;
}

interface SectionItem {
  id: Section;
  label: string;
  icon: ComponentType<{ className?: string; size?: number }>;
}

const sections: Array<{ label?: string; items: SectionItem[] }> = [
  { items: [
    { id: "general", label: "Geral", icon: UserRound },
    { id: "appearance", label: "Layout e ferramentas", icon: SlidersHorizontal },
  ] },
  { label: "IA e ferramentas", items: [
    { id: "skills", label: "Skills", icon: Sparkles },
    { id: "harness", label: "Harness", icon: PlugZap },
    { id: "email", label: "Email", icon: Mail },
  ] },
  { label: "Aplicativo", items: [
    { id: "workspace", label: "Workspace", icon: HardDrive },
    { id: "about", label: "Sobre", icon: Info },
  ] },
];

export default function TophSettings({ user, projectRoot, projectId, hideTrigger = false }: Props) {
  const setUser = useApp((state) => state.setUser);
  const notify = useApp((state) => state.notify);
  const workspaceFeatures = useSettings((state) => state.workspaceFeatures);
  const projectBar = useSettings((state) => state.projectBar);
  const updateSettings = useSettings((state) => state.update);
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section>("general");
  const [busy, setBusy] = useState(false);
  const [serverBusy, setServerBusy] = useState(false);
  const [serverDraft, setServerDraft] = useState(() => getApiBase() || window.location.origin);
  const [version, setVersion] = useState("");
  const [buildId, setBuildId] = useState("");
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ section?: Section }>).detail;
      if (detail?.section && sections.some((group) => group.items.some((item) => item.id === detail.section))) {
        setSection(detail.section);
      }
      setOpen(true);
    };
    window.addEventListener("toph:open-settings", handler);
    return () => window.removeEventListener("toph:open-settings", handler);
  }, []);
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
      {hideTrigger ? null : (
        <button
          type="button"
          aria-label="Abrir configurações"
          title="Abrir configurações"
          onClick={() => { setSection("general"); setOpen(true); }}
          className="relative flex size-10 items-center justify-center rounded-2xl outline-none transition-colors hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <img src={`${import.meta.env.BASE_URL}tophs/toph-logo.png`} alt="" width={34} height={34} className="size-[34px] select-none object-contain" draggable={false} />
        </button>
      )}

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Configurações"
        description="Sua conta, o workspace e o que o Toph usa."
        size="full"
        className="h-[min(820px,calc(100dvh-32px))] w-[min(1080px,calc(100vw-32px))] max-w-none"
        bodyClassName="overflow-hidden p-0!"
      >
        <div className="grid h-full min-h-0 grid-cols-[232px_minmax(0,1fr)] max-sm:grid-cols-1 max-sm:grid-rows-[auto_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-e border-separator-border px-3 py-4 max-sm:flex max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:border-b max-sm:border-e-0 max-sm:py-2">
            {sections.map((group, groupIndex) => (
              <div key={group.label ?? "main"} className={cx("flex flex-col gap-0.5 max-sm:flex max-sm:shrink-0 max-sm:flex-row max-sm:items-center", groupIndex > 0 && "mt-5 max-sm:mt-0 max-sm:ms-2")}>
                {group.label ? <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary max-sm:hidden">{group.label}</p> : null}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSection(item.id)}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "flex min-h-9 items-center gap-2.5 whitespace-nowrap rounded-[10px] px-2.5 text-start text-[13.5px] transition-colors max-sm:shrink-0",
                        active
                          ? "bg-background-primary-default font-semibold text-text-primary shadow-[var(--e1)]"
                          : "text-text-secondary hover:bg-background-primary-hover hover:text-text-primary",
                      )}
                    >
                      <Icon size={16} className={cx("shrink-0", active ? "text-text-primary" : "text-foreground-icon-tertiary")} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </aside>

          <section className="min-h-0 overflow-y-auto px-6 py-5 sm:px-8 sm:py-6">
            <div className="mx-auto w-full max-w-[720px]">
              <Suspense fallback={<p role="status" className="text-body-regular text-text-secondary">Carregando configurações…</p>}>
                {section === "general" ? (
                  <div className="flex flex-col gap-6">
                    <SettingsHeading title="Geral" description="Conta e servidor usados neste dispositivo." />
                    <div className="flex items-center gap-3 py-1">
                      <img src={`${import.meta.env.BASE_URL}tophs/toph-logo.png`} alt="" width={44} height={44} className="size-11 shrink-0 select-none object-contain" draggable={false} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-medium text-text-primary">{user?.username ?? "Conta"}</p>
                        <p className="truncate text-caption-1-regular text-text-secondary">{getApiBase() || window.location.origin}</p>
                      </div>
                      <Button variant="danger" size="small" leadingIcon={LogOut} disabled={busy} onClick={() => void logout()}>{busy ? "Saindo..." : "Sair"}</Button>
                    </div>
                    <SettingsSection title="Servidor" description="Para onde este dispositivo se conecta.">
                      <form className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-end" onSubmit={(event) => void changeServer(event)}>
                        <div className="min-w-0 flex-1">
                          <Input label="URL do servidor" value={serverDraft} onChange={setServerDraft} placeholder="https://seu-servidor" />
                        </div>
                        <Button type="submit" size="small" className="shrink-0" disabled={serverBusy || !serverDraft.trim()}>{serverBusy ? "Verificando..." : "Aplicar e reconectar"}</Button>
                      </form>
                    </SettingsSection>
                  </div>
                ) : section === "appearance" ? (
                  <div className="flex flex-col gap-4">
                    <SettingsHeading title="Layout e ferramentas" description="Escolha diretamente o que aparece e é inicializado no workspace." />
                    <SettingsSection title="Barra de projetos" description="Onde os projetos abertos ficam.">
                      <div className="grid max-w-md grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => updateSettings({ projectBar: "header" })}
                          className={cx(
                            "flex flex-col gap-2 rounded-xl border p-3 text-start transition-colors",
                            projectBar === "header"
                              ? "border-accent-500/45 bg-accent-500/10"
                              : "border-border-button-default hover:bg-background-primary-hover",
                          )}
                          aria-pressed={projectBar === "header"}
                        >
                          <span className="flex h-9 w-full flex-col gap-1 rounded-lg border border-border-button-default bg-background-secondary-default p-1">
                            <span className={cx("h-2 w-full rounded-sm", projectBar === "header" ? "bg-accent-500/60" : "bg-text-tertiary/30")} />
                            <span className="flex-1" />
                          </span>
                          <span className="flex flex-col gap-0.5">
                            <span className="text-body-2-medium text-text-primary">Header</span>
                            <span className="text-caption-2-regular leading-snug text-text-tertiary">No topo, com o nome dos projetos.</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSettings({ projectBar: "left" })}
                          className={cx(
                            "flex flex-col gap-2 rounded-xl border p-3 text-start transition-colors",
                            projectBar === "left"
                              ? "border-accent-500/45 bg-accent-500/10"
                              : "border-border-button-default hover:bg-background-primary-hover",
                          )}
                          aria-pressed={projectBar === "left"}
                        >
                          <span className="flex h-9 w-full gap-1 rounded-lg border border-border-button-default bg-background-secondary-default p-1">
                            <span className={cx("w-2 rounded-sm", projectBar === "left" ? "bg-accent-500/60" : "bg-text-tertiary/30")} />
                            <span className="flex-1" />
                          </span>
                          <span className="flex flex-col gap-0.5">
                            <span className="text-body-2-medium text-text-primary">Esquerda</span>
                            <span className="text-caption-2-regular leading-snug text-text-tertiary">Barra vertical, projetos só com a inicial.</span>
                          </span>
                        </button>
                      </div>
                    </SettingsSection>
                    <SettingsSection title="Layout">
                      <div className="divide-y divide-separator-border">
                        <ToggleRow title="Abas e conteúdo" selected={workspaceFeatures.tabs} onChange={(value) => setFeature("tabs", value)} />
                        <ToggleRow title="Terminal e painel" selected={workspaceFeatures.terminal} onChange={(value) => setFeature("terminal", value)} />
                      </div>
                    </SettingsSection>
                    <SettingsSection title="Ferramentas">
                      <div className="divide-y divide-separator-border">
                        <ToggleRow title="Explorer e editor" selected={workspaceFeatures.files} onChange={(value) => setFeature("files", value)} />
                        <ToggleRow title="Controle de código-fonte" selected={workspaceFeatures.sourceControl} onChange={(value) => setFeature("sourceControl", value)} />
                        <ToggleRow title="Bancos de dados" selected={workspaceFeatures.databases} onChange={(value) => setFeature("databases", value)} />
                        <ToggleRow title="Aplicativos web" selected={workspaceFeatures.webApps} onChange={(value) => setFeature("webApps", value)} />
                        <ToggleRow title="Debug" selected={workspaceFeatures.debug} onChange={(value) => setFeature("debug", value)} />
                        <ToggleRow title="Toph" selected disabled />
                      </div>
                    </SettingsSection>
                  </div>
                ) : section === "skills" ? (
                  <SkillsPanel projectId={projectId} />
                ) : section === "harness" ? (
                  <HarnessSettings projectRoot={projectRoot} />
                ) : section === "email" ? (
                  <><SettingsHeading title="Email" description="Contas disponíveis para o Toph." /><div className="mt-5"><EmailPanel /></div></>
                ) : section === "workspace" ? (
                  <><SettingsHeading title="Workspace" description="Pastas acessíveis pelo Toph." /><div className="mt-5"><WorkspaceSettings /></div></>
                ) : (
                  <div className="flex flex-col gap-6">
                    <SettingsHeading title="Sobre o Toph" description="Informações desta instalação." />
                    <dl className="divide-y divide-separator-border border-t border-separator-border">
                      <Fact label="Versão" value={version ? `v${version}` : "—"} />
                      <Fact label="Build" value={buildId || "—"} />
                      <Fact label="Usuário" value={user?.username ?? "—"} />
                    </dl>
                  </div>
                )}
              </Suspense>
            </div>
          </section>
        </div>
      </Modal>
    </>
  );
}

function SettingsHeading({ title, description }: { title: string; description: string }) {
  return <header><h3 className="text-[20px] font-bold leading-[26px] tracking-[-0.015em] text-text-primary">{title}</h3><p className="mt-1 text-[13px] leading-[18px] text-text-secondary">{description}</p></header>;
}

function ToggleRow({ title, selected, disabled = false, onChange }: { title: string; selected: boolean; disabled?: boolean; onChange?: (selected: boolean) => void }) {
  return (
    <div className="py-2.5">
      <SettingRow title={title}>
        <Switch isSelected={selected} isDisabled={disabled} onChange={onChange} aria-label={title} />
      </SettingRow>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 py-2.5"><dt className="text-caption-1-regular text-text-secondary">{label}</dt><dd className="truncate text-caption-1-medium text-text-primary">{value}</dd></div>;
}
