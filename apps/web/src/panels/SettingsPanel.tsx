import { FormEvent, useState, type ReactNode } from "react";
import {
  Gem,
  GitBranch,
  HardDrive,
  LayoutPanelLeft,
  Monitor,
  Moon,
  Palette,
  Server,
  Sparkles,
  Sun,
  TerminalSquare,
  Type,
} from "@toph/icons";
import { getApiBase, probeServer, setApiBase } from "../api";
import { useApp } from "../store";
import {
  type Accent,
  type BackgroundStyle,
  type Density,
  type GlassLevel,
  type TabStyle,
  type IconTheme,
  type ThemePreference,
  useSettings,
} from "../settings";
import AiSettings from "./AiSettings";
import WorkspaceSettings from "./WorkspaceSettings";
import { Button } from "@toph/ui";
import { Select } from "@toph/ui";

interface Props {
  version: string;
}

type Category =
  | "appearance"
  | "layout"
  | "editor"
  | "terminal"
  | "ai"
  | "workspace"
  | "git"
  | "server";

const categories: Array<{ id: Category; label: string; icon: typeof Sun }> = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "layout", label: "Layout", icon: LayoutPanelLeft },
  { id: "editor", label: "Editor", icon: Type },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "workspace", label: "Workspace", icon: HardDrive },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "server", label: "Server", icon: Server },
];

const accents: Array<{ id: Accent; label: string }> = [
  { id: "jade", label: "Jade" },
  { id: "ocean", label: "Ocean" },
  { id: "violet", label: "Violet" },
  { id: "amber", label: "Amber" },
  { id: "rose", label: "Rose" },
  { id: "graphite", label: "Graphite" },
];

const themes: Array<{ id: ThemePreference; label: string; icon: typeof Sun }> = [
  { id: "auto", label: "Auto", icon: Monitor },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "light", label: "Light", icon: Sun },
  { id: "brand", label: "Brand", icon: Palette },
  { id: "emerald", label: "Emerald", icon: Gem },
  { id: "nightwolf", label: "Night Wolf", icon: Moon },
];

const iconOptions: Array<{ id: IconTheme; label: string }> = [
  { id: "material", label: "Material" },
  { id: "phosphor", label: "Phosphor Fill" },
  { id: "remix", label: "Remix Fill" },
];

const glassOptions: Array<{ id: GlassLevel; label: string }> = [
  { id: "off", label: "Off" },
  { id: "subtle", label: "Soft" },
  { id: "regular", label: "Regular" },
  { id: "strong", label: "Clear" },
];

const backgroundOptions: Array<{ id: BackgroundStyle; label: string }> = [
  { id: "aurora", label: "Aurora" },
  { id: "mesh", label: "Mesh" },
  { id: "grid", label: "Grid" },
  { id: "solid", label: "Solid" },
];

const densityOptions: Array<{ id: Density; label: string }> = [
  { id: "compact", label: "Compact" },
  { id: "comfortable", label: "Comfort" },
  { id: "spacious", label: "Roomy" },
];

const tabOptions: Array<{ id: TabStyle; label: string }> = [
  { id: "glass", label: "Glass" },
  { id: "underline", label: "Line" },
  { id: "compact", label: "Compact" },
];


function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="settings-range">
      <span className="settings-range-label">
        {label}
        <b>{value}{suffix}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Button
      type="button"
      className={`settings-toggle ${checked ? "on" : ""}`}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className="switch-track"><span className="switch-thumb" /></span>
    </Button>
  );
}

function PageTitle({ icon: Icon, children }: { icon: typeof Sun; children: ReactNode }) {
  return <div className="settings-page-title"><Icon size={15} /> {children}</div>;
}

export default function SettingsPanel({ version }: Props) {
  const notify = useApp((state) => state.notify);
  const settings = useSettings();
  const update = useSettings((state) => state.update);
  const [category, setCategory] = useState<Category>("appearance");
  const [serverDraft, setServerDraft] = useState(() => getApiBase() || window.location.origin);
  const [serverBusy, setServerBusy] = useState(false);

  async function changeServer(event: FormEvent) {
    event.preventDefault();
    setServerBusy(true);
    try {
      const base = await probeServer(serverDraft);
      localStorage.setItem("toph_server_url", base);
      setApiBase(base);
      window.location.reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not reach this server.");
    } finally {
      setServerBusy(false);
    }
  }

  return (
    <div className="panel settings-panel">
      <div className="panel-heading">
        <span>Settings</span>
        <span className="settings-version">v{version}</span>
      </div>

      <nav className="settings-nav" aria-label="Settings sections">
        {categories.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              className={category === item.id ? "active" : ""}
              onClick={() => setCategory(item.id)}
            >
              <Icon size={14} />
              <span>{item.label}</span>
            </Button>
          );
        })}
      </nav>

      {category === "appearance" && (
        <div className="settings-page">
          <PageTitle icon={Palette}>Appearance</PageTitle>
          <div className="settings-field">
            <span>Theme</span>
            <Select
              value={settings.theme}
              options={themes.map((theme) => ({ value: theme.id, label: theme.label }))}
              onChange={(theme) => update({ theme })}
              label="Theme"
            />
          </div>
          <div className="settings-field">
            <span>Accent color</span>
            <Select
              value={settings.accent}
              options={accents.map((accent) => ({ value: accent.id, label: accent.label }))}
              onChange={(accent) => update({ accent })}
              label="Accent color"
            />
          </div>
          <div className="settings-field">
            <span>Liquid glass</span>
            <Select value={settings.glass} options={glassOptions.map((item) => ({ value: item.id, label: item.label }))} onChange={(glass) => update({ glass })} label="Liquid glass" />
          </div>
          <div className="settings-field">
            <span>Background</span>
            <Select value={settings.background} options={backgroundOptions.map((item) => ({ value: item.id, label: item.label }))} onChange={(background) => update({ background })} label="Background" />
          </div>
          <div className="settings-field">
            <span>Icon set</span>
            <Select value={settings.iconTheme} options={iconOptions.map((item) => ({ value: item.id, label: item.label }))} onChange={(iconTheme) => update({ iconTheme })} label="Icon set" />
          </div>
          <Range label="Corner radius" value={settings.radius} min={0} max={32} suffix="px" onChange={(radius) => update({ radius })} />
          <Toggle label="Animations" checked={settings.motion} onChange={(motion) => update({ motion })} />
          <Toggle
            label="Use system reduced transparency"
            checked={settings.respectReducedTransparency}
            onChange={(respectReducedTransparency) => update({ respectReducedTransparency })}
          />
          <p className="settings-note">
            When off, Toph keeps the glass effect even if your operating system asks apps to reduce transparency.
          </p>
        </div>
      )}

      {category === "layout" && (
        <div className="settings-page">
          <PageTitle icon={LayoutPanelLeft}>Layout</PageTitle>
          <Range label="Sidebar width" value={settings.sidebarWidth} min={220} max={460} step={4} suffix="px" onChange={(sidebarWidth) => update({ sidebarWidth })} />
          <Range label="AI panel width" value={settings.aiPanelWidth} min={300} max={620} step={10} suffix="px" onChange={(aiPanelWidth) => update({ aiPanelWidth })} />
          <div className="settings-field">
            <span>Density</span>
            <Select value={settings.density} options={densityOptions.map((item) => ({ value: item.id, label: item.label }))} onChange={(density) => update({ density })} label="Density" />
          </div>
          <div className="settings-field">
            <span>Tab style</span>
            <Select value={settings.tabs} options={tabOptions.map((item) => ({ value: item.id, label: item.label }))} onChange={(tabs) => update({ tabs })} label="Tab style" />
          </div>
          <Toggle label="Confirm closing dirty tabs" checked={settings.confirmClose} onChange={(confirmClose) => update({ confirmClose })} />
        </div>
      )}

      {category === "editor" && (
        <div className="settings-page">
          <PageTitle icon={Type}>Editor</PageTitle>
          <Range label="Font size" value={settings.editorFontSize} min={11} max={20} suffix="px" onChange={(editorFontSize) => update({ editorFontSize })} />
          <Toggle label="Word wrap" checked={settings.wordWrap} onChange={(wordWrap) => update({ wordWrap })} />
          <Toggle label="Minimap" checked={settings.minimap} onChange={(minimap) => update({ minimap })} />
          <p className="settings-note">Editor autocomplete is configured in the AI section.</p>
        </div>
      )}

      {category === "terminal" && (
        <div className="settings-page">
          <PageTitle icon={TerminalSquare}>Terminal</PageTitle>
          <Range label="Font size" value={settings.terminalFontSize} min={10} max={18} step={0.5} suffix="px" onChange={(terminalFontSize) => update({ terminalFontSize })} />
          <Range label="Panel height" value={settings.terminalHeight} min={180} max={640} step={10} suffix="px" onChange={(terminalHeight) => update({ terminalHeight })} />
        </div>
      )}

      {category === "ai" && <AiSettings />}
      {category === "workspace" && <WorkspaceSettings />}

      {category === "git" && (
        <div className="settings-page">
          <PageTitle icon={GitBranch}>Git</PageTitle>
          <form className="settings-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              Branch pattern
              <input
                value={settings.gitBranchPattern}
                onChange={(event) => update({ gitBranchPattern: event.target.value })}
                placeholder="feature/{datetime}"
                spellCheck={false}
              />
            </label>
            <label>
              Commit message pattern
              <input
                value={settings.gitCommitPattern}
                onChange={(event) => update({ gitCommitPattern: event.target.value })}
                placeholder="chore: update {date}"
                spellCheck={false}
              />
            </label>
          </form>
          <p className="settings-note">
            Tokens: <code>{"{date}"}</code>, <code>{"{time}"}</code>, <code>{"{datetime}"}</code>,{" "}
            <code>{"{repo}"}</code>, <code>{"{branch}"}</code>, <code>{"{user}"}</code>,{" "}
            <code>{"{task}"}</code>, <code>{"{slug}"}</code> and <code>{"{summary}"}</code>.
            Branch and commit suggestions are generated from the changed files by AI, then applied to these patterns.
          </p>
        </div>
      )}

      {category === "server" && (
        <div className="settings-page">
          <PageTitle icon={Server}>Server</PageTitle>
          <form className="settings-form" onSubmit={(event) => void changeServer(event)}>
            <label>
              Server URL
              <input
                value={serverDraft}
                onChange={(event) => setServerDraft(event.target.value)}
                placeholder="https://seu-servidor"
                autoComplete="url"
              />
            </label>
            <Button className="ghost small" disabled={serverBusy || !serverDraft.trim()}>
              {serverBusy ? "Checking..." : "Apply and reconnect"}
            </Button>
          </form>
          <p className="settings-note">
            The URL is stored only in this browser. Changing it signs you out of the current server.
          </p>
        </div>
      )}

    </div>
  );
}
