import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Icon,
  Input,
  PageHeader,
  Switch,
  cx,
  type IconName,
} from "@toph/ui";
import { Modal } from "@toph/ui/app";
import { api, getApiBase, probeServer, setApiBase, type User } from "../../../shared/api";
import { useApp } from "../../../app/store";
import { useSettings, type WorkspaceFeature } from "../store";
const WorkspaceSettings = lazy(() => import("./WorkspaceSettings"));
const SkillsPanel = lazy(() => import("../../skills/components/SkillsPanel"));
const HarnessSettings = lazy(() => import("./HarnessSettings"));

type Section = "general" | "appearance" | "skills" | "harness" | "workspace";

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
  icon: IconName;
}

/** The list of Settings sections, the Tophs settings' own left column. */
const sections: SectionItem[] = [
  { id: "general", label: "Geral", icon: "person" },
  { id: "appearance", label: "Layout e ferramentas", icon: "preference" },
  { id: "skills", label: "Skills", icon: "routines" },
  { id: "harness", label: "Harness", icon: "plug" },
  { id: "workspace", label: "Workspace", icon: "drive" },
];

const copy: Record<Section, { title: string; meta: string }> = {
  general: { title: "Geral", meta: "Sua conta, o servidor e o que o Toph usa." },
  appearance: { title: "Layout e ferramentas", meta: "Escolha diretamente o que aparece e é inicializado no workspace." },
  skills: { title: "Skills", meta: "Receitas que o Toph lê sob demanda." },
  harness: { title: "Harness", meta: "CLIs, modelos e MCPs deste workspace." },
  workspace: { title: "Workspace", meta: "Pastas acessíveis pelo Toph." },
};

export default function TophSettings({ user, projectRoot, projectId, hideTrigger = false }: Props) {
  const setUser = useApp((state) => state.setUser);
  const notify = useApp((state) => state.notify);
  const workspaceFeatures = useSettings((state) => state.workspaceFeatures);
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
      if (detail?.section && sections.some((item) => item.id === detail.section)) {
        setSection(detail.section);
      }
      setOpen(true);
    };
    const close = () => setOpen(false);
    window.addEventListener("toph:open-settings", handler);
    window.addEventListener("toph:close-settings", close);
    return () => {
      window.removeEventListener("toph:open-settings", handler);
      window.removeEventListener("toph:close-settings", close);
    };
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
  const current = copy[section];
  const initial = (user?.username ?? "T").trim().charAt(0);

  return (
    <>
      {hideTrigger ? null : (
        <button
          type="button"
          aria-label="Abrir configurações"
          title="Abrir configurações"
          onClick={() => { setSection("general"); setOpen(true); }}
          className="toph-settings-trigger"
        >
          <img src={`${import.meta.env.BASE_URL}tophs/toph-logo.png`} alt="" width={34} height={34} className="toph-settings-trigger__logo" draggable={false} />
        </button>
      )}

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        label="Configurações"
        size="full"
        className="toph-settings-dialog"
      >
        <div className="settings settings--dialog">
          <nav className="settings__nav" aria-label="Seções de configurações">
            <div className="settings__head">
              <h1 className="settings__title">Configurações</h1>
              <span className="settings__org ac-iconline">
                <span className="settings__mark" aria-hidden="true">{initial}</span>
                <span>{user?.username ?? "Conta"}</span>
              </span>
            </div>
            <div className="settings__groups">
              <div className="settings__group">
                <ul>
                  {sections.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSection(item.id)}
                        aria-current={section === item.id ? "page" : undefined}
                        className="settings__link"
                      >
                        <Icon name={item.icon} size={18} />
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </nav>

          <div className="settings__body">
            <PageHeader level={2} title={current.title} meta={current.meta} />

            <Suspense fallback={<p className="ac-setnote" role="status">Carregando configurações…</p>}>
              {section === "general" ? (
                <>
                  <Card>
                    <div className="settings-rows">
                      <div className="settings-row ac-actrow settings-row--lead">
                        <span className="settings-row__icon" aria-hidden="true"><Icon name="person" size={16} /></span>
                        <span className="settings-row__text ac-actrow__text">
                          <span className="settings-row__label">{user?.username ?? "Conta"}</span>
                          <span className="settings-row__status">{getApiBase() || window.location.origin}</span>
                        </span>
                      </div>
                    </div>
                  </Card>
                  <Card>
                    <CardHeader title="Servidor" subtitle="Para onde este dispositivo se conecta." />
                    <form className="ac-form" onSubmit={(event) => void changeServer(event)}>
                      <Field label="URL do servidor" hint={{ name: "URL do servidor", text: "O endereço do Toph para onde este dispositivo se conecta." }}>
                        <Input value={serverDraft} onChange={(event) => setServerDraft(event.target.value)} placeholder="https://seu-servidor" />
                      </Field>
                      <div className="ac-acts">
                        <Button type="submit" disabled={serverBusy || !serverDraft.trim()}>{serverBusy ? "Verificando..." : "Aplicar e reconectar"}</Button>
                      </div>
                    </form>
                  </Card>
                  <Card>
                    <CardHeader title="Sobre" subtitle="Informações desta instalação." />
                    <div className="settings-rows">
                      <ValueRow icon="info" label="Versão" value={version ? `v${version}` : "—"} />
                      <ValueRow icon="code" label="Build" value={buildId || "—"} />
                      <ValueRow icon="person" label="Usuário" value={user?.username ?? "—"} />
                    </div>
                  </Card>
                  <Card>
                    <CardHeader
                      title="Sair da conta"
                      subtitle="Encerra a sessão neste dispositivo."
                      action={<Button variant="danger" size="sm" icon="power" disabled={busy} onClick={() => void logout()}>{busy ? "Saindo..." : "Sair"}</Button>}
                    />
                  </Card>
                </>
              ) : section === "appearance" ? (
                <>
                  <Card>
                    <CardHeader title="Layout" subtitle="O que o workspace mostra e inicializa." />
                    <div className="settings-rows">
                      <ToggleRow id="toph-tabs" icon="layers" label="Abas e conteúdo" checked={workspaceFeatures.tabs} onChange={(value) => setFeature("tabs", value)} />
                      <ToggleRow id="toph-terminal" icon="code" label="Terminal e painel" checked={workspaceFeatures.terminal} onChange={(value) => setFeature("terminal", value)} />
                    </div>
                  </Card>
                  <Card>
                    <CardHeader title="Ferramentas" subtitle="As ferramentas do workspace." />
                    <div className="settings-rows">
                      <ToggleRow id="toph-files" icon="document" label="Explorer e editor" checked={workspaceFeatures.files} onChange={(value) => setFeature("files", value)} />
                      <ToggleRow id="toph-scm" icon="repo" label="Controle de código-fonte" checked={workspaceFeatures.sourceControl} onChange={(value) => setFeature("sourceControl", value)} />
                      <ToggleRow id="toph-db" icon="database" label="Bancos de dados" checked={workspaceFeatures.databases} onChange={(value) => setFeature("databases", value)} />
                      <ToggleRow id="toph-web" icon="globe" label="Aplicativos web" checked={workspaceFeatures.webApps} onChange={(value) => setFeature("webApps", value)} />
                      <ToggleRow id="toph-debug" icon="issue" label="Debug" checked={workspaceFeatures.debug} onChange={(value) => setFeature("debug", value)} />
                      <ToggleRow id="toph-toph" icon="agent" label="Toph" checked disabled onChange={() => undefined} />
                    </div>
                  </Card>
                </>
              ) : section === "skills" ? (
                <Card padded><SkillsPanel projectId={projectId} /></Card>
              ) : section === "harness" ? (
                <Card padded><HarnessSettings projectRoot={projectRoot} /></Card>
              ) : (
                <Card padded><WorkspaceSettings /></Card>
              )}
            </Suspense>
          </div>
        </div>
      </Modal>
    </>
  );
}

function ValueRow({ icon, label, value }: { icon: IconName; label: string; value: ReactNode }) {
  return (
    <div className="settings-row ac-actrow settings-row--lead">
      <span className="settings-row__icon" aria-hidden="true"><Icon name={icon} size={16} /></span>
      <span className="settings-row__text ac-actrow__text">
        <span className="settings-row__label">{label}</span>
      </span>
      <span className="settings-row__value">{value}</span>
    </div>
  );
}

function ToggleRow({
  id,
  icon,
  label,
  checked,
  disabled = false,
  onChange,
}: {
  id: string;
  icon: IconName;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className={cx("settings-row ac-actrow settings-row--lead", !disabled && "settings-row--toggle")}>
      <span className="settings-row__icon" aria-hidden="true"><Icon name={icon} size={16} /></span>
      <span className="settings-row__text ac-actrow__text">
        <label className="settings-row__label settings-row__hit" htmlFor={id}>{label}</label>
      </span>
      <span className="settings-row__end">
        <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      </span>
    </div>
  );
}

