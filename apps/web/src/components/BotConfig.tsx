import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Check, ChevronDown, PlugZap, Settings2, Trash2, UserRound, Wrench } from "@toph/icons";
import { OpenCode } from "@opencode/client";
import { openCodeBase, api, type EmailAccount } from "../api";
import type { ChatToph } from "../chats";
import { useChats } from "../chats";
import type { BotAvatar as BotAvatarShape } from "../bots";
import { BOT_AVATAR_LABELS, BOT_AVATARS } from "../bots";
import { modelDisplay, modelTitle, useAI } from "../ai";
import BotAvatar from "./BotAvatar";
import AiConnectionsPanel from "./AiConnectionsPanel";
import McpPanel from "./McpPanel";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";
import { Textarea } from "@/boardui/base/textarea/textarea";
import { Switch } from "@/boardui/base/switch/switch";
import { Select, SelectItem } from "@/boardui/base/select/select";
import ModelPicker from "../ui/ModelPicker";
import ComposerMenu from "../ui/ComposerMenu";
import ColorPicker from "../ui/ColorPicker";
import { useConfirm } from "../ui/confirm";

interface Props {
  projectId: string;
  projectRoot?: string;
  bot: ChatToph;
}

const AVATARS: Array<{ id: BotAvatarShape; label: string }> = BOT_AVATARS.map((id) => ({
  id,
  label: BOT_AVATAR_LABELS[id],
}));

const LANGUAGES = [
  { id: "auto", label: "Detectar automaticamente" },
  { id: "pt", label: "Português" },
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
] as const;

type ConfigSection = "profile" | "model" | "tools";


export default function BotConfig({ projectId, projectRoot, bot }: Props) {
  const updateToph = useChats((state) => state.updateToph);
  const removeToph = useChats((state) => state.removeToph);
  const discardMessageWrites = useChats((state) => state.discardMessageWrites);
  const aiConfig = useAI((state) => state.config);
  const models = useAI((state) => state.models);
  const loadModels = useAI((state) => state.loadModels);
  const effectiveModel = bot.model || aiConfig?.model || models[0]?.id || "";
  const selectedModel = models.find((model) => model.id === effectiveModel);
  const confirm = useConfirm();
  const [section, setSection] = useState<ConfigSection>("profile");
  const [manageMcps, setManageMcps] = useState(false);
  const [mcpServers, setMcpServers] = useState<string[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);

  const client = useMemo(() => {
    const csrf = document.cookie.match(/(?:^|;\s*)toph_csrf=([^;]+)/)?.[1] ?? "";
    return OpenCode.make({ baseUrl: openCodeBase(), headers: { "X-Toph-CSRF": csrf } });
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.emailAccounts()
      .then((items) => { if (!cancelled) setEmailAccounts(items); })
      .catch(() => { if (!cancelled) setEmailAccounts([]); });
    return () => { cancelled = true; };
  }, []);

  const refreshMcpServers = useCallback(async () => {
    if (!projectRoot) {
      setMcpServers([]);
      return;
    }
    setMcpLoading(true);
    try {
      const result = await client.mcp.list({ location: { directory: projectRoot } } as never);
      setMcpServers(((result as unknown as { data?: Array<{ name: string }> }).data ?? []).map((server) => server.name));
    } catch {
      setMcpServers([]);
    } finally {
      setMcpLoading(false);
    }
  }, [client, projectRoot]);

  useEffect(() => {
    void refreshMcpServers();
  }, [refreshMcpServers]);

  useEffect(() => {
    if (section === "model" && models.length === 0) void loadModels();
  }, [loadModels, models.length, section]);

  useEffect(() => {
    setSection("profile");
    setManageMcps(false);
  }, [bot.id]);

  function toggleMcp(name: string) {
    const current = bot.mcpServers ?? [];
    update({ mcpServers: current.includes(name) ? current.filter((item) => item !== name) : [...current, name] });
  }

  function toggleEmail(id: string) {
    const current = bot.emailAccountIds ?? [];
    update({ emailAccountIds: current.includes(id) ? current.filter((item) => item !== id) : [...current, id] });
  }

  function update(patch: Partial<ChatToph>) {
    updateToph(projectId, bot.id, patch);
  }

  async function remove() {
    const ok = await confirm({
      title: "Remover Toph?",
      message: `Remover ${bot.name} deste chat e apagar as mensagens dele?`,
      confirmLabel: "Remover Toph",
      danger: true,
    });
    if (ok) {
      if (bot.sessionId) await api.interruptOpencodeSession(bot.sessionId).catch(() => undefined);
      discardMessageWrites(projectId, bot.chatId);
      await api.deleteWorkspaceMessages(projectId, { mode: "chat", channel: bot.chatId, botId: bot.id }).catch(() => undefined);
      removeToph(projectId, bot.id);
    }
  }

  const selectedModelInfo = selectedModel ?? (effectiveModel
    ? { id: effectiveModel, label: effectiveModel.split("/").pop() ?? effectiveModel }
    : undefined);
  const sections: Array<{ id: ConfigSection; label: string; description: string; icon: typeof UserRound }> = [
    { id: "profile", label: "Perfil", description: "Identidade e comportamento", icon: UserRound },
    { id: "model", label: "Modelo", description: "Provedores e execução", icon: Settings2 },
    { id: "tools", label: "Ferramentas", description: "MCPs e email", icon: Wrench },
  ];

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center gap-3 rounded-2xl border border-border-button-white bg-background-secondary-default p-3">
        <BotAvatar bot={bot} size={46} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-medium text-text-primary">{bot.name}</p>
          <p className="truncate text-caption-1-regular text-text-secondary">@{bot.handle}</p>
          <p className="mt-1 truncate text-caption-2-regular text-accent-600" title={modelTitle(selectedModelInfo)}>
            {modelDisplay(selectedModelInfo)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <span className="rounded-full bg-background-tertiary-default px-2 py-0.5 text-caption-2-semibold text-text-secondary">{bot.role}</span>
          {bot.coordinator && <span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-caption-2-semibold text-accent-600">Coordena</span>}
        </div>
      </div>

      <div role="tablist" aria-label="Configuração do Toph" className="grid grid-cols-3 gap-1 rounded-2xl bg-background-secondary-default p-1">
        {sections.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSection(item.id)}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-2 text-center transition-[background-color,color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] ${active ? "bg-background-primary-default text-text-primary shadow-xs" : "text-text-secondary hover:bg-background-primary-hover"}`}
            >
              <Icon size={15} />
              <span className="truncate text-caption-1-semibold">{item.label}</span>
              <span className="hidden truncate text-[10px] text-text-tertiary sm:block">{item.description}</span>
            </button>
          );
        })}
      </div>

      {section === "profile" ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-accent-500/25 bg-accent-500/5 p-3">
            <p className="text-body-medium text-text-primary">Identidade do Toph</p>
            <p className="mt-1 text-caption-1-regular text-text-secondary">Defina o papel, a personalidade e a forma como este agente responde.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-caption-1-medium text-text-secondary">Nome</span>
              <Input value={bot.name} onChange={(value) => update({ name: value })} aria-label="Nome do bot" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption-1-medium text-text-secondary">Rótulo</span>
              <Input value={bot.role} onChange={(value) => update({ role: value })} aria-label="Rótulo do bot" placeholder="Design, Marketing, Produto..." />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-caption-1-medium text-text-secondary">Descrição</span>
            <Textarea value={bot.description} onChange={(value) => update({ description: value })} rows={3} aria-label="Descrição do bot" placeholder="O que este bot faz?" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption-1-medium text-text-secondary">Personalidade</span>
            <Textarea value={bot.personality} onChange={(value) => update({ personality: value })} rows={3} aria-label="Personalidade do Toph" placeholder="Como este Toph pensa e responde?" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption-1-medium text-text-secondary">Prompt do Toph</span>
            <Textarea value={bot.prompt} onChange={(value) => update({ prompt: value })} rows={5} aria-label="Prompt do Toph" placeholder="Instruções permanentes deste Toph. Se vazio, o papel e a personalidade acima são usados." />
            <span className="text-caption-2-regular text-text-tertiary">Este prompt é enviado junto com o histórico do chat.</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption-1-medium text-text-secondary">Idioma</span>
            <Select
              selectedKey={bot.language}
              onSelectionChange={(key) => update({ language: String(key) as ChatToph["language"] })}
              aria-label="Idioma do bot"
              className="w-full"
            >
              {LANGUAGES.map((language) => <SelectItem key={language.id} id={language.id}>{language.label}</SelectItem>)}
            </Select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-caption-1-medium text-text-secondary">Cor</span>
              <ColorPicker value={bot.color} onChange={(color) => update({ color })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-caption-1-medium text-text-secondary">Forma</span>
              <div className="flex flex-wrap gap-1.5">
                {AVATARS.map((avatar) => (
                  <button
                    key={avatar.id}
                    type="button"
                    aria-label={avatar.label}
                    aria-pressed={bot.avatar === avatar.id}
                    onClick={() => update({ avatar: avatar.id })}
                    className="rounded-xl border border-border-button-default p-1 transition-[background-color,border-color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-background-primary-hover active:scale-[0.95]"
                  >
                    <BotAvatar bot={{ ...bot, avatar: avatar.id }} size={28} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border-button-default px-2.5 py-2">
              <span className="flex flex-col">
                <span className="text-caption-1-medium text-text-primary">Coordenador</span>
                <span className="text-caption-2-regular text-text-secondary">Distribui o trabalho.</span>
              </span>
              <Switch isSelected={bot.coordinator} onChange={(checked) => update({ coordinator: checked })} size="sm" />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border-button-default px-2.5 py-2">
              <span className="flex flex-col">
                <span className="text-caption-1-medium text-text-primary">Notificações</span>
                <span className="text-caption-2-regular text-text-secondary">Avisar ao terminar.</span>
              </span>
              <Switch isSelected={bot.notifications} onChange={(checked) => update({ notifications: checked })} size="sm" />
            </div>
          </div>
        </div>
      ) : null}

      {section === "model" ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-accent-500/25 bg-accent-500/5 p-3">
            <div className="flex items-center gap-2 text-body-medium text-text-primary"><Settings2 size={16} className="text-accent-500" /> Modelo e provedor deste Toph</div>
            <p className="mt-1 text-caption-1-regular text-text-secondary">Conecte uma conta por API key ou navegador e escolha exatamente qual modelo este Toph deve usar.</p>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default p-3">
            <div>
              <p className="text-body-medium text-text-primary">Modelo selecionado</p>
              <p className="mt-1 text-caption-1-regular text-text-secondary">Os modelos ficam separados por provedor para evitar confundir OpenCode, OpenAI e Codex.</p>
            </div>
            <ModelPicker
              models={models}
              model={effectiveModel}
              onModelChange={(value) => update({ model: value })}
              effort={bot.effort ?? ""}
              efforts={selectedModel?.variants ?? []}
              onEffortChange={(value) => update({ effort: value })}
              fullWidth
            />
            <p className="truncate text-caption-2-regular text-text-tertiary" title={modelTitle(selectedModelInfo)}>
              Em uso: <span className="text-text-secondary">{modelDisplay(selectedModelInfo)}</span>
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-caption-1-medium text-text-secondary">Modo do agente</span>
              <ComposerMenu
                label="Modo do agente"
                trigger={<><span>{bot.agentMode === "plan" ? "Plano" : "Build"}</span><ChevronDown size={12} className="size-3 text-foreground-icon-tertiary" /></>}
                triggerClassName="h-9 w-full justify-start border border-border-button-default bg-background-primary-default px-2.5"
                popoverClassName="w-[300px] p-0"
                contentClassName="flex flex-col gap-1 p-1.5"
              >
                {(close) => (
                  <>
                    <button type="button" onClick={() => { update({ agentMode: "build" }); close(); }} className="flex w-full items-center rounded-lg px-2 py-2 text-start text-body-2-regular text-text-primary transition-[background-color,color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-background-secondary-hover active:scale-[0.98]">Build</button>
                    <button type="button" onClick={() => { update({ agentMode: "plan" }); close(); }} className="flex w-full items-center rounded-lg px-2 py-2 text-start text-body-2-regular text-text-primary transition-[background-color,color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-background-secondary-hover active:scale-[0.98]">Plano</button>
                  </>
                )}
              </ComposerMenu>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption-1-medium text-text-secondary">Permissões</span>
              <ComposerMenu
                label="Permissões"
                trigger={<><span>{bot.permissionMode === "ask" ? "Perguntar" : "YOLO"}</span><ChevronDown size={12} className="size-3 text-foreground-icon-tertiary" /></>}
                triggerClassName="h-9 w-full justify-start border border-border-button-default bg-background-primary-default px-2.5"
                popoverClassName="w-[300px] p-0"
                contentClassName="flex flex-col gap-1 p-1.5"
              >
                {(close) => (
                  <>
                    <button type="button" onClick={() => { update({ permissionMode: "yolo" }); close(); }} className="flex w-full items-center rounded-lg px-2 py-2 text-start text-body-2-regular text-text-primary transition-[background-color,color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-background-secondary-hover active:scale-[0.98]">YOLO</button>
                    <button type="button" onClick={() => { update({ permissionMode: "ask" }); close(); }} className="flex w-full items-center rounded-lg px-2 py-2 text-start text-body-2-regular text-text-primary transition-[background-color,color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-background-secondary-hover active:scale-[0.98]">Perguntar</button>
                  </>
                )}
              </ComposerMenu>
            </label>
          </div>
          <div className="rounded-2xl border border-border-button-default p-3">
            <div className="mb-3 flex items-center gap-2">
              <PlugZap size={15} className="text-accent-500" />
              <div>
                <p className="text-body-medium text-text-primary">Contas e provedores</p>
                <p className="text-caption-2-regular text-text-secondary">OpenAI, Claude, OpenCode e outros.</p>
              </div>
            </div>
            <AiConnectionsPanel projectRoot={projectRoot} onConnectionsChanged={() => void loadModels()} />
          </div>
        </div>
      ) : null}

      {section === "tools" ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-accent-500/25 bg-accent-500/5 p-3">
            <div className="flex items-center gap-2 text-body-medium text-text-primary"><Wrench size={16} className="text-accent-500" /> Ferramentas deste Toph</div>
            <p className="mt-1 text-caption-1-regular text-text-secondary">Gerencie os servidores MCP e marque quais ferramentas ficam disponíveis para este agente.</p>
          </div>
          <div className="flex flex-col gap-2 rounded-2xl border border-border-button-default bg-background-secondary-default p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-body-medium text-text-primary">MCPs habilitados</p>
                <p className="mt-1 text-caption-2-regular text-text-secondary">A seleção é exclusiva deste Toph.</p>
              </div>
              <Button type="button" variant="secondary" size="xs" leadingIcon={Wrench} onClick={() => setManageMcps((value) => !value)}>
                {manageMcps ? "Fechar gerenciador" : "Gerenciar MCPs"}
              </Button>
            </div>
            {mcpLoading ? <span className="text-caption-2-regular text-text-tertiary">Carregando MCPs...</span> : null}
            {!mcpLoading && mcpServers.length === 0 ? <span className="text-caption-2-regular text-text-tertiary">Nenhum MCP configurado ainda.</span> : null}
            {mcpServers.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {mcpServers.map((server) => {
                  const selected = (bot.mcpServers ?? []).includes(server);
                  return (
                    <button key={server} type="button" aria-pressed={selected} onClick={() => toggleMcp(server)} className={`flex items-center gap-1 rounded-full border px-2 py-1 text-caption-2-medium transition-[background-color,border-color,color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] ${selected ? "border-accent-500/40 bg-accent-500/10 text-accent-600" : "border-border-button-default text-text-secondary hover:bg-background-primary-hover"}`}>
                      {selected ? <Check size={11} /> : null}{server}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          {manageMcps ? <McpPanel projectRoot={projectRoot} onChanged={refreshMcpServers} /> : null}

          <div className="flex flex-col gap-2 rounded-2xl border border-border-button-default bg-background-secondary-default p-3">
            <div>
              <p className="text-body-medium text-text-primary">Email deste Toph</p>
              <p className="mt-1 text-caption-2-regular text-text-secondary">Defina quais caixas de email este agente pode acessar.</p>
            </div>
            {emailAccounts.length === 0 ? <span className="text-caption-2-regular text-text-tertiary">Nenhuma conta conectada. Configure uma conta em IA → Email.</span> : null}
            {emailAccounts.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {emailAccounts.map((account) => {
                  const selected = (bot.emailAccountIds ?? []).includes(account.id);
                  return (
                    <button key={account.id} type="button" aria-pressed={selected} onClick={() => toggleEmail(account.id)} className={`flex items-center gap-1 rounded-full border px-2 py-1 text-caption-2-medium transition-[background-color,border-color,color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] ${selected ? "border-accent-500/40 bg-accent-500/10 text-accent-600" : "border-border-button-default text-text-secondary hover:bg-background-primary-hover"}`}>
                      {selected ? <Check size={11} /> : null}{account.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <Button type="button" variant="ghost" size="small" leadingIcon={Trash2} className="justify-start text-status-rose-text" onClick={() => void remove()}>
        Remover Toph do chat
      </Button>
      <p className="flex items-center gap-1 text-caption-2-regular text-text-tertiary"><Bot size={11} /> As alterações são aplicadas nas próximas respostas.</p>
    </div>
  );
}
